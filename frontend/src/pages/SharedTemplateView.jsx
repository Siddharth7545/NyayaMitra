import React, { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import axios from "axios";
import { Scale, Loader2, Copy, Check, Download } from "lucide-react";
import { toast } from "sonner";

const BACKEND = process.env.REACT_APP_BACKEND_URL;

export default function SharedTemplateView() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [copied, setCopied] = useState(false);
  const [err, setErr] = useState(false);

  useEffect(() => {
    axios
      .get(`${BACKEND}/api/templates/share/${id}`)
      .then((r) => setData(r.data))
      .catch(() => setErr(true));
  }, [id]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(data.text);
      setCopied(true);
      toast.success("Copied");
      setTimeout(() => setCopied(false), 1500);
    } catch (e) {
      toast.info("Clipboard blocked — please select and copy manually");
    }
  };

  const download = () => {
    const blob = new Blob([data.text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${data.slug}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (err) {
    return (
      <div className="min-h-screen flex items-center justify-center p-10">
        <div className="text-center">
          <h1 className="font-display font-black text-3xl">Shared draft not found</h1>
          <p className="text-[var(--nm-ink-soft)] mt-2">This link may have expired or was never created.</p>
          <Link to="/" className="nm-btn saffron mt-6">Go home</Link>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen flex items-center justify-center text-[var(--nm-ink-soft)]">
        <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading shared draft…
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <nav className="border-b border-[var(--nm-border)] bg-white/80 backdrop-blur-xl sticky top-0 z-40">
        <div className="max-w-4xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <Scale className="w-6 h-6" />
            <div className="font-display font-black text-lg tracking-tight">
              NYAYA<span className="text-[var(--nm-saffron)]">·</span>MITRA
            </div>
          </Link>
          <span className="nm-chip">SHARED DRAFT · READ-ONLY</span>
        </div>
      </nav>

      <div className="max-w-4xl mx-auto p-6 md:p-10">
        <div className="nm-overline">Shared by {data.user_name}</div>
        <h1 className="font-display font-black text-3xl md:text-4xl tracking-tighter mt-2" data-testid="shared-title">{data.title}</h1>
        <div className="text-xs text-[var(--nm-ink-soft)] mt-1 font-mono2">Created: {new Date(data.created_at).toLocaleString()}</div>

        <div className="mt-6 flex gap-2">
          <button onClick={copy} className="nm-btn ghost" data-testid="shared-copy">
            {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />} {copied ? "Copied" : "Copy text"}
          </button>
          <button onClick={download} className="nm-btn ghost">
            <Download className="w-4 h-4" /> Download .txt
          </button>
        </div>

        <div className="mt-6 border border-[var(--nm-border)] bg-white p-6">
          <pre className="prose-legal font-mono2 text-[13px] whitespace-pre-wrap" data-testid="shared-text">{data.text}</pre>
        </div>

        <div className="mt-8 border-l-4 border-[var(--nm-saffron)] bg-[var(--nm-pale)] p-4 text-sm">
          This draft was generated on Nyaya Mitra. It is for information only and does not constitute legal advice.
          Please have a licensed advocate review before signing.
        </div>
      </div>
    </div>
  );
}
