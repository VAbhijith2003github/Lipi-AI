import os
import logging
import time
from app.config import settings
from app.rag.prompts import get_rag_prompt
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.messages import HumanMessage, AIMessage

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)

# We will try gemini-3.6-flash since it's the correct model for the current SDKs
CHAT_MODEL = "gemini-3.5-flash"

def generate_answer(docs, question: str, chat_history: list = None) -> str:
    api_key = settings.google_api_key or os.environ.get("GOOGLE_API_KEY")
    
    # Initialize LangChain's Gemini wrapper which handles auth, retries, and formatting natively
    llm = ChatGoogleGenerativeAI(
        model=CHAT_MODEL,
        google_api_key=api_key,
        temperature=0,
        max_retries=3,
        timeout=110,
        transport="rest"
    )

    context = "\n\n".join(doc.page_content for doc in docs)
    
    prompt = get_rag_prompt()
    formatted_prompt = prompt.invoke({"context": context, "question": question})
    full_prompt_text = "\n".join(
        m.content for m in (formatted_prompt.messages if hasattr(formatted_prompt, "messages") else [formatted_prompt])
    )

    messages = []
    if chat_history:
        for msg in chat_history:
            if msg.role == "user":
                messages.append(HumanMessage(content=msg.content))
            else:
                messages.append(AIMessage(content=msg.content))
                
    messages.append(HumanMessage(content=full_prompt_text))

    try:
        logger.info(f"Starting LLM invocation with model {CHAT_MODEL}...")
        start_time = time.time()
        
        response = llm.invoke(messages)
        
        elapsed = time.time() - start_time
        logger.info(f"LLM invocation completed successfully in {elapsed:.2f} seconds.")
        return response.content
    except Exception as e:
        elapsed = time.time() - start_time
        logger.error(f"LLM invocation failed after {elapsed:.2f} seconds. Error: {str(e)}", exc_info=True)
        raise
