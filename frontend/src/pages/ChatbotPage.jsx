import React, { useEffect, useRef, useState } from "react";
import { API } from "@/lib/api";
import { Send, MessageSquare, Sparkles, RotateCcw } from "lucide-react";

const SUGGEST = [
  "What is the punishment under Section 138 of the Negotiable Instruments Act?",
  "How do I file an RTI application in India?",
  "Consumer Protection Act — how to file an online complaint?",
  "What are my rights if arrested under Section 41 CrPC?",
];

export default function ChatbotPage() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [sessionId, setSessionId] = useState(null);
  const [streaming, setStreaming] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const send = async (text) => {
    const q = (text ?? input).trim();
    if (!q || streaming) return;
    setInput("");
    setMessages((m) => [...m, { role: "user", content: q }, { role: "assistant", content: "" }]);
    setStreaming(true);

    try {
      const token = localStorage.getItem("nm_token");
      const res = await fetch(`${API}/chat/stream`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ session_id: sessionId, message: q }),
      });
      if (!res.ok || !res.body) throw new Error("Chat failed");
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const parts = buf.split("\n\n");
        buf = parts.pop() || "";
        for (const p of parts) {
          const line = p.replace(/^data:\s*/, "").trim();
          if (!line) continue;
          try {
            const j = JSON.parse(line);
            if (j.session_id && !sessionId) setSessionId(j.session_id);
            if (j.delta) {
              setMessages((m) => {
                const copy = [...m];
                copy[copy.length - 1] = {
                  ...copy[copy.length - 1],
                  content: copy[copy.length - 1].content + j.delta,
                };
                return copy;
              });
            }
            if (j.error) {
              setMessages((m) => {
                const copy = [...m];
                copy[copy.length - 1] = { role: "assistant", content: `⚠️ ${j.error}` };
                return copy;
              });
            }
          } catch (_) {}
        }
      }
    } catch (e) {
      setMessages((m) => {
        const copy = [...m];
        copy[copy.length - 1] = { role: "assistant", content: "⚠️ Something went wrong. Please try again." };
        return copy;
      });
    } finally {
      setStreaming(false);
    }
  };

  const reset = () => {
    setMessages([]);
    setSessionId(null);
  };

  return (
    <div className="max-w-5xl mx-auto p-6 md:p-10 h-screen flex flex-col">
      <header className="mb-6">
        <div className="nm-overline">Flagship · AI</div>
        <div className="flex items-center justify-between mt-2">
          <h1 className="font-display font-black text-3xl md:text-4xl tracking-tighter flex items-center gap-3">
            <MessageSquare className="w-8 h-8 text-[var(--nm-saffron)]" /> Legal Knowledge Chatbot
          </h1>
          <button className="nm-btn ghost" onClick={reset} data-testid="chat-reset-btn">
            <RotateCcw className="w-4 h-4" /> New chat
          </button>
        </div>
        <p className="text-[var(--nm-ink-soft)] mt-2 text-sm">
          Ask about Indian statutes, procedures, rights. General info only — not legal advice.
        </p>
      </header>

      <div className="flex-1 border border-[var(--nm-border)] bg-white overflow-y-auto p-6 nm-scroll" data-testid="chat-window">
        {messages.length === 0 && (
          <div className="max-w-2xl">
            <div className="flex items-center gap-2 text-[var(--nm-saffron)] mb-3">
              <Sparkles className="w-4 h-4" />
              <span className="nm-overline">Try a question</span>
            </div>
            <div className="grid gap-2">
              {SUGGEST.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="text-left border border-[var(--nm-border)] p-3 hover:border-[var(--nm-ink)] hover:bg-slate-50 text-sm"
                  data-testid="chat-suggest"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="space-y-4">
          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[85%] px-4 py-3 ${m.role === "user" ? "bubble-user" : "bubble-ai"} prose-legal`}
                data-testid={`msg-${m.role}`}
              >
                {m.content || (streaming && i === messages.length - 1 ? "…" : "")}
              </div>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
      </div>

      <form
        onSubmit={(e) => { e.preventDefault(); send(); }}
        className="mt-4 flex gap-2"
        data-testid="chat-form"
      >
        <input
          className="nm-input flex-1"
          placeholder="Ask about Indian law…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={streaming}
          data-testid="chat-input"
        />
        <button type="submit" className="nm-btn saffron" disabled={streaming || !input.trim()} data-testid="chat-send-btn">
          <Send className="w-4 h-4" /> {streaming ? "Thinking…" : "Send"}
        </button>
      </form>
    </div>
  );
}
