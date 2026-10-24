import asyncio

import pytest

import llm_compat


class FakeResponse:
    def __init__(self, lines):
        self._lines = lines

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, traceback):
        return False

    def raise_for_status(self):
        pass

    async def aiter_lines(self):
        for line in self._lines:
            yield line


class FakeClient:
    def __init__(self, *, timeout):
        self.timeout = timeout
        self.request = None

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, traceback):
        return False

    def stream(self, method, url, *, json):
        self.request = {"method": method, "url": url, "body": json}
        return FakeResponse([
            '{"message":{"content":"Local "},"done":false}',
            '{"message":{"content":"answer"},"done":true}',
        ])


def test_ollama_stream_uses_local_model_and_system_prompt(monkeypatch):
    monkeypatch.setenv("LLM_PROVIDER", "ollama")
    monkeypatch.setenv("OLLAMA_MODEL", "test-model")
    monkeypatch.setenv("OLLAMA_BASE_URL", "http://ollama.local/")
    fake_client = FakeClient(timeout=None)
    monkeypatch.setattr(llm_compat.httpx, "AsyncClient", lambda **kwargs: fake_client)

    chat = llm_compat.LlmChat("", "session", "You are helpful.")
    chat.with_model("gemini", "ignored-model")
    async def collect_events():
        return [
            event async for event in chat.stream_message(llm_compat.UserMessage("Hello"))
        ]

    events = asyncio.run(collect_events())

    assert [event.content for event in events if isinstance(event, llm_compat.TextDelta)] == [
        "Local ",
        "answer",
    ]
    assert isinstance(events[-1], llm_compat.StreamDone)
    assert fake_client.request == {
        "method": "POST",
        "url": "http://ollama.local/api/chat",
        "body": {
            "model": "test-model",
            "messages": [
                {"role": "system", "content": "You are helpful."},
                {"role": "user", "content": "Hello"},
            ],
            "stream": True,
        },
    }


def test_ollama_stream_surfaces_provider_errors(monkeypatch):
    monkeypatch.setenv("LLM_PROVIDER", "ollama")

    class ErrorClient(FakeClient):
        def stream(self, method, url, *, json):
            return FakeResponse(['{"error":"model not found"}'])

    monkeypatch.setattr(
        llm_compat.httpx, "AsyncClient", lambda **kwargs: ErrorClient(timeout=None)
    )
    chat = llm_compat.LlmChat("", "session", "system")

    async def collect_events():
        return [
            event async for event in chat.stream_message(llm_compat.UserMessage("Hello"))
        ]

    with pytest.raises(RuntimeError, match="model not found"):
        asyncio.run(collect_events())


def test_groq_stream_uses_openai_compatible_endpoint(monkeypatch):
    monkeypatch.setenv("LLM_PROVIDER", "groq")
    monkeypatch.setenv("GROQ_MODEL", "test-groq-model")

    class GroqFakeClient:
        def __init__(self, *, timeout):
            self.timeout = timeout
            self.request = None

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, traceback):
            return False

        def stream(self, method, url, *, headers, json):
            self.request = {"method": method, "url": url, "headers": headers, "body": json}
            return FakeResponse([
                'data: {"choices":[{"delta":{"content":"Groq "}}]}',
                'data: {"choices":[{"delta":{"content":"response"}}]}',
                'data: [DONE]',
            ])

    fake_client = GroqFakeClient(timeout=60.0)
    monkeypatch.setattr(llm_compat.httpx, "AsyncClient", lambda **kwargs: fake_client)

    chat = llm_compat.LlmChat("gsk_test123", "session", "Legal system prompt")
    async def collect_events():
        return [
            event async for event in chat.stream_message(llm_compat.UserMessage("Legal question"))
        ]

    events = asyncio.run(collect_events())

    assert [event.content for event in events if isinstance(event, llm_compat.TextDelta)] == [
        "Groq ",
        "response",
    ]
    assert isinstance(events[-1], llm_compat.StreamDone)
    assert fake_client.request["url"] == "https://api.groq.com/openai/v1/chat/completions"
    assert fake_client.request["headers"]["Authorization"] == "Bearer gsk_test123"
    assert fake_client.request["body"]["model"] == "test-groq-model"

