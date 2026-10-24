import React, { useEffect, useState } from "react";
import { Link, useParams, Navigate } from "react-router-dom";
import api from "@/lib/api";
import { ArrowLeft, Loader2, Sparkles, AlertTriangle, ExternalLink } from "lucide-react";
import { toast } from "sonner";

/**
 * Some slugs have a dedicated flagship page — redirect there instead of
 * showing the generic form.
 */
const FLAGSHIP_REDIRECTS = {
  "court-tracking": "/app/cnr",
  "case-agent": "/app/cnr",
  marketplace: "/app/marketplace",
  voice: "/app/voice",
};

export default function SmartModule() {
  const { slug } = useParams();
  const [spec, setSpec] = useState(null);
  const [inputs, setInputs] = useState({});
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [title, setTitle] = useState("");

  useEffect(() => {
    setSpec(null);
    setInputs({});
    setResult(null);
    // Skip loading spec for redirected slugs — cheaper
    if (FLAGSHIP_REDIRECTS[slug]) return;
    api
      .get(`/module/${slug}/spec`)
      .then((r) => {
        setSpec(r.data);
        setTitle(r.data.title);
      })
      .catch(() => setSpec({ notFound: true }));
  }, [slug]);

  // Early redirect for slugs that have a dedicated page
  if (FLAGSHIP_REDIRECTS[slug]) {
    return <Navigate to={FLAGSHIP_REDIRECTS[slug]} replace />;
  }

  const upd = (k) => (e) => setInputs({ ...inputs, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setResult(null);
    try {
      const { data } = await api.post("/module/run", { slug, inputs });
      setResult(data.result);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  if (!spec) {
    return (
      <div className="max-w-4xl mx-auto p-10 text-[var(--nm-ink-soft)]">
        <Loader2 className="w-4 h-4 animate-spin inline mr-2" /> Loading module…
      </div>
    );
  }
  if (spec.notFound) {
    return (
      <div className="max-w-3xl mx-auto p-10">
        <Link to="/app" className="text-sm text-[var(--nm-ink-soft)] inline-flex items-center gap-1">
          <ArrowLeft className="w-4 h-4" /> Back to dashboard
        </Link>
        <div className="mt-6 border border-[var(--nm-border)] bg-white p-8">
          <h1 className="font-display font-black text-2xl">Module not found</h1>
          <p className="text-sm mt-2 text-[var(--nm-ink-soft)]">
            This module doesn't exist yet. Head back to the dashboard.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-6 md:p-10">
      <Link to="/app" className="text-sm text-[var(--nm-ink-soft)] hover:text-[var(--nm-ink)] inline-flex items-center gap-1" data-testid="smart-back">
        <ArrowLeft className="w-4 h-4" /> Dashboard
      </Link>
      <header className="mt-4 mb-8">
        <div className="nm-overline">Nyaya Mitra Module</div>
        <h1 className="font-display font-black text-3xl md:text-4xl tracking-tighter mt-2 flex items-center gap-3">
          <Sparkles className="w-8 h-8 text-[var(--nm-saffron)]" /> {title}
        </h1>
        <p className="text-[var(--nm-ink-soft)] mt-2 text-sm">
          Powered by Gemini 3 Flash on Indian law. Fill the form and get an actionable, structured response.
        </p>
      </header>

      <div className="grid lg:grid-cols-2 gap-6">
        <form onSubmit={submit} className="space-y-4" data-testid="smart-form">
          {spec.fields.map((f) => (
            <div key={f.key}>
              <label className="text-xs uppercase tracking-widest text-[var(--nm-ink-soft)]">
                {f.label} {f.required && <span className="text-[var(--nm-saffron)]">*</span>}
              </label>
              {f.type === "textarea" ? (
                <textarea
                  className="nm-input nm-textarea mt-1"
                  value={inputs[f.key] || ""}
                  onChange={upd(f.key)}
                  data-testid={`smart-field-${f.key}`}
                />
              ) : (
                <input
                  className="nm-input mt-1"
                  value={inputs[f.key] || ""}
                  onChange={upd(f.key)}
                  data-testid={`smart-field-${f.key}`}
                />
              )}
            </div>
          ))}
          <button type="submit" className="nm-btn saffron w-full justify-center" disabled={loading} data-testid="smart-submit-btn">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {loading ? "Analysing with AI…" : "Run analysis"}
          </button>
        </form>

        <div className="border border-[var(--nm-border)] bg-white p-6 min-h-[400px]" data-testid="smart-result">
          {!result && !loading && (
            <div className="text-[var(--nm-ink-soft)] text-sm">
              Fill the form and click <strong>Run analysis</strong>. Your structured result will appear here.
            </div>
          )}
          {loading && (
            <div className="flex items-center gap-2 text-[var(--nm-ink-soft)]">
              <Loader2 className="w-4 h-4 animate-spin" /> AI is thinking about your case…
            </div>
          )}
          {result && <ResultView data={result} />}
        </div>
      </div>
    </div>
  );
}

/* ---------- Result rendering ---------- */
function ResultView({ data }) {
  if (!data || typeof data !== "object") {
    return <pre className="text-sm whitespace-pre-wrap">{String(data)}</pre>;
  }
  if (data.raw && Object.keys(data).length === 1) {
    return <pre className="text-sm whitespace-pre-wrap bg-slate-50 p-3 border border-[var(--nm-border)]">{data.raw}</pre>;
  }
  const labels = data.section_labels && typeof data.section_labels === "object" ? data.section_labels : {};
  return (
    <div className="space-y-5 fade-in">
      {Object.entries(data).map(([k, v]) => {
        if (k === "section_labels") return null; // internal
        return <Field key={k} label={labels[k] || humanize(k)} value={v} />;
      })}
    </div>
  );
}

function humanize(k) {
  return k
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function Field({ label, value }) {
  if (value === null || value === undefined || value === "") return null;

  // Boolean
  if (typeof value === "boolean") {
    return (
      <div>
        <div className="nm-overline">{label}</div>
        <div className="font-display font-bold text-lg mt-1">{value ? "Yes" : "No"}</div>
      </div>
    );
  }

  // Number
  if (typeof value === "number") {
    // Risk score
    if (label.toLowerCase().includes("score")) {
      return (
        <div>
          <div className="nm-overline">{label}</div>
          <div className="font-display font-black text-4xl mt-1">
            {value}
            <span className="text-base text-[var(--nm-ink-soft)]">/100</span>
          </div>
        </div>
      );
    }
    return (
      <div>
        <div className="nm-overline">{label}</div>
        <div className="font-display font-bold text-lg mt-1">{value}</div>
      </div>
    );
  }

  // Simple string
  if (typeof value === "string") {
    // Risk level chip
    const lower = value.toLowerCase();
    if (["low", "medium", "high", "safe", "suspicious", "dangerous"].includes(lower) && label.toLowerCase().includes("risk")) {
      return (
        <div>
          <div className="nm-overline">{label}</div>
          <span className={`nm-chip risk-${lower} mt-1`} style={{ fontSize: 13, padding: "6px 12px" }}>
            {lower.toUpperCase()}
          </span>
        </div>
      );
    }
    // Longer prose vs short
    const isLong = value.length > 120 || value.includes("\n");
    return (
      <div>
        <div className="nm-overline">{label}</div>
        <p className={`mt-1 ${isLong ? "prose-legal" : "text-sm"} whitespace-pre-wrap`}>{value}</p>
      </div>
    );
  }

  // Array
  if (Array.isArray(value)) {
    if (value.length === 0) return null;
    // Array of primitives
    if (value.every((x) => typeof x === "string" || typeof x === "number")) {
      return (
        <div>
          <div className="nm-overline">{label}</div>
          <ul className="mt-2 space-y-1.5 text-sm">
            {value.map((it, i) => (
              <li key={i} className="flex gap-2">
                <span className="w-1.5 h-1.5 mt-2 shrink-0 bg-[var(--nm-saffron)]" />
                <span className="flex-1">{String(it)}</span>
              </li>
            ))}
          </ul>
        </div>
      );
    }
    // Array of objects
    return (
      <div>
        <div className="nm-overline">{label}</div>
        <div className="mt-2 space-y-2">
          {value.map((obj, i) => (
            <div key={i} className="border border-[var(--nm-border)] p-3 bg-slate-50/50">
              {typeof obj === "object" && obj !== null ? (
                <div className="space-y-1.5">
                  {Object.entries(obj).map(([kk, vv]) => (
                    <SubField key={kk} k={kk} v={vv} />
                  ))}
                </div>
              ) : (
                <span className="text-sm">{String(obj)}</span>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Object
  if (typeof value === "object") {
    return (
      <div>
        <div className="nm-overline">{label}</div>
        <div className="mt-2 border border-[var(--nm-border)] p-3 space-y-1.5 bg-slate-50/50">
          {Object.entries(value).map(([kk, vv]) => (
            <SubField key={kk} k={kk} v={vv} />
          ))}
        </div>
      </div>
    );
  }

  return null;
}

function SubField({ k, v }) {
  if (v === null || v === undefined || v === "") return null;
  const label = humanize(k);
  const sevKeys = ["severity", "risk", "risk_level"];
  if (typeof v === "string" && sevKeys.includes(k)) {
    return (
      <div className="text-sm">
        <span className="text-[var(--nm-ink-soft)]">{label}: </span>
        <span className={`nm-chip risk-${v.toLowerCase()}`}>{v.toUpperCase()}</span>
      </div>
    );
  }
  if (Array.isArray(v)) {
    return (
      <div className="text-sm">
        <div className="text-xs uppercase tracking-widest text-[var(--nm-ink-soft)] mb-1">{label}</div>
        <ul className="ml-3 space-y-0.5">
          {v.map((x, i) => (
            <li key={i}>• {typeof x === "object" ? JSON.stringify(x) : String(x)}</li>
          ))}
        </ul>
      </div>
    );
  }
  if (typeof v === "object") {
    return (
      <div className="text-sm">
        <div className="text-xs uppercase tracking-widest text-[var(--nm-ink-soft)] mb-1">{label}</div>
        <div className="ml-3 space-y-0.5">
          {Object.entries(v).map(([kk, vv]) => (
            <div key={kk}>
              <span className="text-[var(--nm-ink-soft)]">{humanize(kk)}: </span>
              <span>{typeof vv === "object" ? JSON.stringify(vv) : String(vv)}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }
  return (
    <div className="text-sm">
      <span className="text-[var(--nm-ink-soft)]">{label}: </span>
      <span className="font-medium">{String(v)}</span>
    </div>
  );
}
