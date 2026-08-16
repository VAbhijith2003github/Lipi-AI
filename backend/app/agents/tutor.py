from langchain_ollama import ChatOllama
from google import genai
from google.genai import types
from app.config import OLLAMA_BASE_URL, OLLAMA_CHAT_MODEL, GEMINI_API_KEY
from app.rag.retriever import retrieve_context
import os




def _invoke_gemini(context: str, message: str, chat_history: list, api_key: str = None) -> str:
    """
    Call Gemini 3.6 Flash via the Google GenAI SDK using API key.
    Uses the new client model endpoint.
    """
    key = api_key if api_key else GEMINI_API_KEY
    client = genai.Client(api_key=key)

    system_instruction = (
        "You are a precise document analysis assistant. Your only job is to answer the user's "
        "question based strictly on the provided document context. Do not invent, assume, or "
        "extrapolate any fact. If information is not present in the context, say exactly: "
        "\"This information is not present in the provided document.\""
        f"\n\nDOCUMENT CONTEXT:\n{context}"
    )

    # Build multi-turn content history payload for generate_content
    contents = []
    if chat_history:
        for role, content in chat_history:
            genai_role = "model" if role == "assistant" else "user"
            contents.append(
                types.Content(
                    role=genai_role,
                    parts=[types.Part.from_text(text=content)]
                )
            )
    
    # Append final message
    contents.append(
        types.Content(
            role="user",
            parts=[types.Part.from_text(text=message)]
        )
    )

    try:
        response = client.models.generate_content(
            model='gemini-3.6-flash',
            contents=contents,
            config=types.GenerateContentConfig(
                system_instruction=system_instruction,
                temperature=0.0,
                max_output_tokens=4096,
            )
        )
        return response.text
    except Exception as e:
        err_msg = str(e)
        if "429" in err_msg or "quota" in err_msg.lower() or "exhausted" in err_msg.lower():
            raise RuntimeError(
                "Gemini API rate limit or quota exceeded. Please wait a moment or try again later. "
                "Error code: 429 (Resource Exhausted)."
            ) from e
        elif "api key" in err_msg.lower() or "400" in err_msg or "invalid" in err_msg.lower() or "key not" in err_msg.lower():
            if "limit" in err_msg.lower() or "token" in err_msg.lower() or "context" in err_msg.lower() or "exceeded" in err_msg.lower():
                raise ValueError(
                    "Token exceeded issue: The prompt context exceeds the Gemini model's token limit. "
                    "Please try a shorter query or clear chat history."
                ) from e
            else:
                raise ValueError(
                    "Invalid Gemini API key. Please check your API key settings or network connection."
                ) from e
        else:
            raise RuntimeError(f"Gemini API error: {err_msg}") from e



def _build_user_prompt(context: str, message: str) -> str:
    """
    Build the structured unified prompt for local Ollama Q&A.
    Uses a unified block layout to prevent safety refusals in small local models.
    """
    return (
        "### Document Text:\n"
        f"{context}\n\n"
        "### Task:\n"
        "Answer the user query below using only the document text provided above. "
        "Strictly adhere to these guidelines:\n"
        "1. Answer strictly using ONLY the provided document text facts. Do not assume, extrapolate, or invent.\n"
        "2. If the context does not explicitly mention the answer to the query, answer exactly: "
        "\"This information is not present in the provided document.\"\n"
        "3. Never invent any project, technology, skill, name, date, or experience.\n\n"
        f"### Query:\n{message}"
    )


def invoke_agent(
    message: str,
    chat_history: list = None,
    system_prompt_override: str = None,
    filename: str = None,
    mode: str = "ollama",
    api_key: str = None,
) -> str:
    """
    Invoke the AI assistant in either Ollama (local) or Gemini (cloud) mode.

    Args:
        message:                The user's question.
        chat_history:           Previous messages [[role, content], ...].
        system_prompt_override: Optional system prompt override.
        filename:               Active PDF filename to scope retrieval.
        mode:                   "ollama" | "gemini"
        api_key:                Optional custom Gemini API key.

    Returns:
        Model response string.
    """

    # 1. Retrieve relevant document chunks
    try:
        context = retrieve_context(message, filename=filename)
    except Exception as e:
        print(f"Error during retrieval: {e}")
        context = "No document context available."

    # 2. Gemini path — Google AI Studio API key
    if mode == "gemini":
        print("[Agent] Using Gemini 3.6 Flash (Google AI Studio)")
        return _invoke_gemini(context, message, chat_history or [], api_key=api_key)

    # 3. Ollama local path
    print(f"[Agent] Using local Ollama ({OLLAMA_CHAT_MODEL})")
    try:
        llm = ChatOllama(
            model=OLLAMA_CHAT_MODEL,
            base_url=OLLAMA_BASE_URL,
            temperature=0.0,
            num_ctx=8192,
            repeat_penalty=1.2,
            top_p=0.1,
        )

        if system_prompt_override:
            system_prompt = system_prompt_override.replace("{context}", context)
            messages = [("system", system_prompt)]
            if chat_history:
                for role, content in chat_history:
                    lc_role = "ai" if role == "assistant" else "human"
                    messages.append((lc_role, content))
            messages.append(("human", message))
        else:
            user_prompt = _build_user_prompt(context, message)
            messages = []
            if chat_history:
                for role, content in chat_history:
                    lc_role = "ai" if role == "assistant" else "human"
                    messages.append((lc_role, content))
            messages.append(("human", user_prompt))

        response = llm.invoke(messages)
        return response.content
    except Exception as e:
        err_msg = str(e)
        if "connection" in err_msg.lower() or "refused" in err_msg.lower() or "connect" in err_msg.lower() or "11434" in err_msg:
            raise ConnectionError(
                f"Ollama is not working or unreachable on {OLLAMA_BASE_URL}. "
                f"Please verify that the Ollama service is running locally. "
                f"You can start it by running `ollama serve` or opening the Ollama application."
            ) from e
        elif "not found" in err_msg.lower() or "404" in err_msg or "model" in err_msg.lower():
            raise NameError(
                f"Ollama model '{OLLAMA_CHAT_MODEL}' was not found. "
                f"Please open your terminal and run `ollama pull {OLLAMA_CHAT_MODEL}` to download it."
            ) from e
        else:
            raise RuntimeError(f"Ollama Q&A error: {err_msg}") from e
