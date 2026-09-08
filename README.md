# RAG Doc Assistant

Interface web pour interroger une documentation en ligne en langage naturel.
On colle l'URL d'une doc, l'application la crawle et l'indexe, puis répond aux questions en s'appuyant uniquement sur son contenu, avec les sources citées.

Projet personnel, réalisé pour comprendre concrètement comment fonctionne un pipeline RAG de bout en bout.

## Pipeline

```
URL de la documentation
  │
  ├─ Crawl          RecursiveUrlLoader, profondeur configurable, restreint au domaine
  ├─ Nettoyage      BeautifulSoup retire script, style, nav, header, footer
  ├─ Découpage      RecursiveCharacterTextSplitter — chunks de 1000, chevauchement de 150
  ├─ Embeddings     sentence-transformers/all-MiniLM-L6-v2, calculés en local
  └─ Indexation     ChromaDB, persisté dans ./chroma_db
                                │
Question ────────────────────────┤
  ├─ Retrieval      recherche par similarité, les 4 chunks les plus proches
  ├─ Prompt         contexte + question, avec consigne de ne pas inventer
  ├─ LLM            Llama 3.3 70B via l'API Groq, température 0.2
  └─ Réponse        texte + liste des URLs sources
```

L'indexation est renvoyée au navigateur en streaming (Server-Sent Events), pour afficher l'avancement étape par étape.

## Fonctionnalités

- Indexation d'une documentation à partir d'une simple URL, avec profondeur de crawl réglable
- Progression en direct pendant l'indexation (pages chargées, nombre de chunks, embeddings)
- Questions/réponses sur la doc indexée, avec les sources renvoyées
- Le modèle indique franchement quand la réponse n'est pas dans le contexte
- Réinitialisation de l'index depuis l'interface

## Stack

| Rôle | Technologie |
|---|---|
| Serveur web | Flask |
| Orchestration RAG | LangChain |
| Base vectorielle | ChromaDB (locale, persistée) |
| Embeddings | HuggingFace `all-MiniLM-L6-v2`, exécutés en local |
| LLM | Llama 3.3 70B via l'API Groq |
| Parsing HTML | BeautifulSoup, lxml |

Les embeddings tournent sur la machine : seule la génération de la réponse passe par une API externe.

## Installation

```bash
git clone https://github.com/carls-xyz/RAG.git
cd RAG

pip3 install -r requirements.txt

cp .env.example .env
# Ouvre .env et remplace gsk_... par ta clé Groq (console.groq.com)

python3 app.py
```

L'application démarre sur http://localhost:5000

Le premier lancement télécharge le modèle d'embeddings (environ 90 Mo), ce qui prend quelques instants.

## Utilisation

1. Coller l'URL d'une documentation, par exemple `https://flask.palletsprojects.com/en/stable/`
2. Choisir la profondeur de crawl — 2 est un bon compromis entre couverture et temps d'indexation
3. Cliquer sur **Indexer** et suivre la progression
4. Poser une question dans le chat, la réponse s'affiche avec les URLs utilisées

## API

| Méthode | Route | Rôle |
|---|---|---|
| `GET` | `/` | Interface web |
| `POST` | `/api/index` | Lance l'indexation d'une URL (réponse en streaming SSE) |
| `POST` | `/api/query` | Pose une question, renvoie la réponse et ses sources |
| `GET` | `/api/status` | Indique si une doc est indexée et si la clé Groq est configurée |
| `POST` | `/api/clear` | Supprime l'index vectoriel |

## Limites connues

- Un seul index à la fois : indexer une nouvelle documentation remplace la précédente
- Le crawl ne suit que les liens du même domaine et ne gère pas les pages rendues en JavaScript
- Pas encore de tests automatisés

## Sécurité

La clé Groq se met dans `.env`, qui est ignoré par Git. Le fichier `.env.example` ne contient qu'un placeholder. Le dossier `chroma_db/` est également ignoré.
