# RAG Doc Assistant

Interface web pour interroger n'importe quelle documentation en langage naturel. Colle une URL, indexe la doc, pose tes questions.

## Stack

- **Flask** — serveur backend
- **LangChain** — orchestration RAG
- **ChromaDB** — base vectorielle locale
- **HuggingFace Embeddings** — embeddings en local
- **Groq API** — LLM (Llama 3.3 70B)

## Installation

```bash
# 1. Cloner le repo
git clone https://github.com/TON_USERNAME/rag-doc-assistant.git
cd rag-doc-assistant

# 2. Installer les dépendances
pip3 install -r requirements.txt

# 3. Configurer la clé Groq
cp .env
# Édite .env et remplace gsk_... par ta clé Groq

# 4. Lancer le serveur
python3 app.py
```

Ouvre ensuite http://localhost:5000 dans ton navigateur.

## Utilisation

1. Colle l'URL d'une documentation
2. Choisis la profondeur de crawl (2 recommandé)
3. Clique **Indexer**
4. Pose tes questions dans le chat

## Sécurité

- La clé Groq se met dans `.env`, jamais dans le code
- Le dossier `chroma_db/` est dans `.gitignore`
- Ne commite jamais ton `.env`
