import React, { useState, useRef } from "react";
import api from "@/lib/api";
import { FileSearch, Loader2, AlertTriangle, Upload, FileText, X } from "lucide-react";
import { toast } from "sonner";

const SAMPLE = `RENT AGREEMENT
This Rent Agreement is executed at Bengaluru on 12th June 2024 by and between:
Mr. Ramesh Kumar S/o Late Suresh Kumar (LANDLORD), and
Ms. Priya Sharma D/o Mohan Sharma (TENANT).

1. The Landlord agrees to lease the premises at Flat 402, Green Meadows Apartments, Indiranagar, Bengaluru.
2. Rent: ₹35,000 per month, payable by the 5th of every month.
3. Security Deposit: ₹2,10,000 (six months' rent), refundable without interest at end of tenancy.
4. Tenure: 11 months from 1st July 2024, renewable by mutual consent.
5. Tenant shall not sublet without written permission.
6. Landlord may enter with 24-hour notice.
7. In case of dispute, courts at Bengaluru shall have jurisdiction.`;

function severityClass(s) {
  return `nm-chip risk-${s || "medium"}`;
}

export default function DocAnalyzerPage() {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [file, setFile] = useState(null);
  const fileRef = useRef(null);

  const analyze = async () => {
    if (file) return analyzeFile();
    if (text.trim().length < 30) {
      toast.error("Paste at least 30 characters of document text or upload a file.");
      return;
    }
    setLoading(true);
    setResult(null);
    try {
      const { data } = await api.post("/analyze/document", { text });
      setResult(data.result);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Analysis failed");
    } finally {
      setLoading(false);
    }
  };

  const analyzeFile = async () => {
    setLoading(true);
    setResult(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const { data } = await api.post("/analyze/document/upload", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setResult(data.result);
      toast.success(`Extracted ${data.chars.toLocaleString()} characters from ${data.filename}`);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Upload failed");
    } finally {
      setLoading(false);
    }
  };

  const onFile = (f) => {
    if (!f) return;
    const ok = /\.(pdf|docx|txt)$/i.test(f.name);
    if (!ok) {
      toast.error("Only PDF, DOCX, or TXT files are supported.");
      return;
    }
    if (f.size > 15 * 1024 * 1024) {
      toast.error("File too large (max 15 MB).");
      return;
    }
    setFile(f);
    setText("");
  };

  const onDrop = (e) => {
    e.preventDefault();
    onFile(e.dataTransfer.files?.[0]);
  };

  return (
    <div className="max-w-6xl mx-auto p-6 md:p-10">
      <header className="mb-8">
        <div className="nm-overline">Flagship · AI</div>
        <h1 className="font-display font-black text-3xl md:text-4xl tracking-tighter flex items-center gap-3 mt-2">
          <FileSearch className="w-8 h-8 text-[var(--nm-saffron)]" /> AI Document Analyzer
        </h1>
        <p className="text-[var(--nm-ink-soft)] mt-2 text-sm">
          Upload a PDF/DOCX or paste text — get parties, obligations, risks &amp; missing clauses in seconds.
        </p>
      </header>

      <div className="grid lg:grid-cols-2 gap-6">
        <div>
          {/* Upload zone */}
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={onDrop}
            onClick={() => fileRef.current?.click()}
            className="border-2 border-dashed border-[var(--nm-border)] p-6 text-center cursor-pointer hover:border-[var(--nm-ink)] hover:bg-slate-50 transition-colors"
            data-testid="doc-dropzone"
          >
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,.docx,.txt"
              className="hidden"
              onChange={(e) => onFile(e.target.files?.[0])}
              data-testid="doc-file-input"
            />
            {file ? (
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <FileText className="w-5 h-5 text-[var(--nm-saffron)] shrink-0" />
                  <div className="min-w-0">
                    <div className="text-sm font-semibold truncate">{file.name}</div>
                    <div className="text-xs text-[var(--nm-ink-soft)]">{(file.size / 1024).toFixed(1)} KB</div>
                  </div>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); setFile(null); if (fileRef.current) fileRef.current.value=""; }}
                  className="p-1.5 hover:bg-slate-100"
                  data-testid="doc-file-clear"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div>
                <Upload className="w-6 h-6 mx-auto text-[var(--nm-ink-soft)]" />
                <div className="mt-2 text-sm font-semibold">Drop PDF / DOCX / TXT here or click to upload</div>
                <div className="text-xs text-[var(--nm-ink-soft)] mt-1">Max 15 MB · text is extracted server-side</div>
              </div>
            )}
          </div>

          <div className="my-4 flex items-center gap-3 text-xs text-[var(--nm-ink-soft)] uppercase tracking-widest">
            <span className="h-px flex-1 bg-[var(--nm-border)]" /> or paste text <span className="h-px flex-1 bg-[var(--nm-border)]" />
          </div>

          <label className="text-xs uppercase tracking-widest text-[var(--nm-ink-soft)]">Document text</label>
          <textarea
            className="nm-input nm-textarea mt-1"
            placeholder="Paste document text here…"
            value={text}
            onChange={(e) => { setText(e.target.value); if (e.target.value) setFile(null); }}
            data-testid="doc-input"
            disabled={!!file}
          />
          <div className="flex gap-2 mt-3">
            <button className="nm-btn saffron" onClick={analyze} disabled={loading} data-testid="doc-analyze-btn">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileSearch className="w-4 h-4" />}
              {loading ? "Analyzing…" : file ? "Analyze uploaded file" : "Analyze text"}
            </button>
            <button className="nm-btn ghost" onClick={() => { setText(SAMPLE); setFile(null); }} data-testid="doc-sample-btn">
              Load sample
            </button>
          </div>
        </div>

        <div className="border border-[var(--nm-border)] bg-white p-6 min-h-[400px]" data-testid="doc-result">
          {!result && !loading && (
            <div className="text-[var(--nm-ink-soft)] text-sm">Results will appear here.</div>
          )}
          {loading && (
            <div className="flex items-center gap-2 text-[var(--nm-ink-soft)]">
              <Loader2 className="w-4 h-4 animate-spin" /> Reading and analysing…
            </div>
          )}
          {result && (
            <div className="space-y-5 fade-in">
              <div>
                <div className="nm-overline">Document type</div>
                <div className="font-display font-bold text-xl mt-1">{result.doc_type || "—"}</div>
              </div>
              <div>
                <div className="nm-overline">Summary</div>
                <p className="mt-1 text-sm leading-relaxed">{result.summary || "—"}</p>
              </div>
              <SectionList title="Parties" items={result.parties} />
              <SectionList title="Key dates" items={result.key_dates} />
              <SectionList title="Obligations" items={result.obligations} />
              {result.risks?.length > 0 && (
                <div>
                  <div className="nm-overline">Risks</div>
                  <div className="mt-2 space-y-2">
                    {result.risks.map((r, i) => (
                      <div key={i} className="border border-[var(--nm-border)] p-3">
                        <span className={severityClass(r.severity)}>{r.severity}</span>
                        <p className="mt-2 text-sm flex gap-2">
                          <AlertTriangle className="w-4 h-4 text-[var(--nm-saffron)] shrink-0 mt-0.5" />
                          {r.text}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <SectionList title="Missing clauses" items={result.clauses_missing} />
              <SectionList title="Recommendations" items={result.recommendations} accent />
              {result.raw && (
                <pre className="text-xs bg-slate-50 p-3 border border-[var(--nm-border)] overflow-auto">{result.raw}</pre>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SectionList({ title, items, accent }) {
  if (!items || !items.length) return null;
  return (
    <div>
      <div className="nm-overline">{title}</div>
      <ul className="mt-2 space-y-1.5 text-sm">
        {items.map((it, i) => (
          <li key={i} className="flex gap-2">
            <span className={`w-1.5 h-1.5 mt-2 shrink-0 ${accent ? "bg-[var(--nm-saffron)]" : "bg-[var(--nm-ink)]"}`} />
            <span>{typeof it === "string" ? it : JSON.stringify(it)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
