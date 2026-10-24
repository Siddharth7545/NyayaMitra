import React, { useEffect, useMemo, useState } from "react";
import api, { API } from "@/lib/api";
import * as Icons from "lucide-react";
import {
  BookMarked, Loader2, Download, Copy, Check, Share2, ArrowLeft,
  Sparkles, X, FileText, Languages,
} from "lucide-react";
import { toast } from "sonner";

const ICON_MAP = {
  shield: Icons.Shield,
  briefcase: Icons.Briefcase,
  "user-check": Icons.UserCheck,
  home: Icons.Home,
  building: Icons.Building2,
  "pen-tool": Icons.PenTool,
  handshake: Icons.Handshake,
  users: Icons.Users,
  stamp: Icons.Stamp,
  scroll: Icons.ScrollText,
  copyright: Icons.Copyright,
};

export default function TemplatesLibraryPage() {
  const [data, setData] = useState(null);
  const [category, setCategory] = useState("All");
  const [q, setQ] = useState("");
  const [openSlug, setOpenSlug] = useState(null);

  useEffect(() => {
    api.get("/templates").then((r) => setData(r.data));
  }, []);

  const filtered = useMemo(() => {
    if (!data) return [];
    return data.templates.filter((t) => {
      if (category !== "All" && t.category !== category) return false;
      if (q && !(`${t.title} ${t.description}`.toLowerCase().includes(q.toLowerCase()))) return false;
      return true;
    });
  }, [data, category, q]);

  if (!data) {
    return (
      <div className="p-10 text-[var(--nm-ink-soft)] flex items-center gap-2">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading templates…
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto p-6 md:p-10">
      <header className="mb-8">
        <div className="nm-overline">Advanced · Library</div>
        <h1 className="font-display font-black text-3xl md:text-4xl tracking-tighter flex items-center gap-3 mt-2">
          <BookMarked className="w-8 h-8 text-[var(--nm-saffron)]" /> Contract Templates Library
        </h1>
        <p className="text-[var(--nm-ink-soft)] mt-2 text-sm">
          {data.templates.length} vetted Indian legal templates — fill a short form, generate a court-ready draft,
          download DOCX or share via link.
        </p>
      </header>

      {/* Filter row */}
      <div className="flex flex-wrap gap-3 items-center mb-6" data-testid="templates-filters">
        <div className="flex flex-wrap gap-1">
          {["All", ...data.categories].map((c) => (
            <button
              key={c}
              onClick={() => setCategory(c)}
              className={`nm-chip ${category === c ? "border-[var(--nm-ink)] bg-[var(--nm-pale)]" : ""}`}
              data-testid={`cat-${c}`}
            >
              {c}
            </button>
          ))}
        </div>
        <div className="relative flex-1 min-w-[220px]">
          <Icons.Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--nm-ink-soft)]" />
          <input
            className="nm-input pl-10"
            placeholder="Search templates…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            data-testid="templates-search"
          />
        </div>
      </div>

      {/* Cards grid */}
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4 stagger" data-testid="templates-grid">
        {filtered.map((t) => {
          const Icon = ICON_MAP[t.icon] || Icons.FileText;
          return (
            <button
              key={t.slug}
              onClick={() => setOpenSlug(t.slug)}
              className="nm-card text-left flex flex-col"
              data-testid={`template-${t.slug}`}
            >
              <div className="flex items-start justify-between">
                <Icon className="w-6 h-6 text-[var(--nm-saffron)]" strokeWidth={1.75} />
                <span className="nm-chip">{t.category}</span>
              </div>
              <div className="font-display font-bold text-lg mt-4 leading-tight">{t.title}</div>
              <p className="text-sm text-[var(--nm-ink-soft)] mt-2 flex-1">{t.description}</p>
              <div className="mt-3 pt-3 border-t border-[var(--nm-border)] flex items-center justify-between text-xs text-[var(--nm-ink-soft)]">
                <span>{t.fields_count} fields · ~{t.estimated_pages}p</span>
                <span className="text-[var(--nm-saffron)] font-semibold">Open →</span>
              </div>
            </button>
          );
        })}
        {filtered.length === 0 && (
          <div className="col-span-full border border-[var(--nm-border)] bg-white p-8 text-center text-[var(--nm-ink-soft)]">
            No templates match your filter.
          </div>
        )}
      </div>

      {openSlug && (
        <TemplateModal slug={openSlug} onClose={() => setOpenSlug(null)} />
      )}
    </div>
  );
}

function TemplateModal({ slug, onClose }) {
  const [spec, setSpec] = useState(null);
  const [inputs, setInputs] = useState({});
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [copied, setCopied] = useState(false);
  const [shareLink, setShareLink] = useState(null);
  const [downloading, setDownloading] = useState(false);

  // Regional-language state
  const LANG_TABS = [
    { code: "english", label: "English",  native: "English" },
    { code: "hindi",   label: "Hindi",    native: "हिंदी" },
    { code: "tamil",   label: "Tamil",    native: "தமிழ்" },
    { code: "telugu",  label: "Telugu",   native: "తెలుగు" },
    { code: "bengali", label: "Bengali",  native: "বাংলা" },
    { code: "marathi", label: "Marathi",  native: "मराठी" },
  ];
  const [lang, setLang] = useState("english");
  const [translations, setTranslations] = useState({}); // { hindi: text, tamil: text, ... }
  const [translating, setTranslating] = useState(null); // lang code currently loading

  useEffect(() => {
    api.get(`/templates/${slug}`).then((r) => {
      setSpec(r.data);
      const init = {};
      for (const f of r.data.fields) if (f.default) init[f.key] = f.default;
      setInputs(init);
    });
  }, [slug]);

  const currentText = useMemo(() => {
    if (!result) return "";
    if (lang === "english") return result.text;
    return translations[lang] || "";
  }, [result, lang, translations]);

  const switchLang = async (code) => {
    setLang(code);
    setShareLink(null);
    if (!result) return;
    if (code === "english") return;
    if (translations[code]) return; // cached
    setTranslating(code);
    try {
      const { data } = await api.post("/templates/translate", {
        text: result.text,
        target_language: code,
        title: result.title,
      });
      setTranslations((prev) => ({ ...prev, [code]: data.text }));
      toast.success(`Translated to ${LANG_TABS.find((l) => l.code === code)?.label}`);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Translation failed");
      setLang("english");
    } finally {
      setTranslating(null);
    }
  };

  const generate = async () => {
    setLoading(true);
    setResult(null);
    setShareLink(null);
    setTranslations({});
    setLang("english");
    try {
      const { data } = await api.post(`/templates/${slug}/generate`, { inputs });
      setResult(data);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Generation failed");
    } finally {
      setLoading(false);
    }
  };

  const downloadDocx = async () => {
    if (!result) return;
    setDownloading(true);
    try {
      const token = localStorage.getItem("nm_token");
      let res;
      if (lang === "english") {
        res = await fetch(`${API}/templates/${slug}/docx`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ inputs }),
        });
      } else {
        // Use current translation
        res = await fetch(`${API}/templates/docx-from-text`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ title: result.title, text: currentText, language: lang }),
        });
      }
      if (!res.ok) throw new Error("Download failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const langSuffix = lang === "english" ? "" : `-${lang}`;
      a.download = `${slug}${langSuffix}.docx`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("DOCX downloaded");
    } catch (e) {
      toast.error("Download failed");
    } finally {
      setDownloading(false);
    }
  };

  const copyText = async () => {
    if (!currentText) return;
    try {
      await navigator.clipboard.writeText(currentText);
      setCopied(true);
      toast.success("Copied to clipboard");
      setTimeout(() => setCopied(false), 1500);
    } catch (e) {
      toast.info("Clipboard blocked — please select and copy manually");
    }
  };

  const share = async () => {
    if (!result) return;
    try {
      const { data } = await api.post("/templates/share", {
        slug: result.slug,
        title: lang === "english" ? result.title : `${result.title} (${LANG_TABS.find((l) => l.code === lang)?.label})`,
        text: currentText,
        inputs,
      });
      const link = `${window.location.origin}/share/${data.share_id}`;
      setShareLink(link);
      try {
        await navigator.clipboard.writeText(link);
        toast.success("Share link copied");
      } catch (_) {
        toast.info("Share link ready — copy it from the box above");
      }
    } catch (e) {
      toast.error("Share failed");
    }
  };

  if (!spec) {
    return (
      <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-white" />
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-[rgba(15,23,42,0.75)] p-2 sm:p-4 flex items-start sm:items-center justify-center overflow-y-auto" data-testid="template-modal">
      <div className="bg-white border border-[var(--nm-ink)] w-full max-w-6xl my-4 max-h-[95vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between p-5 border-b border-[var(--nm-border)] shrink-0">
          <div>
            <div className="nm-overline">{spec.category} template</div>
            <h2 className="font-display font-black text-2xl mt-1">{spec.title}</h2>
            <p className="text-sm text-[var(--nm-ink-soft)] mt-1 max-w-2xl">{spec.description}</p>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-100" data-testid="template-close-btn">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-auto grid lg:grid-cols-[380px_1fr]">
          {/* Left — form */}
          <div className="border-r border-[var(--nm-border)] p-5 space-y-3 overflow-auto nm-scroll">
            {spec.fields.map((f) => (
              <div key={f.key}>
                <label className="text-xs uppercase tracking-widest text-[var(--nm-ink-soft)]">
                  {f.label} {f.required && <span className="text-[var(--nm-saffron)]">*</span>}
                </label>
                {f.type === "textarea" ? (
                  <textarea
                    rows={2}
                    className="nm-input mt-1"
                    value={inputs[f.key] || ""}
                    onChange={(e) => setInputs({ ...inputs, [f.key]: e.target.value })}
                    placeholder={f.placeholder}
                    data-testid={`tf-${f.key}`}
                  />
                ) : (
                  <input
                    className="nm-input mt-1"
                    value={inputs[f.key] || ""}
                    onChange={(e) => setInputs({ ...inputs, [f.key]: e.target.value })}
                    placeholder={f.placeholder}
                    data-testid={`tf-${f.key}`}
                  />
                )}
              </div>
            ))}
            <button
              onClick={generate}
              className="nm-btn saffron w-full justify-center mt-4"
              disabled={loading}
              data-testid="template-generate-btn"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              {loading ? "Drafting…" : "Generate draft"}
            </button>
          </div>

          {/* Right — result */}
          <div className="flex flex-col min-h-0">
            <div className="border-b border-[var(--nm-border)] px-4 py-3 bg-slate-50 flex flex-wrap items-center justify-between gap-2 shrink-0">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-[var(--nm-saffron)]" />
                <span className="text-sm font-semibold">Generated draft</span>
              </div>
              <div className="flex gap-2 flex-wrap">
                {result && (
                  <>
                    <button onClick={copyText} className="nm-chip hover:border-[var(--nm-ink)]" data-testid="template-copy-btn">
                      {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />} {copied ? "Copied" : "Copy"}
                    </button>
                    <button onClick={share} className="nm-chip hover:border-[var(--nm-ink)]" data-testid="template-share-btn">
                      <Share2 className="w-3 h-3" /> Share link
                    </button>
                  </>
                )}
                <button
                  onClick={downloadDocx}
                  className="nm-chip hover:border-[var(--nm-ink)] bg-[var(--nm-pale)] border-[var(--nm-saffron)]"
                  disabled={downloading || !result}
                  data-testid="template-docx-btn"
                >
                  {downloading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />} {downloading ? "…" : "Download DOCX"}
                </button>
              </div>
            </div>

            {/* Language tabs */}
            {result && (
              <div className="border-b border-[var(--nm-border)] px-4 py-2 bg-white flex items-center gap-2 flex-wrap shrink-0" data-testid="lang-tabs">
                <div className="flex items-center gap-1 text-xs text-[var(--nm-ink-soft)] mr-1">
                  <Languages className="w-3.5 h-3.5" />
                  <span className="uppercase tracking-widest">Language:</span>
                </div>
                {LANG_TABS.map((l) => {
                  const active = lang === l.code;
                  const isLoading = translating === l.code;
                  return (
                    <button
                      key={l.code}
                      onClick={() => switchLang(l.code)}
                      disabled={isLoading}
                      className={`nm-chip transition-colors ${
                        active
                          ? "border-[var(--nm-ink)] bg-[var(--nm-ink)] text-white"
                          : "hover:border-[var(--nm-ink)]"
                      }`}
                      data-testid={`lang-${l.code}`}
                    >
                      {isLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                      <span>{l.native}</span>
                      {l.code !== "english" && <span className="opacity-60 ml-1">· {l.label}</span>}
                    </button>
                  );
                })}
              </div>
            )}

            <div className="p-5 overflow-auto nm-scroll flex-1 min-h-0">
              {!result && !loading && (
                <div className="text-sm text-[var(--nm-ink-soft)] max-w-md">
                  Fill the form and click <strong>Generate draft</strong> to produce a ready-to-use draft under Indian law.
                  Then switch to <strong>Hindi / Tamil / Telugu / Bengali / Marathi</strong> with one click.
                </div>
              )}
              {loading && (
                <div className="flex items-center gap-2 text-[var(--nm-ink-soft)]">
                  <Loader2 className="w-4 h-4 animate-spin" /> Drafting your document…
                </div>
              )}
              {translating && (
                <div className="flex items-center gap-2 text-[var(--nm-ink-soft)] mb-3">
                  <Loader2 className="w-4 h-4 animate-spin" /> Translating to {LANG_TABS.find((l) => l.code === translating)?.label}…
                </div>
              )}
              {result && (
                <div>
                  {shareLink && (
                    <div className="mb-4 border border-[var(--nm-border)] bg-[var(--nm-pale)] p-3 text-sm flex items-center gap-2">
                      <Share2 className="w-4 h-4 text-[var(--nm-saffron)] shrink-0" />
                      <span className="truncate flex-1"><strong>Share link:</strong> {shareLink}</span>
                    </div>
                  )}
                  <pre
                    className="prose-legal font-mono2 text-[13px] leading-relaxed whitespace-pre-wrap"
                    data-testid="template-output"
                    style={{
                      fontFamily: lang === "english"
                        ? '"IBM Plex Mono", monospace'
                        : '"IBM Plex Sans", "Noto Sans Devanagari", "Noto Sans Tamil", "Noto Sans Telugu", "Noto Sans Bengali", sans-serif',
                    }}
                  >
                    {currentText || (translating ? "…" : "")}
                  </pre>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
