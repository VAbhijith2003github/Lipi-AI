import threading

from langchain_core.messages import SystemMessage, HumanMessage, AIMessage
from langchain_core.output_parsers import StrOutputParser
from langchain_ollama import ChatOllama

from app.config import OLLAMA_BASE_URL, OLLAMA_CHAT_MODEL, OLLAMA_NUM_CTX, OLLAMA_NUM_GPU, GEMINI_API_KEY
from app.rag.retriever import retrieve_context
from app.trace import session_tracer

# ---------------------------------------------------------------------------
# LLM Singletons
# ---------------------------------------------------------------------------
_ollama_llm: ChatOllama | None = None
_ollama_model: str | None = None
_ollama_lock = threading.Lock()

def _get_ollama_llm(force_cpu: bool = False) -> ChatOllama:
    global _ollama_llm, _ollama_model
    target_num_gpu = 0 if force_cpu else OLLAMA_NUM_GPU
    # Double-checked locking: outer read is cheap (no lock), but we re-check
    # *inside* the lock before creating the instance. This prevents two
    # concurrent callers from both seeing None and each allocating a ChatOllama
    # (and requesting VRAM) simultaneously.
    if _ollama_llm is None or _ollama_model != OLLAMA_CHAT_MODEL or force_cpu:
        with _ollama_lock:
            if _ollama_llm is None or _ollama_model != OLLAMA_CHAT_MODEL or force_cpu:
                _ollama_llm = ChatOllama(
                    model=OLLAMA_CHAT_MODEL,
                    base_url=OLLAMA_BASE_URL,
                    temperature=0.0,
                    num_ctx=OLLAMA_NUM_CTX,
                    num_gpu=target_num_gpu,
                    repeat_penalty=1.2,
                    top_p=0.1,
                    keep_alive=0,
                )
                _ollama_model = OLLAMA_CHAT_MODEL
    return _ollama_llm

_gemini_clients: dict[str, any] = {}
_gemini_lock = threading.Lock()

def _get_gemini_llm(api_key: str):
    key = api_key if api_key else GEMINI_API_KEY
    if not key:
        raise ValueError("Google API key is required for Gemini mode.")
    
    if key in _gemini_clients:
        return _gemini_clients[key]
    
    with _gemini_lock:
        if key not in _gemini_clients:
            from langchain_google_genai import ChatGoogleGenerativeAI
            _gemini_clients[key] = ChatGoogleGenerativeAI(
                model="gemini-3.6-flash",
                google_api_key=key,
                temperature=0.0,
                max_output_tokens=4096,
            )
    return _gemini_clients[key]

# ---------------------------------------------------------------------------
# Prompt builder
# ---------------------------------------------------------------------------
def _build_messages(context: str, message: str, chat_history: list = None, system_prompt_override: str = None) -> list:
    messages = []
    
    if system_prompt_override:
        sys_text = system_prompt_override.replace("{context}", context)
        messages.append(SystemMessage(content=sys_text))
        if chat_history:
            for role, content in chat_history:
                if role == "assistant":
                    messages.append(AIMessage(content=content))
                else:
                    messages.append(HumanMessage(content=content))
        messages.append(HumanMessage(content=message))
    else:
        sys_text = (
            "You are a precise document analysis assistant. Your only job is to answer the user's "
            "question based strictly on the provided document context. Do not invent, assume, or "
            "extrapolate any fact. If information is not present in the context, say exactly: "
            "\"This information is not present in the provided document.\""
            "\n\nPay attention to the [Page X | Section: Y] headers in the context to understand the document structure."
        )
        messages.append(SystemMessage(content=sys_text))
        
        if chat_history:
            for role, content in chat_history:
                if role == "assistant":
                    messages.append(AIMessage(content=content))
                else:
                    messages.append(HumanMessage(content=content))
                    
        user_prompt = (
            f"Context information is below.\n"
            f"---------------------\n"
            f"{context}\n"
            f"---------------------\n"
            f"Given the context information and no prior knowledge, answer the user's query.\n\n"
            f"Query: {message}"
        )
        messages.append(HumanMessage(content=user_prompt))
        
    return messages

# ---------------------------------------------------------------------------
# Agent entry points
# ---------------------------------------------------------------------------
def invoke_agent_stream(
    message: str,
    chat_history: list = None,
    system_prompt_override: str = None,
    filename: str = None,
    mode: str = "ollama",
    api_key: str = None,
):
    with session_tracer.log_event("agent.retrieve_context", filename=filename, mode=mode) as ev:
        context = retrieve_context(message, filename=filename, mode=mode, api_key=api_key)
        ev["context_len"] = len(context)

    if context:
        print(f"[Agent] Context retrieved — {len(context)} chars for '{filename}'.")
    else:
        print(f"[Agent] No context found for '{filename}' — LLM will respond without document context.")

    messages = _build_messages(context, message, chat_history, system_prompt_override)
    full_response = []

    try:
        if mode == "gemini":
            print("[Agent] Streaming with Gemini 3.6 Flash (LangChain)")
            llm = _get_gemini_llm(api_key)
            model_name = "gemini-3.6-flash"
        else:
            print(f"[Agent] Streaming with local Ollama ({OLLAMA_CHAT_MODEL})")
            llm = _get_ollama_llm()
            model_name = OLLAMA_CHAT_MODEL
            
        session_tracer.start_event(
            "agent.llm_invoke",
            mode=mode,
            model=model_name,
            filename=filename,
            streaming=True,
        )

        chain = llm | StrOutputParser()
        
        try:
            for chunk in chain.stream(messages):
                if chunk:
                    full_response.append(chunk)
                    yield chunk
        except Exception as oom_err:
            err_str = str(oom_err).lower()
            if mode == "ollama" and any(k in err_str for k in ["out of memory", "cuda", "alloc", "buffer", "terminated"]):
                print("[Agent] GPU OOM detected. Waiting 2 s for VRAM to clear, then retrying on CPU (num_gpu=0)...")
                import time
                time.sleep(2)  # Give Ollama time to release VRAM after the failed request

                # Truncate the context in the messages to reduce prefill pressure.
                # Replace the last HumanMessage content with a trimmed version if it
                # contains a large context block (indicated by the separator line).
                truncated_messages = messages.copy()
                last_human = truncated_messages[-1]
                if hasattr(last_human, 'content') and '---------------------' in last_human.content:
                    parts = last_human.content.split('---------------------')
                    if len(parts) >= 3:
                        # Keep only the first 600 chars of context to fit in CPU KV-cache
                        trimmed_ctx = parts[1].strip()[:600]
                        truncated_messages[-1] = type(last_human)(
                            content=f"{parts[0]}---------------------\n{trimmed_ctx}\n[Context truncated for CPU fallback]\n---------------------{parts[2]}"
                        )

                llm = _get_ollama_llm(force_cpu=True)
                chain = llm | StrOutputParser()
                full_response.clear()
                for chunk in chain.stream(truncated_messages):
                    if chunk:
                        full_response.append(chunk)
                        yield chunk
            else:
                raise oom_err

        session_tracer.end_event(
            "agent.llm_invoke",
            status="ok",
            response_len=len("".join(full_response)),
        )

    except Exception as e:
        session_tracer.end_event("agent.llm_invoke", status="error", error=str(e))
        err_msg = str(e).lower()
        if mode == "gemini":
            if "429" in err_msg or "quota" in err_msg or "exhausted" in err_msg:
                raise RuntimeError("Gemini API rate limit or quota exceeded.") from e
            elif "api key" in err_msg or "400" in err_msg or "invalid" in err_msg:
                raise ValueError("Invalid Gemini API key or Token limit exceeded.") from e
            raise RuntimeError(f"Gemini API error: {e}") from e
        else:
            if "out of memory" in err_msg or "cuda" in err_msg or "alloc" in err_msg:
                raise RuntimeError("Your GPU ran out of memory (VRAM) while loading Ollama.") from e
            elif "connection" in err_msg or "refused" in err_msg or "11434" in err_msg:
                raise ConnectionError(f"Ollama is unreachable on {OLLAMA_BASE_URL}.") from e
            elif "not found" in err_msg or "404" in err_msg:
                raise NameError(f"Ollama model '{OLLAMA_CHAT_MODEL}' was not found. Run `ollama pull {OLLAMA_CHAT_MODEL}`") from e
            raise RuntimeError(f"Ollama Q&A error: {e}") from e

def invoke_agent(
    message: str,
    chat_history: list = None,
    system_prompt_override: str = None,
    filename: str = None,
    mode: str = "ollama",
    api_key: str = None,
) -> str:
    return "".join(
        invoke_agent_stream(
            message=message,
            chat_history=chat_history,
            system_prompt_override=system_prompt_override,
            filename=filename,
            mode=mode,
            api_key=api_key,
        )
    )
