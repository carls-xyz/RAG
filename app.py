"""
app.py — RAG Doc Assistant (Flask)
Usage : python3 app.py
"""

import os
import json
import shutil
from flask import Flask, render_template, request, jsonify, Response, stream_with_context
from langchain_community.document_loaders import RecursiveUrlLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_community.embeddings import HuggingFaceEmbeddings
from langchain_community.vectorstores import Chroma
from langchain_groq import ChatGroq
from langchain_core.prompts import PromptTemplate
from langchain_core.output_parsers import StrOutputParser
from langchain_core.runnables import RunnablePassthrough
from bs4 import BeautifulSoup
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)

CHROMA_DIR = "./chroma_db"
EMBED_MODEL = "sentence-transformers/all-MiniLM-L6-v2"
GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")

PROMPT_TEMPLATE = """Tu es un assistant expert en documentation technique.
Réponds de façon claire et concise, en te basant UNIQUEMENT sur le contexte fourni.
Si la réponse n'est pas dans le contexte, dis-le franchement.

Contexte :
{context}

Question : {question}

Réponse :"""


def clean_html(html):
    soup = BeautifulSoup(html, "html.parser")
    for tag in soup(["script", "style", "nav", "footer", "header"]):
        tag.decompose()
    return soup.get_text(separator=" ", strip=True)


def format_docs(docs):
    return "\n\n".join(doc.page_content for doc in docs)


def get_embeddings():
    return HuggingFaceEmbeddings(model_name=EMBED_MODEL)


@app.route("/")
def index():
    indexed = os.path.exists(CHROMA_DIR)
    groq_configured = bool(GROQ_API_KEY)
    return render_template("index.html", indexed=indexed, groq_configured=groq_configured)


@app.route("/api/index", methods=["POST"])
def index_doc():
    if not GROQ_API_KEY:
        return jsonify({"error": "Clé GROQ_API_KEY manquante dans le .env"}), 500

    data = request.json
    url = data.get("url", "").strip()
    depth = int(data.get("depth", 2))

    if not url:
        return jsonify({"error": "URL manquante"}), 400

    def generate():
        try:
            yield f"data: {json.dumps({'step': 'crawl', 'msg': 'Chargement des pages...'})}\n\n"

            loader = RecursiveUrlLoader(
                url=url, max_depth=depth,
                extractor=clean_html, prevent_outside=True
            )
            docs = loader.load()
            yield f"data: {json.dumps({'step': 'split', 'msg': f'{len(docs)} pages chargées — découpage...'})}\n\n"

            splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=150)
            chunks = splitter.split_documents(docs)
            yield f"data: {json.dumps({'step': 'embed', 'msg': f'{len(chunks)} chunks — génération des embeddings...'})}\n\n"

            embeddings = get_embeddings()
            Chroma.from_documents(documents=chunks, embedding=embeddings, persist_directory=CHROMA_DIR)

            yield f"data: {json.dumps({'step': 'done', 'msg': 'Indexation terminée', 'pages': len(docs), 'chunks': len(chunks)})}\n\n"

        except Exception as e:
            yield f"data: {json.dumps({'step': 'error', 'msg': str(e)})}\n\n"

    return Response(stream_with_context(generate()), mimetype="text/event-stream")


@app.route("/api/query", methods=["POST"])
def query():
    if not GROQ_API_KEY:
        return jsonify({"error": "Clé GROQ_API_KEY manquante dans le .env"}), 500

    data = request.json
    question = data.get("question", "").strip()

    if not question:
        return jsonify({"error": "Question manquante"}), 400
    if not os.path.exists(CHROMA_DIR):
        return jsonify({"error": "Aucune documentation indexée"}), 400

    try:
        embeddings = get_embeddings()
        vectorstore = Chroma(persist_directory=CHROMA_DIR, embedding_function=embeddings)
        retriever = vectorstore.as_retriever(search_kwargs={"k": 4})

        llm = ChatGroq(api_key=GROQ_API_KEY, model_name="llama-3.3-70b-versatile", temperature=0.2)
        prompt = PromptTemplate(template=PROMPT_TEMPLATE, input_variables=["context", "question"])

        chain = (
            {"context": retriever | format_docs, "question": RunnablePassthrough()}
            | prompt | llm | StrOutputParser()
        )

        answer = chain.invoke(question)
        source_docs = retriever.invoke(question)
        sources = list(set(doc.metadata.get("source", "") for doc in source_docs if doc.metadata.get("source")))

        return jsonify({"answer": answer, "sources": sources})

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/status", methods=["GET"])
def status():
    return jsonify({
        "indexed": os.path.exists(CHROMA_DIR),
        "groq_configured": bool(GROQ_API_KEY),
    })


@app.route("/api/clear", methods=["POST"])
def clear_index():
    if os.path.exists(CHROMA_DIR):
        shutil.rmtree(CHROMA_DIR)
    return jsonify({"ok": True})


if __name__ == "__main__":
    if not GROQ_API_KEY:
        print("⚠️  GROQ_API_KEY manquante — crée un fichier .env avec GROQ_API_KEY=gsk_...")
    app.run(debug=True, port=5000)