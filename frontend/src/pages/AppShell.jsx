import React from "react";
import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import {
  Scale, LayoutGrid, MessageSquare, FileSearch, PenTool, ShieldCheck,
  Search, ShieldAlert, LogOut, Home, Gavel, Store, Layers, BookMarked,
} from "lucide-react";

const NAV = [
  { to: "/app", icon: LayoutGrid, label: "Dashboard", end: true },
  { to: "/app/chatbot", icon: MessageSquare, label: "Legal Chatbot" },
  { to: "/app/document-analyzer", icon: FileSearch, label: "Doc Analyzer" },
  { to: "/app/petition-draft", icon: PenTool, label: "Draft Petition" },
  { to: "/app/contract-review", icon: ShieldCheck, label: "Contract Review" },
  { to: "/app/bulk-contracts", icon: Layers, label: "Bulk Contracts" },
  { to: "/app/templates", icon: BookMarked, label: "Templates" },
  { to: "/app/research", icon: Search, label: "Legal Research" },
  { to: "/app/cnr", icon: Gavel, label: "CNR Tracker" },
  { to: "/app/marketplace", icon: Store, label: "Lawyer Directory" },
  { to: "/app/fraud/sms-scam", icon: ShieldAlert, label: "Fraud Detect" },
];

export default function AppShell() {
  const { user, logout } = useAuth();
  const nav = useNavigate();

  return (
    <div className="min-h-screen flex bg-[var(--nm-bg)]">
      {/* Sidebar */}
      <aside className="w-60 shrink-0 border-r border-[var(--nm-border)] bg-white sticky top-0 h-screen flex flex-col" data-testid="app-sidebar">
        <Link to="/app" className="h-16 border-b border-[var(--nm-border)] px-5 flex items-center gap-2">
          <Scale className="w-5 h-5" />
          <span className="font-display font-black tracking-tight">
            NYAYA<span className="text-[var(--nm-saffron)]">·</span>MITRA
          </span>
        </Link>
        <nav className="flex-1 py-4 px-3 space-y-0.5">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 text-sm border-l-2 transition-colors ${
                  isActive
                    ? "border-[var(--nm-saffron)] bg-[var(--nm-pale)] text-[var(--nm-ink)] font-semibold"
                    : "border-transparent text-[var(--nm-ink-soft)] hover:text-[var(--nm-ink)] hover:bg-slate-50"
                }`
              }
              data-testid={`nav-${n.label.toLowerCase().replace(/\s+/g, "-")}`}
            >
              <n.icon className="w-4 h-4" strokeWidth={1.75} />
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-[var(--nm-border)] p-4">
          <div className="text-xs uppercase tracking-widest text-[var(--nm-ink-soft)]">Signed in</div>
          <div className="font-semibold truncate mt-1" data-testid="user-name">{user?.name}</div>
          <div className="text-xs text-[var(--nm-ink-soft)] truncate">{user?.email}</div>
          <div className="mt-3 flex gap-2">
            <button
              onClick={() => nav("/")}
              className="flex-1 inline-flex justify-center items-center gap-1 border border-[var(--nm-border)] py-1.5 text-xs hover:border-[var(--nm-ink)]"
              data-testid="go-home-btn"
            >
              <Home className="w-3.5 h-3.5" /> Home
            </button>
            <button
              onClick={() => { logout(); nav("/"); }}
              className="flex-1 inline-flex justify-center items-center gap-1 border border-[var(--nm-border)] py-1.5 text-xs hover:border-[var(--nm-error)] hover:text-[var(--nm-error)]"
              data-testid="logout-btn"
            >
              <LogOut className="w-3.5 h-3.5" /> Logout
            </button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 min-w-0">
        <Outlet />
      </main>
    </div>
  );
}
