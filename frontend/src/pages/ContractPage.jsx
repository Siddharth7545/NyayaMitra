import React, { useState, useRef } from "react";
import api, { API } from "@/lib/api";
import { ShieldCheck, Loader2, AlertTriangle, Upload, FileText, X, Download } from "lucide-react";
import { toast } from "sonner";

const SAMPLE = `NON-DISCLOSURE AGREEMENT
This Agreement is entered into on 10th March 2024 between ABC Tech Pvt. Ltd. ("Disclosing Party") and John Doe ("Receiving Party").
1. Receiving Party agrees to keep confidential all information disclosed for a period of 3 years.
2. Confidential Information includes source code, business plans and customer lists.
3. This Agreement shall be governed by the laws of India.
4. Receiving Party assigns all resulting IP to Disclosing Party without additional consideration.
5. Receiving Party waives any right to seek judicial remedy and agrees to arbitration in Mumbai only.
6. In case of breach, Receiving Party shall pay liquidated damages of ₹1,00,00,000 regardless of actual harm.`;

function riskBadge(r) {
  if (!r) return null;
  return <span className={`nm-chip risk-${r}`}>{r.toUpperCase()}</span>;
}

export default function ContractPage() {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [file, setFile] = useState(null);
  const [downloading, setDownloading] = useState(false);
  const fileRef = useRef(null);

  const downloadRedline = async () => {
    if (!result) return;
    // Need the source text — use current state
    const sourceText = file ? null : text;
    setDownloading(true);
    try {
      const token = localStorage.getItem("nm_token");
      let res;
      if (file) {
        const fd = new FormData();
        fd.append("file", file);
        res = await fetch(`${API}/review/contract/redline-upload`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: fd,
        });
      } else {
        res = await fetch(`${API}/review/contract/redline-from-review`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ contract_text: sourceText, review: result, filename: "contract" }),
        });
      }
      if (!res.ok) throw new Error("Download failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "redline-report.docx";
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Redlined DOCX downloaded");
    } catch (e) {
      toast.error("Download failed");
    } finally {
      setDownloading(false);
    }
  };

  const review = async () => {
    if (file) return reviewFile();
    if (text.trim().length < 50) {
      toast.error("Paste contract text (min 50 chars) or upload a file.");
      return;
    }
    setLoading(true);
    setResult(null);
    try {
      const { data } = await api.post("/review/contract", { contract_text: text });
      setResult(data.result);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Review failed");
    } finally {
      setLoading(false);
    }
  };

  const reviewFile = async () => {
    setLoading(true);
    setResult(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const { data } = await api.post("/review/contract/upload", fd, {
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
    if (!/\.(pdf|docx|txt)$/i.test(f.name)) return toast.error("PDF/DOCX/TXT only.");
    if (f.size > 15 * 1024 * 1024) return toast.error("Max 15 MB.");
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
          <ShieldCheck className="w-8 h-8 text-[var(--nm-saffron)]" /> Contract Review Agent
        </h1>
        <p className="text-[var(--nm-ink-soft)] mt-2 text-sm">
          Upload or paste any contract — get red flags, missing protections, favourable clauses, and a risk score.
        </p>
      </header>

      <div className="grid lg:grid-cols-2 gap-6">
        <div>
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={onDrop}
            onClick={() => fileRef.current?.click()}
            className="border-2 border-dashed border-[var(--nm-border)] p-6 text-center cursor-pointer hover:border-[var(--nm-ink)] hover:bg-slate-50 transition-colors"
            data-testid="contract-dropzone"
          >
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,.docx,.txt"
              className="hidden"
              onChange={(e) => onFile(e.target.files?.[0])}
              data-testid="contract-file-input"
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
                  data-testid="contract-file-clear"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div>
                <Upload className="w-6 h-6 mx-auto text-[var(--nm-ink-soft)]" />
                <div className="mt-2 text-sm font-semibold">Drop PDF / DOCX / TXT here or click to upload</div>
                <div className="text-xs text-[var(--nm-ink-soft)] mt-1">Max 15 MB</div>
              </div>
            )}
          </div>

          <div className="my-4 flex items-center gap-3 text-xs text-[var(--nm-ink-soft)] uppercase tracking-widest">
            <span className="h-px flex-1 bg-[var(--nm-border)]" /> or paste text <span className="h-px flex-1 bg-[var(--nm-border)]" />
          </div>

          <label className="text-xs uppercase tracking-widest text-[var(--nm-ink-soft)]">Contract text</label>
          <textarea
            className="nm-input nm-textarea mt-1"
            style={{ minHeight: "300px" }}
            value={text}
            onChange={(e) => { setText(e.target.value); if (e.target.value) setFile(null); }}
            placeholder="Paste contract text here…"
            data-testid="contract-input"
            disabled={!!file}
          />
          <div className="flex gap-2 mt-3">
            <button className="nm-btn saffron" onClick={review} disabled={loading} data-testid="contract-review-btn">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
              {loading ? "Reviewing…" : file ? "Review uploaded file" : "Review contract"}
            </button>
            <button className="nm-btn ghost" onClick={() => { setText(SAMPLE); setFile(null); }} data-testid="contract-sample-btn">
              Load sample
            </button>
          </div>
        </div>

        <div className="border border-[var(--nm-border)] bg-white p-6 min-h-[500px]" data-testid="contract-result">
          {!result && !loading && <div className="text-[var(--nm-ink-soft)] text-sm">Review will appear here.</div>}
          {loading && (
            <div className="flex items-center gap-2 text-[var(--nm-ink-soft)]">
              <Loader2 className="w-4 h-4 animate-spin" /> Reading and reviewing…
            </div>
          )}
          {result && (
            <div className="space-y-5 fade-in">
              <div className="flex items-center gap-3 flex-wrap">
                <div>
                  <div className="nm-overline">Contract type</div>
                  <div className="font-display font-bold text-xl mt-1">{result.contract_type || "—"}</div>
                </div>
                <div className="ml-auto text-right">
                  <div className="nm-overline">Risk score</div>
                  <div className="font-display font-black text-4xl mt-1">
                    {typeof result.risk_score === "number" ? result.risk_score : "—"}
                    <span className="text-base text-[var(--nm-ink-soft)]">/100</span>
                  </div>
                  <div className="mt-1">{riskBadge(result.overall_risk)}</div>
                </div>
              </div>

              <button
                onClick={downloadRedline}
                className="nm-btn w-full justify-center"
                disabled={downloading}
                data-testid="download-redline-btn"
              >
                {downloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                {downloading ? "Preparing DOCX…" : "Download redlined DOCX"}
              </button>

              <div>
                <div className="nm-overline">Summary</div>
                <p className="mt-1 text-sm leading-relaxed">{result.summary || "—"}</p>
              </div>

              {result.red_flags?.length > 0 && (
                <div>
                  <div className="nm-overline">Red flags</div>
                  <div className="mt-2 space-y-2">
                    {result.red_flags.map((rf, i) => (
                      <div key={i} className="border border-[var(--nm-border)] p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="font-semibold text-sm">{rf.clause}</div>
                          {riskBadge(rf.severity)}
                        </div>
                        <p className="text-sm mt-2 flex gap-2">
                          <AlertTriangle className="w-4 h-4 text-[var(--nm-saffron)] shrink-0 mt-0.5" />
                          {rf.issue}
                        </p>
                        {rf.suggestion && (
                          <p className="text-sm mt-2 text-[var(--nm-ink-soft)]">
                            <span className="font-semibold text-[var(--nm-ink)]">Fix: </span>{rf.suggestion}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <ListSection title="Missing protections" items={result.missing_protections} />
              <ListSection title="Favourable points" items={result.favourable_points} accent />
              <ListSection title="Recommendations" items={result.recommendations} accent />

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

function ListSection({ title, items, accent }) {
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
