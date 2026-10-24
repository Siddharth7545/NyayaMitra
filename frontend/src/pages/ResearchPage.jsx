import React, { useState } from "react";
import api from "@/lib/api";
import { Search, Loader2, BookOpen } from "lucide-react";
import { toast } from "sonner";

const EXAMPLES = [
  "Landmark judgments on right to privacy in India",
  "Legal remedy for cheque bounce under Section 138 NI Act",
  "Fundamental duties under Article 51A",
  "Anticipatory bail under Section 438 CrPC — key case law",
];

export default function ResearchPage() {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  const search = async (q) => {
    const qq = (q ?? query).trim();
    if (!qq) return;
    setQuery(qq);
    setLoading(true);
    setResult(null);
    try {
      const { data } = await api.post("/research/query", { query: qq });
      setResult(data.result);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Search failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto p-6 md:p-10">
      <header className="mb-8">
        <div className="nm-overline">Flagship · AI</div>
        <h1 className="font-display font-black text-3xl md:text-4xl tracking-tighter flex items-center gap-3 mt-2">
          <Search className="w-8 h-8 text-[var(--nm-saffron)]" /> Legal Research Engine
        </h1>
        <p className="text-[var(--nm-ink-soft)] mt-2 text-sm">
          Ask a research question. Get statutes and landmark Indian judgments with concise summaries.
        </p>
      </header>

      <form
        onSubmit={(e) => { e.preventDefault(); search(); }}
        className="flex gap-2 mb-4"
        data-testid="research-form"
      >
        <input
          className="nm-input flex-1"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search Indian statutes, sections, judgments…"
          data-testid="research-input"
        />
        <button type="submit" className="nm-btn saffron" disabled={loading} data-testid="research-btn">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
          {loading ? "Searching…" : "Search"}
        </button>
      </form>

      {!result && !loading && (
        <div>
          <div className="nm-overline mb-3">Try an example</div>
          <div className="grid md:grid-cols-2 gap-2">
            {EXAMPLES.map((ex) => (
              <button
                key={ex}
                onClick={() => search(ex)}
                className="text-left border border-[var(--nm-border)] p-3 hover:border-[var(--nm-ink)] hover:bg-slate-50 text-sm"
                data-testid="research-example"
              >
                {ex}
              </button>
            ))}
          </div>
        </div>
      )}

      {loading && (
        <div className="flex items-center gap-2 text-[var(--nm-ink-soft)] mt-4">
          <Loader2 className="w-4 h-4 animate-spin" /> Researching Indian law…
        </div>
      )}

      {result && (
        <div className="space-y-6 fade-in mt-4" data-testid="research-result">
          <div className="border border-[var(--nm-border)] bg-white p-6">
            <div className="nm-overline">Answer</div>
            <p className="mt-2 prose-legal">{result.answer}</p>
          </div>

          {result.authorities?.length > 0 && (
            <div>
              <div className="nm-overline mb-3">Authorities &amp; case law</div>
              <div className="space-y-3">
                {result.authorities.map((a, i) => (
                  <div key={i} className="border border-[var(--nm-border)] bg-white p-4">
                    <div className="flex items-start gap-3">
                      <BookOpen className="w-4 h-4 text-[var(--nm-saffron)] mt-1 shrink-0" />
                      <div>
                        <div className="font-semibold">{a.title}</div>
                        <div className="text-xs font-mono2 text-[var(--nm-ink-soft)] mt-0.5">{a.citation}</div>
                        <p className="text-sm mt-2 leading-relaxed">{a.summary}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {result.related_topics?.length > 0 && (
            <div>
              <div className="nm-overline mb-2">Related topics</div>
              <div className="flex flex-wrap gap-2">
                {result.related_topics.map((t, i) => (
                  <button key={i} onClick={() => search(t)} className="nm-chip hover:border-[var(--nm-ink)]">{t}</button>
                ))}
              </div>
            </div>
          )}

          {result.practical_takeaway && (
            <div className="border-l-4 border-[var(--nm-saffron)] bg-[var(--nm-pale)] p-4">
              <div className="nm-overline">Practical takeaway</div>
              <p className="mt-2 text-sm">{result.practical_takeaway}</p>
            </div>
          )}

          {result.raw && (
            <pre className="text-xs bg-slate-50 p-3 border border-[var(--nm-border)] overflow-auto">{result.raw}</pre>
          )}
        </div>
      )}
    </div>
  );
}
