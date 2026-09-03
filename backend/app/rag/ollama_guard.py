"""
ollama_guard.py — Shared Ollama concurrency gate.

WHY THIS EXISTS
---------------
Ollama runs on a single GPU. Loading two models simultaneously (e.g. the chat
model during inference AND the embed model during document ingestion) will
exhaust VRAM and cause a CUDA OOM crash during prompt prefill.

Previously, chat.py and upload.py each had their own independent locks
(_ollama_semaphore and ingestion_lock). Because they were separate, a chat
stream and a file upload could run at the same time, causing Ollama to try
loading both gemma2:2b (~1.1 GB) and nomic-embed-text (~274 MB) simultaneously
— there is no room for both on a 4 GB WDDM-managed card.

THE FIX
-------
A single process-wide asyncio.Semaphore(1) imported by both chat.py and
upload.py. Whichever operation starts first holds the semaphore; the other
waits. Because Ollama uses keep_alive=0 on both models, VRAM is freed as soon
as each request finishes, so the wait is at most a few seconds.

USAGE
-----
    from app.rag.ollama_guard import ollama_semaphore

    async with ollama_semaphore:
        # call Ollama here (inference or embedding)
"""

import asyncio

# Limit to 1 concurrent Ollama operation across the entire process.
# This covers both chat inference (chat.py) and document embedding (upload.py).
ollama_semaphore = asyncio.Semaphore(1)
