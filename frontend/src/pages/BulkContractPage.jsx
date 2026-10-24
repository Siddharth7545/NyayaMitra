import React, { useMemo, useRef, useState } from "react";
import api, { API } from "@/lib/api";
import {
  Layers, Upload, Loader2, X, FileText, ShieldCheck, ChevronDown, ChevronRight,
  AlertTriangle, TrendingUp, TrendingDown, BarChart3, Trophy, Download,
} from "lucide-react";
import { toast } from "sonner";

function riskChip(r) {
  if (!r) return null;
  return <span className={`nm-chip risk-${r}`}>{r.toUpperCase()}</span>;
}

function riskColor(score) {
  if (typeof score !== "number") return "var(--nm-ink-soft)";
  if (score >= 70) return "#dc2626";
  if (score >= 45) return "#ea580c";
  return "#16a34a";
}

export default function BulkContractPage() {
  const [files, setFiles] = useState([]);       // File[]
  const [loading, setLoading] = useState(false);
  const [batch, setBatch] = useState(null);     // { stats, items, batch_id }
  const [sortBy, setSortBy] = useState("risk_desc");
  const [expanded, setExpanded] = useState(null);
  const fileRef = useRef(null);

  const addFiles = (list) => {
    if (!list?.length) return;
    const ok = [];
    const rejected = [];
    for (const f of Array.from(list)) {
      if (!/\.(pdf|docx|txt)$/i.test(f.name)) rejected.push(`${f.name}: unsupported type`);
      else if (f.size > 15 * 1024 * 1024) rejected.push(`${f.name}: too large (>15 MB)`);
      else ok.push(f);
    }
    if (rejected.length) toast.error(rejected.join("; "));
    setFiles((prev) => {
      const seen = new Set(prev.map((x) => x.name + x.size));
      const merged = [...prev];
      for (const f of ok) {
        const k = f.name + f.size;
        if (!seen.has(k)) merged.push(f);
      }
      if (merged.length > 20) {
        toast.error("Max 20 contracts per batch — extras ignored.");
        return merged.slice(0, 20);
      }
      return merged;
    });
  };

  const removeFile = (idx) => setFiles((f) => f.filter((_, i) => i !== idx));

  const onDrop = (e) => {
    e.preventDefault();
    addFiles(e.dataTransfer.files);
  };

  const runBatch = async () => {
    if (files.length < 2) {
      toast.error("Add at least 2 contracts to compare.");
      return;
    }
    setLoading(true);
    setBatch(null);
    setExpanded(null);
    const fd = new FormData();
    files.forEach((f) => fd.append("files", f));
    try {
      const { data } = await api.post("/review/contract/bulk", fd, {
        headers: { "Content-Type": "multipart/form-data" },
        timeout: 180000,
      });
      setBatch(data);
      toast.success(`Reviewed ${data.stats.processed}/${data.stats.total} contracts`);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Batch review failed");
    } finally {
      setLoading(false);
    }
  };

  const sorted = useMemo(() => {
    if (!batch) return [];
    const items = [...batch.items];
    const cmpScore = (a, b) => {
      const av = typeof a.risk_score === "number" ? a.risk_score : -1;
      const bv = typeof b.risk_score === "number" ? b.risk_score : -1;
      return bv - av;
    };
    switch (sortBy) {
      case "risk_desc": items.sort(cmpScore); break;
      case "risk_asc": items.sort((a, b) => cmpScore(b, a)); break;
      case "name": items.sort((a, b) => (a.filename || "").localeCompare(b.filename || "")); break;
      case "flags": items.sort((a, b) => (b.red_flags_count || 0) - (a.red_flags_count || 0)); break;
      default: break;
    }
    return items;
  }, [batch, sortBy]);

  const bestWorst = useMemo(() => {
    if (!batch) return { best: null, worst: null };
    const ok = batch.items.filter((x) => x.ok && typeof x.risk_score === "number");
    if (!ok.length) return { best: null, worst: null };
    return {
      best: [...ok].sort((a, b) => a.risk_score - b.risk_score)[0],
      worst: [...ok].sort((a, b) => b.risk_score - a.risk_score)[0],
    };
  }, [batch]);

  return (
    <div className="max-w-7xl mx-auto p-6 md:p-10">
      <header className="mb-8">
        <div className="nm-overline">Advanced · Batch AI Review</div>
        <h1 className="font-display font-black text-3xl md:text-4xl tracking-tighter flex items-center gap-3 mt-2">
          <Layers className="w-8 h-8 text-[var(--nm-saffron)]" /> Bulk Contract Review
        </h1>
        <p className="text-[var(--nm-ink-soft)] mt-2 text-sm">
          Drop 2–20 contracts (PDF / DOCX / TXT). Get a comparative risk-score league table across the batch.
        </p>
      </header>

      {/* Upload zone */}
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={onDrop}
        onClick={() => fileRef.current?.click()}
        className="border-2 border-dashed border-[var(--nm-border)] p-8 text-center cursor-pointer hover:border-[var(--nm-ink)] hover:bg-slate-50 transition-colors"
        data-testid="bulk-dropzone"
      >
        <input
          ref={fileRef}
          type="file"
          accept=".pdf,.docx,.txt"
          multiple
          className="hidden"
          onChange={(e) => addFiles(e.target.files)}
          data-testid="bulk-file-input"
        />
        <Upload className="w-8 h-8 mx-auto text-[var(--nm-ink-soft)]" />
        <div className="font-display font-bold text-lg mt-3">
          Drop multiple contracts here or click to add
        </div>
        <div className="text-xs text-[var(--nm-ink-soft)] mt-1">
          PDF, DOCX or TXT · up to 20 files · 15 MB each
        </div>
      </div>

      {/* File queue */}
      {files.length > 0 && (
        <div className="mt-4 border border-[var(--nm-border)] bg-white" data-testid="bulk-file-queue">
          <div className="px-4 py-3 border-b border-[var(--nm-border)] flex items-center justify-between bg-slate-50">
            <div className="nm-overline">Queue · {files.length} file{files.length === 1 ? "" : "s"}</div>
            <button
              onClick={() => setFiles([])}
              className="text-xs text-[var(--nm-saffron)] underline"
              data-testid="bulk-clear-btn"
            >
              Clear all
            </button>
          </div>
          <ul className="divide-y divide-[var(--nm-border)]">
            {files.map((f, i) => (
              <li key={f.name + i} className="px-4 py-2 flex items-center justify-between text-sm">
                <div className="flex items-center gap-2 min-w-0">
                  <FileText className="w-4 h-4 text-[var(--nm-saffron)] shrink-0" />
                  <span className="truncate">{f.name}</span>
                  <span className="text-xs text-[var(--nm-ink-soft)] shrink-0">
                    {(f.size / 1024).toFixed(1)} KB
                  </span>
                </div>
                <button
                  onClick={() => removeFile(i)}
                  className="p-1 hover:bg-slate-100"
                  data-testid={`bulk-remove-${i}`}
                >
                  <X className="w-4 h-4" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-6 flex flex-wrap gap-3 items-center">
        <button
          className="nm-btn saffron"
          onClick={runBatch}
          disabled={loading || files.length < 2}
          data-testid="bulk-run-btn"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
          {loading
            ? `Reviewing ${files.length}…`
            : files.length === 0
              ? "Review contracts"
              : `Review ${files.length} contract${files.length === 1 ? "" : "s"}`}
        </button>
        {files.length < 2 && !loading && (
          <span className="text-xs text-[var(--nm-ink-soft)]">Add at least 2 contracts to compare.</span>
        )}
        {loading && (
          <span className="text-xs text-[var(--nm-ink-soft)]">
            Running in parallel — this may take up to a minute for large batches.
          </span>
        )}
      </div>

      {/* Results */}
      {batch && (
        <div className="mt-10 space-y-6 fade-in" data-testid="bulk-result">
          {/* Stats strip */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard icon={BarChart3} label="Reviewed" value={`${batch.stats.processed}/${batch.stats.total}`} />
            <StatCard
              icon={TrendingUp}
              label="Avg risk"
              value={batch.stats.avg_risk_score ?? "—"}
              suffix="/100"
              color={riskColor(batch.stats.avg_risk_score)}
            />
            <StatCard
              icon={AlertTriangle}
              label="High-risk contracts"
              value={batch.stats.high_risk_count}
              color="#dc2626"
            />
            <StatCard
              icon={TrendingDown}
              label="Safest score"
              value={batch.stats.lowest_risk ?? "—"}
              suffix="/100"
              color="#16a34a"
            />
          </div>

          {/* Best / worst callouts */}
          {(bestWorst.best || bestWorst.worst) && (
            <div className="grid md:grid-cols-2 gap-3">
              {bestWorst.best && (
                <Callout tone="good" title="Safest contract" filename={bestWorst.best.filename} risk={bestWorst.best.risk_score} overall={bestWorst.best.overall_risk} />
              )}
              {bestWorst.worst && (
                <Callout tone="bad" title="Riskiest contract" filename={bestWorst.worst.filename} risk={bestWorst.worst.risk_score} overall={bestWorst.worst.overall_risk} />
              )}
            </div>
          )}

          {/* League table */}
          <div className="border border-[var(--nm-border)] bg-white">
            <div className="px-4 py-3 border-b border-[var(--nm-border)] flex items-center justify-between bg-slate-50">
              <div className="nm-overline flex items-center gap-2">
                <Trophy className="w-4 h-4" /> League table
              </div>
              <select
                className="nm-input"
                style={{ width: "auto", padding: "4px 10px", fontSize: 12 }}
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                data-testid="bulk-sort"
              >
                <option value="risk_desc">Highest risk first</option>
                <option value="risk_asc">Lowest risk first</option>
                <option value="flags">Most red flags</option>
                <option value="name">File name (A→Z)</option>
              </select>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-widest text-[var(--nm-ink-soft)] border-b border-[var(--nm-border)]">
                    <th className="px-4 py-3">#</th>
                    <th className="px-4 py-3">Contract</th>
                    <th className="px-4 py-3">Type</th>
                    <th className="px-4 py-3">Risk score</th>
                    <th className="px-4 py-3">Level</th>
                    <th className="px-4 py-3 text-center">Flags</th>
                    <th className="px-4 py-3 text-center">Missing</th>
                    <th className="px-4 py-3 w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((it, idx) => (
                    <React.Fragment key={it.filename + idx}>
                      <tr
                        onClick={() => setExpanded(expanded === idx ? null : idx)}
                        className={`border-b border-[var(--nm-border)] cursor-pointer hover:bg-[var(--nm-pale)] ${expanded === idx ? "bg-[var(--nm-pale)]" : ""}`}
                        data-testid={`bulk-row-${idx}`}
                      >
                        <td className="px-4 py-3 font-display font-bold text-[var(--nm-ink-soft)]">{idx + 1}</td>
                        <td className="px-4 py-3 max-w-[280px]">
                          <div className="font-semibold truncate">{it.filename}</div>
                          {it.ok ? (
                            <div className="text-xs text-[var(--nm-ink-soft)] truncate mt-0.5">{it.preview}</div>
                          ) : (
                            <div className="text-xs text-[var(--nm-error)] mt-0.5">⚠ {it.error}</div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-[var(--nm-ink-soft)]">{it.contract_type || "—"}</td>
                        <td className="px-4 py-3">
                          {typeof it.risk_score === "number" ? (
                            <div className="flex items-center gap-2">
                              <div className="w-24 h-2 bg-slate-100 relative overflow-hidden">
                                <div
                                  className="absolute inset-y-0 left-0"
                                  style={{ width: `${it.risk_score}%`, background: riskColor(it.risk_score) }}
                                />
                              </div>
                              <span className="font-display font-bold" style={{ color: riskColor(it.risk_score) }}>
                                {it.risk_score}
                              </span>
                            </div>
                          ) : (
                            <span className="text-[var(--nm-ink-soft)]">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3">{riskChip(it.overall_risk)}</td>
                        <td className="px-4 py-3 text-center font-mono2">{it.red_flags_count ?? "—"}</td>
                        <td className="px-4 py-3 text-center font-mono2">{it.missing_count ?? "—"}</td>
                        <td className="px-4 py-3">
                          {expanded === idx ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                        </td>
                      </tr>
                      {expanded === idx && it.ok && (
                        <tr className="border-b border-[var(--nm-border)] bg-slate-50/40">
                          <td colSpan={8} className="p-6">
                            <ExpandedRow r={it.result} filename={it.filename} fullText={it.full_text} />
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ icon: Icon, label, value, suffix, color }) {
  return (
    <div className="border border-[var(--nm-border)] bg-white p-4">
      <div className="flex items-center gap-2 text-[var(--nm-ink-soft)]">
        <Icon className="w-4 h-4" />
        <span className="nm-overline" style={{ color: "var(--nm-ink-soft)" }}>{label}</span>
      </div>
      <div className="font-display font-black text-3xl mt-2" style={{ color: color || "var(--nm-ink)" }}>
        {value}
        {suffix && <span className="text-base text-[var(--nm-ink-soft)] font-normal">{suffix}</span>}
      </div>
    </div>
  );
}

function Callout({ tone, title, filename, risk, overall }) {
  const isGood = tone === "good";
  return (
    <div
      className="border p-4 flex items-start gap-3"
      style={{
        background: isGood ? "#f0fdf4" : "#fef2f2",
        borderColor: isGood ? "#bbf7d0" : "#fecaca",
      }}
    >
      {isGood ? <Trophy className="w-5 h-5 text-[var(--nm-success)] mt-0.5" /> : <AlertTriangle className="w-5 h-5 text-[var(--nm-error)] mt-0.5" />}
      <div className="min-w-0 flex-1">
        <div className="text-xs uppercase tracking-widest font-semibold" style={{ color: isGood ? "#166534" : "#991b1b" }}>
          {title}
        </div>
        <div className="font-semibold mt-1 truncate">{filename}</div>
        <div className="text-sm mt-1 flex items-center gap-2">
          Score <span className="font-display font-bold text-xl" style={{ color: riskColor(risk) }}>{risk}</span> · {riskChip(overall)}
        </div>
      </div>
    </div>
  );
}

function ExpandedRow({ r, filename, fullText }) {
  const [downloading, setDownloading] = useState(false);

  const downloadRedline = async () => {
    if (!fullText || !r) return;
    setDownloading(true);
    try {
      const token = localStorage.getItem("nm_token");
      const res = await fetch(`${API}/review/contract/redline-from-review`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ contract_text: fullText, review: r, filename }),
      });
      if (!res.ok) throw new Error("failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `redline-${filename?.replace(/\.(pdf|docx|txt)$/i, "") || "contract"}.docx`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Redlined DOCX downloaded");
    } catch (e) {
      toast.error("Download failed");
    } finally {
      setDownloading(false);
    }
  };

  if (!r) return null;
  return (
    <div>
      <div className="mb-4">
        <button
          onClick={downloadRedline}
          className="nm-btn saffron"
          disabled={downloading}
          data-testid={`bulk-redline-${filename}`}
        >
          {downloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
          {downloading ? "Preparing DOCX…" : "Download redlined DOCX"}
        </button>
      </div>
      <div className="grid md:grid-cols-2 gap-6">
      <div>
        <div className="nm-overline">Summary</div>
        <p className="text-sm mt-1 leading-relaxed">{r.summary || "—"}</p>
        {r.red_flags?.length > 0 && (
          <div className="mt-4">
            <div className="nm-overline">Red flags</div>
            <ul className="mt-2 space-y-2">
              {r.red_flags.map((f, i) => (
                <li key={i} className="text-sm border border-[var(--nm-border)] p-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="font-semibold">{f.clause}</div>
                    {riskChip(f.severity)}
                  </div>
                  <p className="text-[var(--nm-ink-soft)] mt-1">{f.issue}</p>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
      <div>
        {r.missing_protections?.length > 0 && (
          <div>
            <div className="nm-overline">Missing protections</div>
            <ul className="text-sm mt-2 space-y-1">
              {r.missing_protections.map((m, i) => (
                <li key={i} className="flex gap-2">
                  <span className="w-1.5 h-1.5 mt-2 shrink-0 bg-[var(--nm-error)]" />
                  <span>{m}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {r.favourable_points?.length > 0 && (
          <div className="mt-4">
            <div className="nm-overline">Favourable points</div>
            <ul className="text-sm mt-2 space-y-1">
              {r.favourable_points.map((m, i) => (
                <li key={i} className="flex gap-2">
                  <span className="w-1.5 h-1.5 mt-2 shrink-0 bg-[var(--nm-success)]" />
                  <span>{m}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {r.recommendations?.length > 0 && (
          <div className="mt-4 border-l-4 border-[var(--nm-saffron)] bg-[var(--nm-pale)] p-3">
            <div className="nm-overline">Recommendations</div>
            <ul className="text-sm mt-2 space-y-1">
              {r.recommendations.map((m, i) => <li key={i}>• {m}</li>)}
            </ul>
          </div>
        )}
      </div>
      </div>
    </div>
  );
}
