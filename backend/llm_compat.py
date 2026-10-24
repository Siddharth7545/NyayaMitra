"""
Drop-in replacement for `emergentintegrations.llm.chat` with Groq, Grok,
Gemini, and local Ollama providers.

Only the small API surface used by server.py is implemented:
    LlmChat(api_key=, session_id=, system_message=).with_model(provider, model)
    chat.stream_message(UserMessage(text=...)) -> async iterator of
        TextDelta(content=...) ... StreamDone()
"""
import json
import os
from dataclasses import dataclass
from typing import AsyncIterator

import httpx


@dataclass
class UserMessage:
    text: str


@dataclass
class TextDelta:
    content: str


class StreamDone:
    pass


class LlmChat:
    def __init__(self, api_key: str, session_id: str, system_message: str):
        self._system = system_message
        self.session_id = session_id

        # Determine provider
        provider = os.environ.get("LLM_PROVIDER", "").strip().lower()
        if not provider:
            if (
                (api_key and api_key.startswith("gsk_"))
                or os.environ.get("GROQ_API_KEY")
                or os.environ.get("GROK_API_KEY")
            ):
                provider = "groq"
            elif api_key and api_key.startswith("xai-"):
                provider = "grok"
            elif os.environ.get("GEMINI_API_KEY"):
                provider = "gemini"
            elif os.environ.get("OLLAMA_MODEL") or os.environ.get("OLLAMA_BASE_URL"):
                provider = "ollama"
            else:
                provider = "gemini"
        self._provider = provider

        # Fallback to env API keys if not passed
        if not api_key:
            if self._provider in ("groq", "grok"):
                api_key = (
                    os.environ.get("GROQ_API_KEY")
                    or os.environ.get("GROK_API_KEY")
                    or os.environ.get("EMERGENT_LLM_KEY", "")
                )
            elif self._provider == "gemini":
                api_key = os.environ.get("GEMINI_API_KEY") or os.environ.get("EMERGENT_LLM_KEY", "")
        self._api_key = api_key

        self._base_url = os.environ.get(
            "OLLAMA_BASE_URL", "http://localhost:11434"
        ).rstrip("/")

        if self._provider == "ollama":
            self._model = os.environ.get("OLLAMA_MODEL", "llama3.2")
            self._client = None
        elif self._provider in ("groq", "grok"):
            if os.environ.get("GROQ_BASE_URL"):
                self._base_url = os.environ["GROQ_BASE_URL"].rstrip("/")
            elif os.environ.get("GROK_BASE_URL"):
                self._base_url = os.environ["GROK_BASE_URL"].rstrip("/")
            elif self._api_key.startswith("xai-"):
                self._base_url = "https://api.x.ai/v1"
            else:
                self._base_url = "https://api.groq.com/openai/v1"

            default_model = "grok-2-latest" if self._api_key.startswith("xai-") else "openai/gpt-oss-120b"
            self._model = (
                os.environ.get("GROQ_MODEL")
                or os.environ.get("GROK_MODEL")
                or default_model
            )
            self._client = None
        elif self._provider == "gemini":
            from google import genai

            self._client = genai.Client(api_key=self._api_key)
            self._model = os.environ.get("GEMINI_MODEL", "gemini-2.5-flash")
        else:
            raise ValueError(
                f"Unsupported LLM_PROVIDER '{self._provider}'. Use 'groq', 'grok', 'gemini' or 'ollama'."
            )

    def with_model(self, provider: str, model: str) -> "LlmChat":
        # Provider and model are selected from environment for local runs.
        return self

    async def stream_message(self, message: UserMessage) -> AsyncIterator[object]:
        if self._provider == "ollama":
            async with httpx.AsyncClient(timeout=None) as client:
                async with client.stream(
                    "POST",
                    f"{self._base_url}/api/chat",
                    json={
                        "model": self._model,
                        "messages": [
                            {"role": "system", "content": self._system},
                            {"role": "user", "content": message.text},
                        ],
                        "stream": True,
                    },
                ) as response:
                    response.raise_for_status()
                    async for line in response.aiter_lines():
                        if not line:
                            continue
                        try:
                            chunk = json.loads(line)
                        except json.JSONDecodeError as exc:
                            raise RuntimeError("Ollama returned an invalid response.") from exc
                        if chunk.get("error"):
                            raise RuntimeError(f"Ollama request failed: {chunk['error']}")
                        content = chunk.get("message", {}).get("content")
                        if content:
                            yield TextDelta(content=content)
                        if chunk.get("done"):
                            break
            yield StreamDone()
            return

        if self._provider in ("groq", "grok"):
            headers = {
                "Authorization": f"Bearer {self._api_key}",
                "Content-Type": "application/json",
            }
            payload = {
                "model": self._model,
                "messages": [
                    {"role": "system", "content": self._system},
                    {"role": "user", "content": message.text},
                ],
                "stream": True,
            }
            async with httpx.AsyncClient(timeout=60.0) as client:
                async with client.stream(
                    "POST",
                    f"{self._base_url}/chat/completions",
                    headers=headers,
                    json=payload,
                ) as response:
                    response.raise_for_status()
                    async for line in response.aiter_lines():
                        if not line:
                            continue
                        line = line.strip()
                        if line.startswith("data: "):
                            line = line[6:].strip()
                        if line == "[DONE]":
                            break
                        try:
                            chunk = json.loads(line)
                        except json.JSONDecodeError:
                            continue
                        if chunk.get("error"):
                            raise RuntimeError(f"LLM request error: {chunk['error']}")
                        choices = chunk.get("choices", [])
                        if choices:
                            delta_content = choices[0].get("delta", {}).get("content")
                            if delta_content:
                                yield TextDelta(content=delta_content)
            yield StreamDone()
            return

        from google.genai import types

        stream = await self._client.aio.models.generate_content_stream(
            model=self._model,
            contents=message.text,
            config=types.GenerateContentConfig(system_instruction=self._system),
        )
        async for chunk in stream:
            if chunk.text:
                yield TextDelta(content=chunk.text)
        yield StreamDone()
