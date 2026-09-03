import json
import asyncio
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from typing import Optional, List
from app.agents.tutor import invoke_agent_stream
from app.rag.ollama_guard import ollama_semaphore

router = APIRouter()

# ollama_semaphore is imported from app.rag.ollama_guard — it is shared with
# upload.py so that chat inference and document embedding (ingest) never load
# two Ollama models into VRAM simultaneously. See ollama_guard.py for details.

class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=4000)
    chat_history: List[List[str]] = Field(default_factory=list)
    filename: Optional[str] = None
    mode: str = "ollama"  # "ollama" | "gemini"
    api_key: Optional[str] = None

@router.post("/chat")
async def chat_with_tutor(request: ChatRequest):
    print(
        f"[Chat] New request — mode={request.mode}, "
        f"filename={request.filename!r}, "
        f"message_len={len(request.message)}, "
        f"history_turns={len(request.chat_history)}"
    )

    async def event_generator():
        try:
            loop = asyncio.get_running_loop()

            def run_stream():
                return invoke_agent_stream(
                    message=request.message,
                    chat_history=request.chat_history,
                    filename=request.filename,
                    mode=request.mode,
                    api_key=request.api_key,
                )

            # Use a background thread to iterate the sync generator and feed an async queue
            queue: asyncio.Queue = asyncio.Queue()
            SENTINEL = object()
            ERROR_SENTINEL = object()

            def producer():
                try:
                    for chunk in run_stream():
                        loop.call_soon_threadsafe(queue.put_nowait, chunk)
                    print("[Chat] Stream completed successfully.")
                except Exception as exc:
                    print(f"[Chat] ERROR in producer thread: {exc}")
                    loop.call_soon_threadsafe(queue.put_nowait, (ERROR_SENTINEL, exc))
                finally:
                    loop.call_soon_threadsafe(queue.put_nowait, SENTINEL)

            # Gate Ollama inference; Gemini is a remote API with its own limits.
            if request.mode == "ollama":
                async with ollama_semaphore:
                    loop.run_in_executor(None, producer)
                    while True:
                        item = await queue.get()
                        if item is SENTINEL:
                            yield f"data: {json.dumps({'done': True})}\n\n"
                            break
                        elif isinstance(item, tuple) and item[0] is ERROR_SENTINEL:
                            error_msg = str(item[1])
                            print(f"[Chat] Sending error to client: {error_msg}")
                            yield f"data: {json.dumps({'error': error_msg})}\n\n"
                            break
                        else:
                            yield f"data: {json.dumps({'chunk': item})}\n\n"
            else:
                # Gemini — no semaphore, direct execution
                loop.run_in_executor(None, producer)
                while True:
                    item = await queue.get()
                    if item is SENTINEL:
                        yield f"data: {json.dumps({'done': True})}\n\n"
                        break
                    elif isinstance(item, tuple) and item[0] is ERROR_SENTINEL:
                        error_msg = str(item[1])
                        print(f"[Chat] Sending error to client: {error_msg}")
                        yield f"data: {json.dumps({'error': error_msg})}\n\n"
                        break
                    else:
                        yield f"data: {json.dumps({'chunk': item})}\n\n"

        except Exception as e:
            print(f"[Chat] Unexpected outer error in event_generator: {e}")
            yield f"data: {json.dumps({'error': str(e)})}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
