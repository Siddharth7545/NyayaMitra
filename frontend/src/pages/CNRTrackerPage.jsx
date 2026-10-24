import React, { useState } from "react";
import api from "@/lib/api";
import { Gavel, Loader2, ExternalLink, AlertTriangle, Info } from "lucide-react";
import { toast } from "sonner";

export default function CNRTrackerPage() {
  const [cnr, setCnr] = useState("");
  const [lastKnown, setLastKnown] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  const track = async (e) => {
    e?.preventDefault();
    const c = cnr.trim().toUpperCase().replace(/[\s-]/g, "");
    if (c.length !== 16) {
      toast.error("CNR must be 16 characters (e.g. DLCT010012342024).");
      return;
    }
    setLoading(true);
    setResult(null);
    try {
      const { data } = await api.post("/cnr/track", { cnr: c, last_known_status: lastKnown || null });
      setResult(data);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Tracking failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto p-6 md:p-10">
      <header className="mb-8">
        <div className="nm-overline">Flagship · Live Court Data</div>
        <h1 className="font-display font-black text-3xl md:text-4xl tracking-tighter flex items-center gap-3 mt-2">
          <Gavel className="w-8 h-8 text-[var(--nm-saffron)]" /> Court Case Tracking (CNR)
        </h1>
        <p className="text-[var(--nm-ink-soft)] mt-2 text-sm">
          Enter your <strong>CNR (Case Number Record)</strong> to decode it, get a deep link to the official eCourts portal,
          and receive AI-inferred stage + next steps.
        </p>
      </header>

      <form onSubmit={track} className="grid md:grid-cols-3 gap-3 mb-6" data-testid="cnr-form">
        <div className="md:col-span-2">
          <label className="text-xs uppercase tracking-widest text-[var(--nm-ink-soft)]">CNR Number</label>
          <input
            className="nm-input font-mono2 mt-1 uppercase"
            placeholder="e.g. DLCT010012342024"
            value={cnr}
            onChange={(e) => setCnr(e.target.value)}
            maxLength={20}
            data-testid="cnr-input"
          />
        </div>
        <div className="flex items-end">
          <button type="submit" className="nm-btn saffron w-full justify-center" disabled={loading} data-testid="cnr-track-btn">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Gavel className="w-4 h-4" />}
            {loading ? "Tracking…" : "Track case"}
          </button>
        </div>
        <div className="md:col-span-3">
          <label className="text-xs uppercase tracking-widest text-[var(--nm-ink-soft)]">
            Last known status (optional — helps AI infer stage)
          </label>
          <textarea
            rows={2}
            className="nm-input mt-1"
            placeholder="e.g. Evidence stage, next date 15 May 2026"
            value={lastKnown}
            onChange={(e) => setLastKnown(e.target.value)}
            data-testid="cnr-status-input"
          />
        </div>
      </form>

      <div className="border border-[var(--nm-border)] bg-[var(--nm-pale)] p-4 mb-6 flex gap-3">
        <Info className="w-5 h-5 text-[var(--nm-saffron)] shrink-0 mt-0.5" />
        <div className="text-sm text-[var(--nm-ink)]">
          The official eCourts CNR portal is <strong>captcha-protected</strong>, so fully-automated live scrape is unreliable.
          We decode your CNR, ping the portal, and give you a direct deep link + AI-inferred stage. Click <strong>Open on eCourts</strong> below to view the live official record.
        </div>
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-[var(--nm-ink-soft)]">
          <Loader2 className="w-4 h-4 animate-spin" /> Decoding &amp; contacting eCourts portal…
        </div>
      )}

      {result && (
        <div className="space-y-6 fade-in" data-testid="cnr-result">
          {/* Decoded panel */}
          <div className="border border-[var(--nm-border)] bg-white p-6">
            <div className="flex items-start justify-between flex-wrap gap-3">
              <div>
                <div className="nm-overline">Decoded CNR</div>
                <div className="font-mono2 text-2xl mt-1 tracking-widest">{result.cnr}</div>
              </div>
              <a
                href={result.portal_deep_link}
                target="_blank"
                rel="noreferrer"
                className="nm-btn saffron"
                data-testid="cnr-open-portal"
              >
                Open on eCourts <ExternalLink className="w-4 h-4" />
              </a>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
              <Kv label="State" value={result.decoded?.state_name} />
              <Kv label="State code" value={result.decoded?.state_code} />
              <Kv label="Court code" value={result.decoded?.court_code} />
              <Kv label="Registered year" value={result.decoded?.registered_year} />
              <Kv label="Serial no." value={result.decoded?.serial_no} />
              <Kv
                label="Portal reachable"
                value={result.portal_reachable ? "Yes ✓" : "No ✗"}
              />
            </div>
          </div>

          {/* AI inferred panel */}
          {result.ai_inferred && (
            <div className="border border-[var(--nm-border)] bg-white p-6">
              <div className="flex items-center gap-2 mb-4">
                <span className="nm-chip risk-medium">AI-INFERRED</span>
                <span className="text-xs text-[var(--nm-ink-soft)]">Not live official data — confirm on eCourts</span>
              </div>
              <div className="space-y-5">
                {result.ai_inferred.inferred_stage && (
                  <div>
                    <div className="nm-overline">Likely stage</div>
                    <div className="font-display font-bold text-xl mt-1">{result.ai_inferred.inferred_stage}</div>
                  </div>
                )}
                {typeof result.ai_inferred.estimated_age_days === "number" && (
                  <div>
                    <div className="nm-overline">Approximate age</div>
                    <div className="font-display font-bold text-lg mt-1">
                      {result.ai_inferred.estimated_age_days} days
                    </div>
                  </div>
                )}
                <ListBlock title="Typical next steps" items={result.ai_inferred.typical_next_steps} />
                <ListBlock title="Documents to prepare" items={result.ai_inferred.documents_to_prepare} />
                <ListBlock title="How to monitor" items={result.ai_inferred.how_to_monitor} accent />
                {result.ai_inferred.red_flags?.length > 0 && (
                  <div>
                    <div className="nm-overline">Red flags</div>
                    <ul className="mt-2 space-y-1.5 text-sm">
                      {result.ai_inferred.red_flags.map((rf, i) => (
                        <li key={i} className="flex gap-2">
                          <AlertTriangle className="w-4 h-4 text-[var(--nm-saffron)] shrink-0 mt-0.5" />
                          <span>{rf}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {result.ai_inferred.client_update_draft && (
                  <div className="border-l-4 border-[var(--nm-saffron)] bg-[var(--nm-pale)] p-4">
                    <div className="nm-overline">Client update draft</div>
                    <p className="mt-2 text-sm">{result.ai_inferred.client_update_draft}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="text-xs text-[var(--nm-ink-soft)] italic">
            {result.live_lookup_note}
          </div>
        </div>
      )}
    </div>
  );
}

function Kv({ label, value }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-widest text-[var(--nm-ink-soft)]">{label}</div>
      <div className="font-display font-bold mt-1">{value || "—"}</div>
    </div>
  );
}

function ListBlock({ title, items, accent }) {
  if (!items || !items.length) return null;
  return (
    <div>
      <div className="nm-overline">{title}</div>
      <ul className="mt-2 space-y-1.5 text-sm">
        {items.map((it, i) => (
          <li key={i} className="flex gap-2">
            <span className={`w-1.5 h-1.5 mt-2 shrink-0 ${accent ? "bg-[var(--nm-saffron)]" : "bg-[var(--nm-ink)]"}`} />
            <span>{it}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
