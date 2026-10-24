import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api from "@/lib/api";
import { ShieldAlert, Loader2, AlertTriangle, ExternalLink, BellRing } from "lucide-react";
import { toast } from "sonner";

const CONFIG = {
  "sms-scam": {
    title: "Message Scam Detection",
    kind: "message",
    placeholder: "Paste the suspicious SMS or WhatsApp message here…",
    sample: "Congratulations! You have won ₹25,00,000 in KBC lottery. To claim, deposit ₹15,000 processing fee to a/c 401203xxxxx and call 9876543210 immediately.",
  },
  "email-fraud": {
    title: "Email Fraud Detection",
    kind: "email",
    placeholder: "Paste the suspicious email content (subject + body)…",
    sample: "Subject: URGENT: Your SBI account will be blocked\n\nDear Customer, Your KYC is pending. Update NOW at http://sbi-secure-kyc.co/verify — else account will be frozen in 24 hours.",
  },
  "phishing-url": {
    title: "Phishing URL Detection",
    kind: "url",
    placeholder: "Paste a URL to check…",
    sample: "https://sbi-online-secure-kyc.verify-india.co/login",
  },
  "risk-engine": {
    title: "Real-Time Risk Scoring",
    kind: "auto",
    placeholder: "Paste any suspicious content (message / email / link)…",
    sample: "You have received ₹50,000 credit. To confirm, share OTP received on your registered number.",
  },
  "fraud-report": {
    title: "Fraud Reporting",
    kind: "auto",
    placeholder: "Describe the fraud you experienced or paste the scam content…",
    sample: "I got a call from someone claiming to be from IT department asking me to install AnyDesk to file returns.",
  },
  "community-alerts": {
    title: "Community Threat Alerts",
    kind: "auto",
    placeholder: "",
    sample: "",
    community: true,
  },
  awareness: {
    title: "Cyber Awareness Assistant",
    kind: "auto",
    placeholder: "Ask a cyber-safety question or paste content to check…",
    sample: "How can I stay safe from UPI frauds?",
  },
};

export default function FraudPage() {
  const { slug } = useParams();
  const nav = useNavigate();
  const cfg = CONFIG[slug] || CONFIG["sms-scam"];
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [community, setCommunity] = useState([]);

  useEffect(() => {
    setContent("");
    setResult(null);
    if (cfg.community) {
      api.get("/fraud/community").then((r) => setCommunity(r.data));
    }
  }, [slug]);

  const scan = async () => {
    if (!content.trim()) {
      toast.error("Please enter content to scan.");
      return;
    }
    setLoading(true);
    setResult(null);
    try {
      const { data } = await api.post("/fraud/detect", { content, kind: cfg.kind });
      setResult(data.result);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Scan failed");
    } finally {
      setLoading(false);
    }
  };

  if (cfg.community) {
    return (
      <div className="max-w-5xl mx-auto p-6 md:p-10">
        <Header title={cfg.title} />
        <div className="mt-6">
          <div className="nm-overline mb-3">Recent community-reported threats</div>
          <div className="space-y-3">
            {community.length === 0 && <div className="text-[var(--nm-ink-soft)]">No community alerts yet.</div>}
            {community.map((c) => (
              <div key={c.id} className="border border-[var(--nm-border)] bg-white p-4 flex items-start gap-3">
                <BellRing className="w-4 h-4 text-[var(--nm-saffron)] mt-1 shrink-0" />
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="nm-chip">{c.kind}</span>
                    <span className="nm-chip">{c.category}</span>
                    <span className={`nm-chip risk-${c.risk_level}`}>{c.risk_level}</span>
                    <span className="text-xs text-[var(--nm-ink-soft)]">by {c.user_masked}</span>
                  </div>
                  <p className="text-sm mt-2">{c.preview}…</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto p-6 md:p-10">
      <Header title={cfg.title} />

      <div className="mt-6 grid lg:grid-cols-2 gap-6">
        <div>
          <label className="text-xs uppercase tracking-widest text-[var(--nm-ink-soft)]">Content to scan</label>
          <textarea
            className="nm-input nm-textarea mt-1"
            placeholder={cfg.placeholder}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            data-testid="fraud-input"
          />
          <div className="flex gap-2 mt-3">
            <button className="nm-btn saffron" onClick={scan} disabled={loading} data-testid="fraud-scan-btn">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldAlert className="w-4 h-4" />}
              {loading ? "Scanning…" : "Scan for fraud"}
            </button>
            <button className="nm-btn ghost" onClick={() => setContent(cfg.sample)} data-testid="fraud-sample-btn">
              Load sample
            </button>
          </div>

          <div className="mt-8">
            <div className="nm-overline mb-2">Try other detectors</div>
            <div className="flex flex-wrap gap-2">
              {Object.entries(CONFIG).map(([k, c]) => (
                <button
                  key={k}
                  className={`nm-chip hover:border-[var(--nm-ink)] ${k === slug ? "border-[var(--nm-ink)]" : ""}`}
                  onClick={() => nav(`/app/fraud/${k}`)}
                >
                  {c.title}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="border border-[var(--nm-border)] bg-white p-6 min-h-[500px]" data-testid="fraud-result">
          {!result && !loading && (
            <div className="text-[var(--nm-ink-soft)] text-sm">Fraud analysis will appear here.</div>
          )}
          {loading && (
            <div className="flex items-center gap-2 text-[var(--nm-ink-soft)]">
              <Loader2 className="w-4 h-4 animate-spin" /> Analysing content…
            </div>
          )}
          {result && (
            <div className="space-y-5 fade-in">
              <div className="flex items-center justify-between">
                <div>
                  <div className="nm-overline">Risk level</div>
                  <div className="mt-1">
                    <span className={`nm-chip risk-${result.risk_level || "safe"} text-base`} style={{fontSize:14, padding:"6px 14px"}}>
                      {(result.risk_level || "safe").toUpperCase()}
                    </span>
                  </div>
                </div>
                <div className="text-right">
                  <div className="nm-overline">Score</div>
                  <div className="font-display font-black text-4xl mt-1">
                    {typeof result.risk_score === "number" ? result.risk_score : "—"}
                    <span className="text-base text-[var(--nm-ink-soft)]">/100</span>
                  </div>
                </div>
              </div>

              {result.category && (
                <div>
                  <div className="nm-overline">Category</div>
                  <div className="font-display font-bold text-lg mt-1 capitalize">{String(result.category).replace(/_/g, " ")}</div>
                </div>
              )}

              {result.red_flags?.length > 0 && (
                <div>
                  <div className="nm-overline">Red flags</div>
                  <ul className="mt-2 space-y-1.5 text-sm">
                    {result.red_flags.map((f, i) => (
                      <li key={i} className="flex gap-2">
                        <AlertTriangle className="w-4 h-4 text-[var(--nm-saffron)] shrink-0 mt-0.5" />
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {result.reasoning && (
                <div>
                  <div className="nm-overline">Why</div>
                  <p className="text-sm mt-1 leading-relaxed">{result.reasoning}</p>
                </div>
              )}

              {result.safety_advice?.length > 0 && (
                <div className="border-l-4 border-[var(--nm-saffron)] bg-[var(--nm-pale)] p-4">
                  <div className="nm-overline">Safety advice</div>
                  <ul className="mt-2 space-y-1 text-sm">
                    {result.safety_advice.map((a, i) => <li key={i}>• {a}</li>)}
                  </ul>
                </div>
              )}

              {result.report_to?.length > 0 && (
                <div>
                  <div className="nm-overline">Report to</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {result.report_to.map((r, i) => (
                      <a
                        key={i}
                        href={String(r).includes("://") ? r : `https://${r}`}
                        target="_blank"
                        rel="noreferrer"
                        className="nm-chip hover:border-[var(--nm-ink)] inline-flex items-center gap-1"
                      >
                        {r} <ExternalLink className="w-3 h-3" />
                      </a>
                    ))}
                  </div>
                </div>
              )}

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

function Header({ title }) {
  return (
    <header className="mb-2">
      <div className="nm-overline">Flagship · AI · Cyber Safety</div>
      <h1 className="font-display font-black text-3xl md:text-4xl tracking-tighter flex items-center gap-3 mt-2">
        <ShieldAlert className="w-8 h-8 text-[var(--nm-saffron)]" /> {title}
      </h1>
      <p className="text-[var(--nm-ink-soft)] mt-2 text-sm">
        Powered by Gemini 3 Flash · Report frauds to cybercrime.gov.in or dial 1930.
      </p>
    </header>
  );
}
