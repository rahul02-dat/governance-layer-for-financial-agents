import os
from openai import OpenAI
from typing import List, Dict, Any, Optional
import json

class LLMProvider:
    def chat_completion(self, messages: List[Dict[str, Any]], tools: Optional[List[Dict[str, Any]]] = None) -> Any:
        raise NotImplementedError

class OpenAIProvider(LLMProvider):
    def __init__(self):
        # Allow running without API key for simulated fallback if needed, but attempt to load it
        api_key = os.environ.get("OPENAI_API_KEY", "dummy_key")
        self.client = OpenAI(api_key=api_key)

    def chat_completion(self, messages: List[Dict[str, Any]], tools: Optional[List[Dict[str, Any]]] = None) -> Any:
        try:
            # If dummy key is used, simulate the LLM's response to immediately call the transfer_funds tool.
            # This allows the hackathon demonstration to work without an actual OpenAI key.
            if self.client.api_key == "dummy_key":
                return self._simulate_tool_call(messages, tools)
            
            response = self.client.chat.completions.create(
                model="gpt-4o",
                messages=messages,
                tools=tools,
                temperature=0.0
            )
            return response.choices[0].message
        except Exception as e:
            if "Incorrect API key" in str(e) or "AuthenticationError" in str(e):
                return self._simulate_tool_call(messages, tools)
            raise e

    def _simulate_tool_call(self, messages: List[Dict[str, Any]], tools: Optional[List[Dict[str, Any]]] = None) -> Any:
        """Simulates an LLM tool call for transfer_funds if no real LLM is available."""
        class MockFunctionCall:
            def __init__(self, name, arguments):
                self.name = name
                self.arguments = arguments
                
        class MockToolCall:
            def __init__(self, id, type, function):
                self.id = id
                self.type = type
                self.function = function

        class MockMessage:
            def __init__(self, content, tool_calls):
                self.content = content
                self.tool_calls = tool_calls

        # Simple extraction from prompt text for demonstration
        amount = 50000.0
        if messages:
            last_msg = messages[-1]["content"].lower()
            if "80000" in last_msg:
                amount = 80000.0
            elif "500000" in last_msg:
                amount = 500000.0
            elif "5000" in last_msg:
                amount = 5000.0

        mock_args = json.dumps({
            "source_account": "ACC-001",
            "target_account": "ACC-002",
            "amount": amount,
            "currency": "INR",
            "reason": "Simulated transfer request"
        })
        
        return MockMessage(
            content=None,
            tool_calls=[
                MockToolCall(
                    id="call_mock123",
                    type="function",
                    function=MockFunctionCall(name="transfer_funds", arguments=mock_args)
                )
            ]
        )
