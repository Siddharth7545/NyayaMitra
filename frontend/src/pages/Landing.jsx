import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { Scale, ArrowRight, Sparkles, ShieldCheck, FileSearch, Gavel, PenTool, Search } from "lucide-react";

export default function Landing() {
  const { token } = useAuth();
  const nav = useNavigate();

  const modules = [
    { icon: Sparkles, title: "AI Legal Chatbot", desc: "Ask anything about Indian law — IPC, CrPC, Consumer Act, RTI, IT Act. Cited answers in plain English." },
    { icon: FileSearch, title: "Document Analyzer", desc: "Upload agreements, notices, orders — get parties, obligations, risks & missing clauses in seconds." },
    { icon: PenTool, title: "Petition & Notice Drafting", desc: "Consumer complaints, RTI appeals, cheque bounce notices — court-ready drafts in one form." },
    { icon: ShieldCheck, title: "Contract Review", desc: "Red flags, missing protections, favourable clauses — a senior advocate's review in 30 seconds." },
    { icon: Search, title: "Legal Research Engine", desc: "Statutes and landmark judgments with citations. Built for advocates, students & citizens." },
    { icon: Gavel, title: "Fraud & Scam Detection", desc: "Paste any SMS, email or URL. Get a risk score and where to report on cybercrime.gov.in / 1930." },
  ];

  return (
    <div className="min-h-screen">
      {/* NAV */}
      <nav className="border-b border-[var(--nm-border)] bg-white/80 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2" data-testid="landing-logo">
            <Scale className="w-6 h-6" strokeWidth={2} />
            <div className="font-display font-black text-lg tracking-tight">
              NYAYA<span className="text-[var(--nm-saffron)]">·</span>MITRA
            </div>
          </Link>
          <div className="flex items-center gap-3">
            <span className="nm-chip hidden md:inline-flex">India · Legal AI</span>
            {token ? (
              <Link to="/app" className="nm-btn saffron" data-testid="landing-open-app">
                Open App <ArrowRight className="w-4 h-4" />
              </Link>
            ) : (
              <>
                <Link to="/auth" className="nm-btn ghost" data-testid="landing-signin">Sign in</Link>
                <Link to="/auth?mode=register" className="nm-btn saffron" data-testid="landing-get-started">
                  Get Started <ArrowRight className="w-4 h-4" />
                </Link>
              </>
            )}
          </div>
        </div>
      </nav>

      {/* HERO */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-24">
        <div className="grid lg:grid-cols-12 gap-10 items-end">
          <div className="lg:col-span-8 fade-in">
            <div className="nm-overline mb-6">A unified legal-tech OS · भारत · 37 modules</div>
            <h1 className="font-display font-black text-5xl sm:text-6xl lg:text-7xl leading-[0.95] tracking-tighter">
              Every Indian legal <br />
              workflow, <span className="text-[var(--nm-saffron)]">in one</span> place.
            </h1>
            <p className="mt-8 text-lg text-[var(--nm-ink-soft)] max-w-2xl leading-relaxed">
              Nyaya Mitra is an AI-native platform for citizens, advocates and law students —
              covering case management, drafting, contract review, research, RTI, cyber crime,
              consumer grievance and real-time scam detection. Built on Indian statutes and case law.
            </p>
            <div className="mt-10 flex flex-wrap gap-3">
              <button
                className="nm-btn saffron"
                onClick={() => nav(token ? "/app" : "/auth?mode=register")}
                data-testid="hero-primary-cta"
              >
                {token ? "Open Dashboard" : "Start free"} <ArrowRight className="w-4 h-4" />
              </button>
              <a href="#modules" className="nm-btn ghost" data-testid="hero-explore">Explore modules</a>
            </div>
          </div>

          <div className="lg:col-span-4">
            <div className="border border-[var(--nm-ink)] bg-white p-6 relative">
              <div className="absolute -top-3 -left-3 nm-chip bg-[var(--nm-ink)] text-white border-[var(--nm-ink)]">
                LIVE STATS
              </div>
              <div className="grid grid-cols-2 gap-6 mt-4">
                <Stat n="37" l="Legal Modules" />
                <Stat n="8" l="AI Flagships" />
                <Stat n="12+" l="Statutes covered" />
                <Stat n="1930" l="Cyber helpline" />
              </div>
              <div className="mt-6 pt-6 border-t border-[var(--nm-border)] text-xs text-[var(--nm-ink-soft)]">
                Powered by Gemini 3 Flash · Indian jurisdiction · Not a substitute for licensed advocates.
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* MODULES */}
      <section id="modules" className="border-t border-[var(--nm-border)] bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
          <div className="mb-12">
            <div className="nm-overline mb-3">Six flagship agents</div>
            <h2 className="font-display font-black text-3xl md:text-5xl tracking-tighter max-w-3xl">
              Real AI. Real Indian law. <br />No fluff.
            </h2>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4 stagger">
            {modules.map((m) => (
              <div key={m.title} className="nm-card flagship">
                <m.icon className="w-6 h-6 text-[var(--nm-saffron)]" strokeWidth={1.75} />
                <div className="font-display font-bold text-xl mt-4">{m.title}</div>
                <div className="text-sm mt-2 text-[var(--nm-ink-soft)] leading-relaxed">{m.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24">
        <div className="border border-[var(--nm-ink)] bg-[var(--nm-ink)] text-white p-10 md:p-16 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div>
            <div className="nm-overline text-[var(--nm-saffron)] mb-3">Ready when you are</div>
            <h3 className="font-display font-black text-3xl md:text-4xl tracking-tighter">
              Free during preview.
            </h3>
            <p className="text-white/70 mt-3 max-w-lg">
              Sign up in 20 seconds — no credit card. Start with the AI Chatbot and Document Analyzer.
            </p>
          </div>
          <button
            className="nm-btn saffron"
            onClick={() => nav("/auth?mode=register")}
            data-testid="cta-register"
          >
            Create free account <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </section>

      <footer className="border-t border-[var(--nm-border)] py-8 text-center text-xs text-[var(--nm-ink-soft)]">
        © 2026 Nyaya Mitra · Built for India. This is not legal advice.
      </footer>
    </div>
  );
}

function Stat({ n, l }) {
  return (
    <div>
      <div className="font-display font-black text-3xl">{n}</div>
      <div className="text-xs uppercase tracking-widest text-[var(--nm-ink-soft)] mt-1">{l}</div>
    </div>
  );
}
