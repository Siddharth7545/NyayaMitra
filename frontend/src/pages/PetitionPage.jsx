import React, { useState } from "react";
import api from "@/lib/api";
import { PenTool, Loader2, Copy, Check } from "lucide-react";
import { toast } from "sonner";

const CASE_TYPES = [
  "Consumer Complaint",
  "RTI Application",
  "RTI First Appeal",
  "Cheque Bounce Notice (Sec 138 NI Act)",
  "Legal Notice — Recovery of Money",
  "Legal Notice — Defamation",
  "Legal Notice — Employer",
  "Bail Application",
  "Divorce Petition (Mutual Consent)",
  "Traffic Challan Contest",
];

export default function PetitionPage() {
  const [form, setForm] = useState({
    case_type: CASE_TYPES[0],
    parties: "",
    facts: "",
    relief_sought: "",
    jurisdiction: "India",
  });
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState("");
  const [copied, setCopied] = useState(false);

  const upd = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    if (!form.parties.trim() || !form.facts.trim() || !form.relief_sought.trim()) {
      toast.error("Please fill parties, facts and relief.");
      return;
    }
    setLoading(true);
    setDraft("");
    try {
      const { data } = await api.post("/draft/petition", form);
      setDraft(data.draft);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Drafting failed");
    } finally {
      setLoading(false);
    }
  };

  const copy = async () => {
    await navigator.clipboard.writeText(draft);
    setCopied(true);
    toast.success("Copied to clipboard");
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="max-w-6xl mx-auto p-6 md:p-10">
      <header className="mb-8">
        <div className="nm-overline">Flagship · AI</div>
        <h1 className="font-display font-black text-3xl md:text-4xl tracking-tighter flex items-center gap-3 mt-2">
          <PenTool className="w-8 h-8 text-[var(--nm-saffron)]" /> Petition &amp; Notice Drafting
        </h1>
        <p className="text-[var(--nm-ink-soft)] mt-2 text-sm">
          Court-ready drafts with proper Indian formatting, citations, and prayer.
        </p>
      </header>

      <div className="grid lg:grid-cols-2 gap-6">
        <form onSubmit={submit} className="space-y-4" data-testid="petition-form">
          <div>
            <label className="text-xs uppercase tracking-widest text-[var(--nm-ink-soft)]">Case type</label>
            <select className="nm-input mt-1" value={form.case_type} onChange={upd("case_type")} data-testid="petition-case-type">
              {CASE_TYPES.map((c) => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs uppercase tracking-widest text-[var(--nm-ink-soft)]">Parties</label>
            <textarea
              className="nm-input mt-1"
              rows={2}
              placeholder="E.g. Ramesh Kumar (Complainant) vs. XYZ Electronics Pvt Ltd (Opposite Party)"
              value={form.parties}
              onChange={upd("parties")}
              data-testid="petition-parties"
            />
          </div>
          <div>
            <label className="text-xs uppercase tracking-widest text-[var(--nm-ink-soft)]">Facts / Background</label>
            <textarea
              className="nm-input nm-textarea mt-1"
              placeholder="Describe what happened, with dates and amounts…"
              value={form.facts}
              onChange={upd("facts")}
              data-testid="petition-facts"
            />
          </div>
          <div>
            <label className="text-xs uppercase tracking-widest text-[var(--nm-ink-soft)]">Relief sought</label>
            <textarea
              className="nm-input mt-1"
              rows={3}
              placeholder="E.g. Refund of ₹45,000, compensation for mental agony, interest @ 12% p.a., costs of proceedings"
              value={form.relief_sought}
              onChange={upd("relief_sought")}
              data-testid="petition-relief"
            />
          </div>
          <div>
            <label className="text-xs uppercase tracking-widest text-[var(--nm-ink-soft)]">Jurisdiction</label>
            <input className="nm-input mt-1" value={form.jurisdiction} onChange={upd("jurisdiction")} data-testid="petition-jurisdiction"/>
          </div>
          <button type="submit" className="nm-btn saffron w-full justify-center" disabled={loading} data-testid="petition-submit-btn">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <PenTool className="w-4 h-4" />}
            {loading ? "Drafting…" : "Generate draft"}
          </button>
        </form>

        <div className="border border-[var(--nm-border)] bg-white min-h-[500px] flex flex-col" data-testid="petition-result">
          <div className="border-b border-[var(--nm-border)] px-4 py-3 flex items-center justify-between bg-slate-50">
            <div className="nm-overline">Draft output</div>
            {draft && (
              <button onClick={copy} className="nm-btn ghost" style={{padding:"6px 12px", fontSize:12}} data-testid="petition-copy-btn">
                {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />} {copied ? "Copied" : "Copy"}
              </button>
            )}
          </div>
          <div className="p-6 flex-1 overflow-auto nm-scroll">
            {!draft && !loading && (
              <div className="text-[var(--nm-ink-soft)] text-sm">Your draft will appear here.</div>
            )}
            {loading && (
              <div className="flex items-center gap-2 text-[var(--nm-ink-soft)]">
                <Loader2 className="w-4 h-4 animate-spin" /> Drafting your document…
              </div>
            )}
            {draft && <pre className="prose-legal font-mono2 text-[13px] leading-relaxed whitespace-pre-wrap">{draft}</pre>}
          </div>
        </div>
      </div>
    </div>
  );
}
