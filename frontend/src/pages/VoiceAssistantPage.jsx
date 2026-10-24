import React, { useEffect, useRef, useState } from "react";
import api from "@/lib/api";
import { Mic, MicOff, Loader2, Sparkles, StopCircle, Trash2, Volume2 } from "lucide-react";
import { toast } from "sonner";

const LANGS = [
  { code: "en-IN", label: "English (India)" },
  { code: "hi-IN", label: "हिंदी" },
  { code: "ta-IN", label: "தமிழ்" },
  { code: "te-IN", label: "తెలుగు" },
  { code: "bn-IN", label: "বাংলা" },
  { code: "mr-IN", label: "मराठी" },
];

// Localized UI strings (button labels, empty states, section headers if AI omits section_labels)
const UI_STRINGS = {
  "en-IN": { ask: "Ask Nyaya Mitra", clear: "Clear", read_aloud: "Read aloud", start: "Start speaking", stop: "Stop", listening: "Listening…", thinking: "Thinking…", placeholder: "Speak or type your question here…", answer: "Answer", key_points: "Key points", next_action: "Next action", question_label: "Your question", lang_label: "Language:" },
  "hi-IN": { ask: "पूछें",                clear: "मिटाएँ",  read_aloud: "सुनें",     start: "बोलना शुरू करें", stop: "रोकें", listening: "सुन रहा हूँ…", thinking: "सोच रहा हूँ…", placeholder: "यहाँ बोलें या टाइप करें…", answer: "उत्तर", key_points: "मुख्य बिंदु", next_action: "अगली कार्रवाई", question_label: "आपका प्रश्न", lang_label: "भाषा:" },
  "ta-IN": { ask: "கேளுங்கள்",           clear: "அழி",     read_aloud: "கேட்க",    start: "பேசத் தொடங்கு",  stop: "நிறுத்து", listening: "கேட்கிறேன்…", thinking: "சிந்திக்கிறேன்…", placeholder: "இங்கே பேசவும் அல்லது தட்டச்சு செய்யவும்…", answer: "பதில்", key_points: "முக்கிய புள்ளிகள்", next_action: "அடுத்த நடவடிக்கை", question_label: "உங்கள் கேள்வி", lang_label: "மொழி:" },
  "te-IN": { ask: "అడగండి",              clear: "క్లియర్",  read_aloud: "వినండి",   start: "మాట్లాడటం మొదలుపెట్టండి", stop: "ఆపండి", listening: "వింటున్నాను…", thinking: "ఆలోచిస్తున్నాను…", placeholder: "ఇక్కడ మాట్లాడండి లేదా టైప్ చేయండి…", answer: "సమాధానం", key_points: "ముఖ్య అంశాలు", next_action: "తదుపరి చర్య", question_label: "మీ ప్రశ్న", lang_label: "భాష:" },
  "bn-IN": { ask: "জিজ্ঞাসা করুন",       clear: "মুছুন",   read_aloud: "শুনুন",     start: "বলা শুরু করুন",   stop: "থামুন", listening: "শুনছি…", thinking: "ভাবছি…", placeholder: "এখানে বলুন বা টাইপ করুন…", answer: "উত্তর", key_points: "মূল বিষয়", next_action: "পরবর্তী পদক্ষেপ", question_label: "আপনার প্রশ্ন", lang_label: "ভাষা:" },
  "mr-IN": { ask: "विचारा",              clear: "साफ करा", read_aloud: "ऐका",      start: "बोलणे सुरू करा",  stop: "थांबा",  listening: "ऐकत आहे…", thinking: "विचार करत आहे…", placeholder: "येथे बोला किंवा टाइप करा…", answer: "उत्तर", key_points: "मुख्य मुद्दे", next_action: "पुढील कृती", question_label: "तुमचा प्रश्न", lang_label: "भाषा:" },
};

const t = (langCode, key) => (UI_STRINGS[langCode] || UI_STRINGS["en-IN"])[key];

export default function VoiceAssistantPage() {
  const [supported, setSupported] = useState(true);
  const [listening, setListening] = useState(false);
  const [lang, setLang] = useState("en-IN");
  const [transcript, setTranscript] = useState("");
  const [interim, setInterim] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const recognitionRef = useRef(null);

  useEffect(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      setSupported(false);
      return;
    }
    const r = new SR();
    r.continuous = true;
    r.interimResults = true;
    r.lang = lang;
    r.onresult = (event) => {
      let finalText = "";
      let interimText = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const t = event.results[i][0].transcript;
        if (event.results[i].isFinal) finalText += t + " ";
        else interimText += t;
      }
      if (finalText) setTranscript((prev) => (prev + finalText).replace(/\s+/g, " ").trim() + " ");
      setInterim(interimText);
    };
    r.onerror = (e) => {
      if (e.error === "not-allowed") toast.error("Microphone permission denied");
      else if (e.error === "no-speech") toast.info("No speech detected — try again");
      else toast.error(`Voice error: ${e.error}`);
      setListening(false);
    };
    r.onend = () => setListening(false);
    recognitionRef.current = r;
    return () => {
      try { r.stop(); } catch (_) {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang]);

  const start = () => {
    if (!recognitionRef.current) return;
    setInterim("");
    try {
      recognitionRef.current.lang = lang;
      recognitionRef.current.start();
      setListening(true);
    } catch (e) {
      toast.error("Could not start mic — try again");
    }
  };

  const stop = () => {
    try { recognitionRef.current?.stop(); } catch (_) {}
    setListening(false);
  };

  const submit = async () => {
    const query = transcript.trim();
    if (!query) {
      toast.error("Please record or type your question first.");
      return;
    }
    setLoading(true);
    setResult(null);
    try {
      const { data } = await api.post("/module/run", {
        slug: "voice",
        inputs: {
          spoken_query: query,
          language: LANGS.find((l) => l.code === lang)?.label || "English",
        },
      });
      setResult(data.result);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const speakAnswer = () => {
    if (!("speechSynthesis" in window)) {
      toast.error("Speech synthesis not supported in this browser.");
      return;
    }
    const answer = result?.answer || "";
    if (!answer) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(answer);
    u.lang = lang;
    u.rate = 0.95;
    window.speechSynthesis.speak(u);
  };

  return (
    <div className="max-w-4xl mx-auto p-6 md:p-10">
      <header className="mb-8">
        <div className="nm-overline">Advanced AI · Voice</div>
        <h1 className="font-display font-black text-3xl md:text-4xl tracking-tighter flex items-center gap-3 mt-2">
          <Mic className="w-8 h-8 text-[var(--nm-saffron)]" /> Voice-Based Legal Assistant
        </h1>
        <p className="text-[var(--nm-ink-soft)] mt-2 text-sm">
          Ask any Indian legal question in your language — tap the mic and speak. We'll transcribe, answer, and even read the answer back.
        </p>
      </header>

      {!supported && (
        <div className="border border-[var(--nm-border)] bg-[var(--nm-pale)] p-4 mb-6 text-sm">
          Your browser does not support the Web Speech API. Please use Chrome, Edge or Safari on desktop / Android for voice input.
          You can still type your question below.
        </div>
      )}

      <div className="border border-[var(--nm-border)] bg-white p-6" data-testid="voice-panel">
        {/* Language + mic controls */}
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <label className="text-xs uppercase tracking-widest text-[var(--nm-ink-soft)]">{t(lang, "lang_label")}</label>
          <select
            value={lang}
            onChange={(e) => setLang(e.target.value)}
            className="nm-input"
            style={{ width: "auto", padding: "6px 12px", fontSize: 13 }}
            data-testid="voice-lang"
          >
            {LANGS.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
          </select>

          {supported && (
            listening ? (
              <button className="nm-btn saffron" onClick={stop} data-testid="voice-stop-btn">
                <StopCircle className="w-4 h-4" /> {t(lang, "stop")}
              </button>
            ) : (
              <button className="nm-btn saffron" onClick={start} data-testid="voice-start-btn">
                <Mic className="w-4 h-4" /> {t(lang, "start")}
              </button>
            )
          )}

          {listening && (
            <span className="flex items-center gap-1.5 text-sm text-[var(--nm-error)] font-semibold">
              <span className="w-2 h-2 rounded-full bg-[var(--nm-error)] animate-pulse" />
              {t(lang, "listening")}
            </span>
          )}
        </div>

        <label className="text-xs uppercase tracking-widest text-[var(--nm-ink-soft)]">{t(lang, "question_label")}</label>
        <textarea
          className="nm-input nm-textarea mt-1"
          value={transcript + (interim ? " " + interim : "")}
          onChange={(e) => { setTranscript(e.target.value); setInterim(""); }}
          placeholder={t(lang, "placeholder")}
          data-testid="voice-transcript"
        />

        <div className="flex flex-wrap gap-2 mt-3">
          <button className="nm-btn saffron" onClick={submit} disabled={loading} data-testid="voice-submit-btn">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {loading ? t(lang, "thinking") : t(lang, "ask")}
          </button>
          <button
            className="nm-btn ghost"
            onClick={() => { setTranscript(""); setInterim(""); setResult(null); }}
            disabled={loading}
            data-testid="voice-clear-btn"
          >
            <Trash2 className="w-4 h-4" /> {t(lang, "clear")}
          </button>
        </div>
      </div>

      {result && (
        <div className="mt-6 border border-[var(--nm-border)] bg-white p-6 fade-in" data-testid="voice-result">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="nm-overline">{result.section_labels?.answer || t(lang, "answer")}</div>
            <button
              onClick={speakAnswer}
              className="nm-chip hover:border-[var(--nm-ink)]"
              data-testid="voice-play-btn"
            >
              <Volume2 className="w-3 h-3" /> {result.section_labels?.read_aloud || t(lang, "read_aloud")}
            </button>
          </div>
          <p className="prose-legal">{result.answer}</p>

          {result.key_points?.length > 0 && (
            <div className="mt-5">
              <div className="nm-overline">{result.section_labels?.key_points || t(lang, "key_points")}</div>
              <ul className="mt-2 space-y-1.5 text-sm">
                {result.key_points.map((k, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="w-1.5 h-1.5 mt-2 shrink-0 bg-[var(--nm-saffron)]" />
                    <span>{k}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {result.next_action && (
            <div className="mt-5 border-l-4 border-[var(--nm-saffron)] bg-[var(--nm-pale)] p-3">
              <div className="nm-overline">{result.section_labels?.next_action || t(lang, "next_action")}</div>
              <p className="mt-1 text-sm">{result.next_action}</p>
            </div>
          )}

          {result.disclaimer && (
            <p className="text-xs italic text-[var(--nm-ink-soft)] mt-4">{result.disclaimer}</p>
          )}
        </div>
      )}
    </div>
  );
}
