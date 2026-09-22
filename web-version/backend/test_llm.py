import os
import sys

sys.path.append(os.path.dirname(__file__))

from app.services.llm_service import generate_answer
from langchain_core.documents import Document

def main():
    docs = [Document(page_content="This is a test document about AI.")]
    print("Calling LLM...")
    try:
        answer = generate_answer(docs, "What is this document about?")
        print("Answer:", answer)
    except Exception as e:
        print("Error:", str(e))

if __name__ == "__main__":
    main()
