from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import Optional, List
from app.agents.tutor import invoke_agent

router = APIRouter()

class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=4000)
    chat_history: List[List[str]] = Field(default_factory=list)
    filename: Optional[str] = None
    system_prompt_override: Optional[str] = None
    mode: str = "ollama"  # "ollama" | "gemini"
    api_key: Optional[str] = None

@router.post("/chat")
async def chat_with_tutor(request: ChatRequest):
    try:
        response = invoke_agent(
            message=request.message,
            chat_history=request.chat_history,
            system_prompt_override=request.system_prompt_override,
            filename=request.filename,
            mode=request.mode,
            api_key=request.api_key,
        )

        return {
            "response": response,
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Agent error: {str(e)}")
