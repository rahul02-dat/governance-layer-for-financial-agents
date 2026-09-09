import os
from openai import OpenAI
from typing import List, Dict, Any, Optional
import json

from app.config import settings

class LLMProvider:
    def chat_completion(self, messages: List[Dict[str, Any]], tools: Optional[List[Dict[str, Any]]] = None) -> Any:
        raise NotImplementedError

class OpenAIProvider(LLMProvider):
    def __init__(self):
        if not settings.openai_api_key or settings.openai_api_key == "dummy_key":
            print("[WARNING] Running OpenAIProvider without a valid openai_api_key.")
        self.client = OpenAI(api_key=settings.openai_api_key or "dummy_key")

    def chat_completion(self, messages: List[Dict[str, Any]], tools: Optional[List[Dict[str, Any]]] = None) -> Any:
        try:
            response = self.client.chat.completions.create(
                model=settings.llm_model,
                messages=messages,
                tools=tools,
                temperature=0.0
            )
            return response.choices[0].message
        except Exception as e:
            raise RuntimeError(f"LLM Provider Error: {str(e)}")
