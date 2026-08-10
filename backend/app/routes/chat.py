"""
chat.py — Chat Endpoint

PURPOSE:
This route handles the POST /chat endpoint. When the user types a message
in the chat interface, the frontend sends it here.

FLOW:
  1. Receive the user's message.
  2. Pass it to the Tutor Agent.
  3. The agent autonomously decides whether to search the documents,
     search Wikipedia, or answer from its own knowledge.
  4. Return the agent's response.
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from app.agents.tutor import invoke_agent

router = APIRouter()


class ChatRequest(BaseModel):
    """
    Pydantic model for the chat request body.

    Pydantic automatically validates the incoming JSON:
      - If 'message' is missing, FastAPI returns a 422 error.
      - If 'chat_history' is not a list, FastAPI returns a 422 error.

    This is much safer than manually checking request.json().
    """
    message: str
    chat_history: list = []  # Optional: previous messages for context
    system_prompt_override: str = None  # Optional: customize system behavior dynamically


@router.post("/chat")
async def chat_with_tutor(request: ChatRequest):
    """
    Send a message to the Agent and get a response.

    Args:
        request: JSON body with 'message', optional 'chat_history', and optional 'system_prompt_override'.

    Returns:
        JSON with the agent's response.
    """
    try:
        response = invoke_agent(
            message=request.message,
            chat_history=request.chat_history,
            system_prompt_override=request.system_prompt_override,
        )

        return {
            "response": response,
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Agent error: {str(e)}")
