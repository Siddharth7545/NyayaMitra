import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "@/lib/api";
import * as Icons from "lucide-react";

const flagshipRoute = {
  chatbot: "/app/chatbot",
  "document-analyzer": "/app/document-analyzer",
  "petition-draft": "/app/petition-draft",
  "contract-review": "/app/contract-review",
  "contract-agent": "/app/contract-agent",
  research: "/app/research",
  "research-assistant": "/app/research-assistant",
  "court-tracking": "/app/cnr",
  "case-agent": "/app/cnr",
  marketplace: "/app/marketplace",
  "bulk-contracts": "/app/bulk-contracts",
  templates: "/app/templates",
  voice: "/app/voice",
  "sms-scam": "/app/fraud/sms-scam",
  "email-fraud": "/app/fraud/email-fraud",
  "phishing-url": "/app/fraud/phishing-url",
  "risk-engine": "/app/fraud/risk-engine",
  "fraud-report": "/app/fraud/fraud-report",
  "community-alerts": "/app/fraud/community-alerts",
  awareness: "/app/fraud/awareness",
};

function iconFor(name) {
  const map = {
    briefcase: Icons.Briefcase,
    "file-search": Icons.FileSearch,
    video: Icons.Video,
    gavel: Icons.Gavel,
    "file-check": Icons.FileCheck,
    search: Icons.Search,
    "shield-alert": Icons.ShieldAlert,
    copyright: Icons.Copyright,
    landmark: Icons.Landmark,
    "shopping-bag": Icons.ShoppingBag,
    "message-square": Icons.MessageSquare,
    "clipboard-check": Icons.ClipboardCheck,
    "folder-lock": Icons.FolderLock,
    handshake: Icons.Handshake,
    activity: Icons.Activity,
    car: Icons.Car,
    "file-text": Icons.FileText,
    stamp: Icons.Stamp,
    "bar-chart-3": Icons.BarChart3,
    sparkles: Icons.Sparkles,
    "pen-tool": Icons.PenTool,
    "shield-check": Icons.ShieldCheck,
    layers: Icons.Layers,
    "book-marked": Icons.BookMarked,
    users: Icons.Users,
    radar: Icons.Radar,
    mic: Icons.Mic,
    languages: Icons.Languages,
    "graduation-cap": Icons.GraduationCap,
    store: Icons.Store,
    "message-circle-warning": Icons.MessageCircleWarning || Icons.MessageCircle,
    "mail-warning": Icons.MailWarning || Icons.Mail,
    "link-2": Icons.Link2,
    gauge: Icons.Gauge,
    flag: Icons.Flag,
    "bell-ring": Icons.BellRing,
    brain: Icons.Brain,
  };
  return map[name] || Icons.Circle;
}

export default function Dashboard() {
  const [data, setData] = useState(null);
  const nav = useNavigate();

  useEffect(() => {
    api.get("/modules").then((r) => setData(r.data));
  }, []);

  const openModule = (slug) => {
    if (flagshipRoute[slug]) return nav(flagshipRoute[slug]);
    nav(`/app/module/${slug}`);
  };

  // Every module (flagship + generic AI) is live now
  const isLive = () => true;

  return (
    <div className="max-w-7xl mx-auto p-6 md:p-10">
      <header className="mb-10 fade-in">
        <div className="nm-overline mb-3">Unified Legal-Tech Dashboard</div>
        <h1 className="font-display font-black text-4xl md:text-5xl tracking-tighter">
          Choose a module.
        </h1>
        <p className="text-[var(--nm-ink-soft)] mt-3 max-w-2xl">
          {data ? `${data.categories.reduce((n, c) => n + c.modules.length, 0)} modules across ${data.categories.length} categories. All flagships are fully live.` : ""}
        </p>
      </header>

      {!data && (
        <div className="text-[var(--nm-ink-soft)]" data-testid="dashboard-loading">Loading modules…</div>
      )}

      {data?.categories.map((cat) => (
        <section key={cat.key} className="mb-14" data-testid={`section-${cat.key}`}>
          <div className="flex items-baseline justify-between mb-6">
            <h2 className="font-display font-bold text-2xl md:text-3xl tracking-tight nm-marker">
              {cat.name}
            </h2>
            <span className="nm-chip">{cat.modules.length} modules</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 stagger">
            {cat.modules.map((m) => {
              const Icon = iconFor(m.icon);
              return (
                <button
                  key={m.slug}
                  onClick={() => openModule(m.slug)}
                  className={`nm-card text-left ${m.flagship ? "flagship" : ""}`}
                  data-testid={`module-${m.slug}`}
                >
                  <div className="flex items-start justify-between">
                    <Icon
                      className={`w-6 h-6 ${m.flagship ? "text-[var(--nm-saffron)]" : "text-[var(--nm-ink)]"}`}
                      strokeWidth={1.75}
                    />
                    <span className="nm-chip risk-low">LIVE</span>
                  </div>
                  <div className="font-display font-bold text-lg mt-4 leading-tight">{m.name}</div>
                  {m.flagship && (
                    <div className="text-xs text-[var(--nm-saffron)] mt-1 uppercase tracking-widest">Flagship</div>
                  )}
                </button>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
