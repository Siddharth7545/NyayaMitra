import React, { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { Scale, ArrowRight } from "lucide-react";
import { toast } from "sonner";

export default function AuthPage() {
  const [sp] = useSearchParams();
  const [mode, setMode] = useState(sp.get("mode") === "register" ? "register" : "login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const { login, register, loading } = useAuth();
  const nav = useNavigate();

  const submit = async (e) => {
    e.preventDefault();
    const res =
      mode === "login"
        ? await login(email, password)
        : await register(name, email, password);
    if (res.ok) {
      toast.success(mode === "login" ? "Welcome back" : "Account created");
      nav("/app");
    } else {
      toast.error(res.error);
    }
  };

  return (
    <div className="min-h-screen grid md:grid-cols-2">
      {/* Left: brand */}
      <div className="hidden md:flex flex-col justify-between bg-[var(--nm-ink)] text-white p-12">
        <Link to="/" className="flex items-center gap-2" data-testid="auth-logo">
          <Scale className="w-6 h-6" />
          <div className="font-display font-black text-lg">
            NYAYA<span className="text-[var(--nm-saffron)]">·</span>MITRA
          </div>
        </Link>
        <div>
          <div className="nm-overline text-[var(--nm-saffron)] mb-4">Indian Legal-Tech OS</div>
          <h1 className="font-display font-black text-4xl lg:text-5xl leading-tight tracking-tighter">
            37 legal modules. <br /> One clean workspace.
          </h1>
          <p className="mt-6 text-white/70 max-w-md">
            Draft petitions, review contracts, research judgments, and detect scams — all in one place, built for India.
          </p>
        </div>
        <div className="text-xs text-white/40">© 2026 Nyaya Mitra</div>
      </div>

      {/* Right: form */}
      <div className="flex items-center justify-center p-6 md:p-12 bg-white">
        <form onSubmit={submit} className="w-full max-w-md fade-in" data-testid="auth-form">
          <div className="nm-overline mb-3">{mode === "login" ? "Welcome back" : "Create your account"}</div>
          <h2 className="font-display font-black text-3xl md:text-4xl tracking-tighter">
            {mode === "login" ? "Sign in to continue." : "Start using Nyaya Mitra."}
          </h2>

          <div className="mt-8 space-y-4">
            {mode === "register" && (
              <div>
                <label className="text-xs uppercase tracking-widest text-[var(--nm-ink-soft)]">Full name</label>
                <input
                  className="nm-input mt-1"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  data-testid="auth-name-input"
                />
              </div>
            )}
            <div>
              <label className="text-xs uppercase tracking-widest text-[var(--nm-ink-soft)]">Email</label>
              <input
                type="email"
                className="nm-input mt-1"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                data-testid="auth-email-input"
              />
            </div>
            <div>
              <label className="text-xs uppercase tracking-widest text-[var(--nm-ink-soft)]">Password</label>
              <input
                type="password"
                className="nm-input mt-1"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={6}
                required
                data-testid="auth-password-input"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="nm-btn saffron w-full justify-center mt-6"
            data-testid="auth-submit-btn"
          >
            {loading ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}{" "}
            <ArrowRight className="w-4 h-4" />
          </button>

          <div className="mt-6 text-sm text-[var(--nm-ink-soft)]">
            {mode === "login" ? (
              <>
                New here?{" "}
                <button
                  type="button"
                  className="text-[var(--nm-saffron)] font-semibold underline"
                  onClick={() => setMode("register")}
                  data-testid="switch-to-register"
                >
                  Create an account
                </button>
              </>
            ) : (
              <>
                Already have an account?{" "}
                <button
                  type="button"
                  className="text-[var(--nm-saffron)] font-semibold underline"
                  onClick={() => setMode("login")}
                  data-testid="switch-to-login"
                >
                  Sign in
                </button>
              </>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
