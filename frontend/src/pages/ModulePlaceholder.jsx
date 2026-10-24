import React from "react";
import { Link, useParams } from "react-router-dom";
import { Construction, ArrowLeft, Sparkles } from "lucide-react";

const PRETTY = {
  "case-management": "Legal Case Management System",
  consultation: "Online Legal Consultation Portal",
  "court-tracking": "Court Case Tracking Dashboard",
  "cyber-crime": "Cyber Crime Reporting System",
  "ip-management": "Intellectual Property Management Portal",
  "e-governance": "E-Governance Complaint System",
  consumer: "Consumer Grievance Management Platform",
  compliance: "Compliance Monitoring Dashboard",
  evidence: "Digital Evidence Management System",
  odr: "Online Dispute Resolution Platform",
  risk: "Legal Risk Assessment Tool",
  traffic: "Traffic Violation Management System",
  rti: "RTI Application Tracking Portal",
  "e-notary": "E-Notary Management System",
  "judicial-analytics": "Judicial Data Analytics Dashboard",
  "client-crm": "Legal Client CRM",
  "case-agent": "Court Case Tracking Agent",
  voice: "Voice-Based Legal Assistant",
  multilang: "Multi-Language Legal Support",
  "mock-court": "Mock Court (Law Student Practice)",
  marketplace: "Lawyer Marketplace Platform",
};

export default function ModulePlaceholder() {
  const { slug } = useParams();
  const name = PRETTY[slug] || "Module";
  return (
    <div className="max-w-3xl mx-auto p-10">
      <Link to="/app" className="text-sm text-[var(--nm-ink-soft)] hover:text-[var(--nm-ink)] inline-flex items-center gap-1" data-testid="placeholder-back">
        <ArrowLeft className="w-4 h-4" /> Back to dashboard
      </Link>
      <div className="mt-6 border border-[var(--nm-border)] bg-white p-10 fade-in">
        <div className="flex items-center gap-3 mb-4">
          <Construction className="w-6 h-6 text-[var(--nm-saffron)]" />
          <span className="nm-chip">COMING SOON</span>
        </div>
        <h1 className="font-display font-black text-3xl md:text-4xl tracking-tighter">{name}</h1>
        <p className="text-[var(--nm-ink-soft)] mt-4 leading-relaxed">
          This module is part of the Nyaya Mitra roadmap. The 6 flagship modules (AI Chatbot, Document Analyzer, Petition Drafting,
          Contract Review, Legal Research, Fraud Detection) are fully live in this preview. Additional modules ship in subsequent releases.
        </p>
        <div className="mt-6 border-l-4 border-[var(--nm-saffron)] bg-[var(--nm-pale)] p-4 text-sm flex gap-3">
          <Sparkles className="w-4 h-4 text-[var(--nm-saffron)] shrink-0 mt-0.5" />
          <div>
            Want to prioritise <strong>{name}</strong>? Let us know — we'll build it next.
          </div>
        </div>
        <Link to="/app" className="nm-btn saffron mt-6" data-testid="placeholder-back-btn">
          Return to dashboard
        </Link>
      </div>
    </div>
  );
}
