from langchain_ollama import ChatOllama
from app.config import OLLAMA_BASE_URL, OLLAMA_CHAT_MODEL
from app.rag.retriever import retrieve_context

def invoke_agent(message: str, chat_history: list = None, system_prompt_override: str = None) -> str:
    """
    Invoke the General AI Assistant with a message, previous chat history, and an optional custom system prompt.
    Retrieves context from uploaded documents and uses Ollama to generate a response.
    """
    # 1. Retrieve relevant study document chunks
    try:
        context = retrieve_context(message)
    except Exception as e:
        print(f"Error during retrieval: {e}")
        context = "No document context available."

    # 2. Initialize local ChatOllama LLM
    llm = ChatOllama(
        model=OLLAMA_CHAT_MODEL,
        base_url=OLLAMA_BASE_URL,
        temperature=0.0,
    )

    # 3. Build system instruction with context
    if system_prompt_override:
        system_prompt = system_prompt_override.replace("{context}", context)
    else:
        system_prompt = (
            "You are an expert, precise, and thorough local AI Assistant capable of analyzing any document type "
            "(legal contracts, technical specs, research papers, financial reports, articles, or resumes).\n\n"
            "CRITICAL OPERATIONAL RULES:\n"
            "1. COMPLETE EXTRACTION: When asked to retrieve, list, or summarize information, categories, clauses, specifications, or bullet points, you MUST include EVERY SINGLE relevant item present in the context. Never truncate, skip, or omit details.\n"
            "2. EXHAUSTIVE ATTENTION TO LISTS & DATA: If a category or section contains multiple items, terms, or parameters, list all of them in full without dropping any.\n"
            "3. STRICT DOCUMENT GROUNDING: Answer strictly using facts and information from the provided context. If an answer cannot be found in the context, state clearly that the detail is not covered in the document.\n"
            "4. CLEAR STRUCTURE & CITATION: Use clean Markdown (headings, tables, bullet points, bold text). Cite specific section titles or page numbers when available in the context chunks.\n\n"
            f"Context from uploaded documents:\n{context}"
        )

    # 4. Assemble the conversation messages
    messages = [("system", system_prompt)]
    if chat_history:
        for role, content in chat_history:
            # Map frontend roles to LangChain roles ('assistant' -> 'ai', 'user' -> 'human')
            lc_role = "ai" if role == "assistant" else "human"
            messages.append((lc_role, content))
    messages.append(("human", message))

    # 5. Generate response
    response = llm.invoke(messages)
    return response.content
