# 📚 Lipi AI — Smart Document & Study Assistant

[![FastAPI](https://img.shields.io/badge/FastAPI-005571?style=for-the-badge&logo=fastapi)](https://fastapi.tiangolo.com)
[![React](https://img.shields.io/badge/React_19-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)](https://react.dev)
[![Electron](https://img.shields.io/badge/Electron-2B2E3A?style=for-the-badge&logo=electron&logoColor=9FEAF9)](https://www.electronjs.org/)
[![LangChain](https://img.shields.io/badge/LangChain-1C3C3C?style=for-the-badge&logo=langchain&logoColor=white)](https://www.langchain.com/)
[![ChromaDB](https://img.shields.io/badge/ChromaDB-FF6F61?style=for-the-badge)](https://www.trychroma.com/)
[![Ollama](https://img.shields.io/badge/Ollama-Local_LLMs-black?style=for-the-badge)](https://ollama.com/)

**Lipi AI** is a desktop application designed for contextual, hallucination-free document interaction and study assistance. Powered by **Retrieval-Augmented Generation (RAG)**, it enables you to upload PDF documents, browse them through an integrated viewer, and ask questions with high precision using either offline local LLMs via **Ollama** or cloud intelligence via **Google Gemini**.

---

## ✨ Features

- 📑 **Integrated PDF Workspace**: Side-by-side interactive document canvas with thumbnail navigation, zoom controls, and active page jump.
- 🔒 **Dual AI Execution Modes**:
  - **Local (Offline)**: 100% private, local document processing powered by Ollama (`llama3.2:1b` + `nomic-embed-text`).
  - **Cloud (Gemini)**: Fast, high-reasoning intelligence with Google AI Studio (`gemini-3.6-flash`).
- 🎯 **Strict Document Grounding**: Guardrail prompts ensure answers are directly retrieved from the document context without hallucinations.
- ⚡ **Persistent Vector Store**: Documents are ingested, chunked, and indexed into local **ChromaDB** collections for instant recall across sessions.
- 📐 **Rich Math & Code Support**: Full markdown rendering with **LaTeX** math equations via KaTeX and syntax-highlighted code blocks.

---

## 🏗️ Architecture

```mermaid
graph TD
    subgraph Frontend [Desktop UI]
        Electron[Electron Shell]
        React[React 19 + Vite]
        PDFViewer[PDF.js Canvas & Thumbnails]
        Electron --- React
        React --- PDFViewer
    end

    subgraph Backend [FastAPI Server]
        API[FastAPI Endpoints: /api/upload, /api/chat]
        RAG[RAG Pipeline: PyMuPDF / TextSplitter]
        Chroma[(ChromaDB Vector Store)]
        Agent[Tutor Agent]

        API --> RAG
        RAG --> Chroma
        API --> Agent
        Chroma -. Context .-> Agent
    end

    subgraph LLM Providers
        Agent -->|Local Mode| Ollama[Ollama Server]
        Agent -->|Cloud Mode| Gemini[Google GenAI / Gemini Flash]
    end

    React <--> |REST API| API
```

---

## 📋 Prerequisites

Ensure you have the following installed on your machine:

1. **Python**: Version 3.10+ ([Download Python](https://www.python.org/downloads/))
2. **Node.js**: Version 18+ & npm ([Download Node.js](https://nodejs.org/))
3. **Ollama** *(Optional for local mode)*: ([Download Ollama](https://ollama.com/))
   - Pull the recommended models:
     ```bash
     ollama pull llama3.2:1b
     ollama pull nomic-embed-text
     ```

---

## 🚀 Quickstart & Installation

### 1. Clone the Repository
```bash
git clone https://github.com/VAbhijith2003github/Lipi-AI.git
cd Lipi-AI
```

### 2. Backend Setup
```bash
cd backend
python -m venv venv

# Windows:
venv\Scripts\activate

# macOS / Linux:
# source venv/bin/activate

pip install -r requirements.txt
```

### 3. Frontend Setup
```bash
cd ../frontend
npm install
```

### 4. Environment Configuration
Copy `.env.example` to `.env` in either the root or `backend/` directory:
```bash
cp .env.example .env
```
Configure your settings:
```env
# Optional: Required only if using Google Gemini mode
GEMINI_API_KEY=your_gemini_api_key_here

# Ollama local settings (defaults)
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_CHAT_MODEL=llama3.2:1b
OLLAMA_EMBED_MODEL=nomic-embed-text
```

---

## 🏃 Running the Application

### Option A: One-Click Launcher (Windows)
Double-click `start_app.bat` or execute in terminal:
```cmd
start_app.bat
```

### Option B: Manual Execution

1. **Start FastAPI Backend**:
   ```bash
   cd backend
   venv\Scripts\activate
   python -m uvicorn app.main:app --reload --port 8000
   ```

2. **Start Electron App**:
   ```bash
   cd frontend
   npm run dev
   ```

---

## 📁 Repository Structure

```
Lipi-AI/
├── backend/
│   ├── app/
│   │   ├── agents/          # Agent orchestration & LLM handlers (tutor.py)
│   │   ├── rag/             # Document ingest, chunking, embeddings & retriever
│   │   ├── routes/          # API endpoints (/upload, /chat)
│   │   ├── config.py        # Centralized system configurations
│   │   └── main.py          # FastAPI application entry point
│   ├── chroma_db/           # Persistent vector database files
│   ├── uploads/             # Temporary file uploads
│   └── requirements.txt     # Python backend dependencies
│
├── frontend/
│   ├── electron/            # Electron main process & IPC preload bridge
│   ├── src/
│   │   ├── components/      # PDF Canvas rendering & thumbnail previews
│   │   ├── utils/           # Helper functions & error handlers
│   │   ├── App.jsx          # Main application UI & state management
│   │   └── index.css        # Custom styles & design tokens
│   ├── package.json         # Frontend dependencies & Electron scripts
│   └── vite.config.js       # Vite configuration
│
├── .env.example             # Example environment configuration
├── start_app.bat            # One-click startup script
└── README.md
```

---

## 📦 Building for Production

To package the Electron desktop application into a standalone executable:

```bash
cd frontend
npm run package:electron
```
The packaged binary will be generated inside `frontend/dist-electron/`.

---

## 📄 License

This project is licensed under the ISC License.
