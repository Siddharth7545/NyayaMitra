import React, { useEffect, useMemo, useState } from "react";
import api from "@/lib/api";
import {
  Store, Loader2, Search, Star, MapPin, Award, Languages,
  ArrowLeft, Send, X, CheckCircle2
} from "lucide-react";
import { toast } from "sonner";

export default function LawyerMarketplacePage() {
  const [facets, setFacets] = useState({ cities: [], specialisations: [] });
  const [lawyers, setLawyers] = useState([]);
  const [loading, setLoading] = useState(false);

  const [q, setQ] = useState("");
  const [city, setCity] = useState("");
  const [spec, setSpec] = useState("");
  const [minExp, setMinExp] = useState(0);
  const [maxFee, setMaxFee] = useState(15000);
  const [minRating, setMinRating] = useState(0);
  const [sort, setSort] = useState("rating");

  const [selected, setSelected] = useState(null);
  const [booking, setBooking] = useState(false);
  const [bookingForm, setBookingForm] = useState({ matter_summary: "", preferred_date: "", preferred_time: "", phone: "" });
  const [bookingSuccess, setBookingSuccess] = useState(null);

  useEffect(() => {
    api.get("/lawyers/facets").then((r) => setFacets(r.data));
  }, []);

  const load = async () => {
    setLoading(true);
    try {
      const params = { sort, limit: 60 };
      if (q) params.q = q;
      if (city) params.city = city;
      if (spec) params.specialisation = spec;
      if (minExp) params.min_experience = minExp;
      if (maxFee < 15000) params.max_fee = maxFee;
      if (minRating) params.min_rating = minRating;
      const { data } = await api.get("/lawyers", { params });
      setLawyers(data.lawyers);
    } catch (e) {
      toast.error("Failed to load lawyers");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [city, spec, minExp, maxFee, minRating, sort]);

  const onSearchSubmit = (e) => {
    e.preventDefault();
    load();
  };

  const reset = () => {
    setQ(""); setCity(""); setSpec(""); setMinExp(0); setMaxFee(15000); setMinRating(0); setSort("rating");
  };

  const openBooking = (lawyer) => {
    setSelected(lawyer);
    setBookingForm({ matter_summary: "", preferred_date: "", preferred_time: "", phone: "" });
    setBookingSuccess(null);
    setBooking(true);
  };

  const submitBooking = async (e) => {
    e.preventDefault();
    if (!bookingForm.matter_summary.trim()) {
      toast.error("Please describe your matter");
      return;
    }
    try {
      const { data } = await api.post("/lawyers/consult", { lawyer_id: selected.id, ...bookingForm });
      setBookingSuccess(data);
      toast.success("Consultation request sent!");
    } catch (e) {
      toast.error(e.response?.data?.detail || "Booking failed");
    }
  };

  return (
    <div className="max-w-7xl mx-auto p-6 md:p-10">
      <header className="mb-8">
        <div className="nm-overline">Advanced AI · Marketplace</div>
        <h1 className="font-display font-black text-3xl md:text-4xl tracking-tighter flex items-center gap-3 mt-2">
          <Store className="w-8 h-8 text-[var(--nm-saffron)]" /> Lawyer Marketplace
        </h1>
        <p className="text-[var(--nm-ink-soft)] mt-2 text-sm">
          Browse {lawyers.length ? `${lawyers.length}+` : ""} verified Indian advocates. Filter by city, specialisation, price and rating.
        </p>
      </header>

      {/* Search bar */}
      <form onSubmit={onSearchSubmit} className="flex gap-2 mb-6">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--nm-ink-soft)]" />
          <input
            className="nm-input pl-10"
            placeholder="Search name, specialisation or keyword…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            data-testid="lawyer-search-input"
          />
        </div>
        <button type="submit" className="nm-btn saffron" data-testid="lawyer-search-btn">Search</button>
      </form>

      <div className="grid lg:grid-cols-[280px_1fr] gap-6">
        {/* Filters */}
        <aside className="border border-[var(--nm-border)] bg-white p-5 h-fit" data-testid="lawyer-filters">
          <div className="flex items-center justify-between mb-4">
            <div className="font-display font-bold">Filters</div>
            <button onClick={reset} className="text-xs text-[var(--nm-saffron)] underline" data-testid="lawyer-reset-filters">
              Reset
            </button>
          </div>

          <FilterBlock label="City">
            <select className="nm-input" value={city} onChange={(e) => setCity(e.target.value)} data-testid="filter-city">
              <option value="">All cities</option>
              {facets.cities.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </FilterBlock>

          <FilterBlock label="Specialisation">
            <select className="nm-input" value={spec} onChange={(e) => setSpec(e.target.value)} data-testid="filter-spec">
              <option value="">All specialisations</option>
              {facets.specialisations.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </FilterBlock>

          <FilterBlock label={`Max fee (₹): ${maxFee.toLocaleString()}`}>
            <input
              type="range" min="500" max="15000" step="500"
              value={maxFee}
              onChange={(e) => setMaxFee(Number(e.target.value))}
              className="w-full accent-[var(--nm-saffron)]"
              data-testid="filter-fee"
            />
          </FilterBlock>

          <FilterBlock label={`Min experience: ${minExp} yrs`}>
            <input
              type="range" min="0" max="25" step="1"
              value={minExp}
              onChange={(e) => setMinExp(Number(e.target.value))}
              className="w-full accent-[var(--nm-saffron)]"
              data-testid="filter-exp"
            />
          </FilterBlock>

          <FilterBlock label={`Min rating: ${minRating || "any"}`}>
            <div className="flex gap-1">
              {[0, 4.0, 4.5, 4.7, 4.8].map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setMinRating(v)}
                  className={`nm-chip flex-1 justify-center ${minRating === v ? "border-[var(--nm-ink)] bg-[var(--nm-pale)]" : ""}`}
                  data-testid={`filter-rating-${v}`}
                >
                  {v === 0 ? "Any" : `${v}+`}
                </button>
              ))}
            </div>
          </FilterBlock>

          <FilterBlock label="Sort by">
            <select className="nm-input" value={sort} onChange={(e) => setSort(e.target.value)} data-testid="filter-sort">
              <option value="rating">Highest rating</option>
              <option value="experience">Most experience</option>
              <option value="fee_low">Fee: Low to High</option>
              <option value="fee_high">Fee: High to Low</option>
            </select>
          </FilterBlock>
        </aside>

        {/* Results */}
        <section>
          <div className="mb-3 text-sm text-[var(--nm-ink-soft)]">
            {loading ? "Loading…" : `${lawyers.length} advocate${lawyers.length === 1 ? "" : "s"} found`}
          </div>
          {loading && !lawyers.length && (
            <div className="flex items-center gap-2 text-[var(--nm-ink-soft)]">
              <Loader2 className="w-4 h-4 animate-spin" /> Fetching lawyers…
            </div>
          )}
          {!loading && lawyers.length === 0 && (
            <div className="border border-[var(--nm-border)] bg-white p-8 text-center text-[var(--nm-ink-soft)]">
              No advocates match your filters. Try loosening them.
            </div>
          )}
          <div className="grid md:grid-cols-2 gap-4 stagger" data-testid="lawyer-results">
            {lawyers.map((l) => <LawyerCard key={l.id} lawyer={l} onBook={() => openBooking(l)} />)}
          </div>
        </section>
      </div>

      {booking && selected && (
        <BookingModal
          lawyer={selected}
          form={bookingForm}
          setForm={setBookingForm}
          success={bookingSuccess}
          onClose={() => setBooking(false)}
          onSubmit={submitBooking}
        />
      )}
    </div>
  );
}

function FilterBlock({ label, children }) {
  return (
    <div className="mb-4">
      <div className="text-xs uppercase tracking-widest text-[var(--nm-ink-soft)] mb-2">{label}</div>
      {children}
    </div>
  );
}

function Avatar({ seed, gender }) {
  // Deterministic avatar using dicebear (public, no key)
  const style = gender === "F" ? "initials" : "initials";
  const url = `https://api.dicebear.com/9.x/${style}/svg?seed=${encodeURIComponent(seed)}&backgroundColor=fef3c7,fed7aa,fecaca,e5e7eb,ddd6fe,bbf7d0&fontFamily=Georgia`;
  return (
    <div className="w-14 h-14 border border-[var(--nm-border)] bg-slate-50 shrink-0 overflow-hidden">
      <img src={url} alt="" className="w-full h-full object-cover" />
    </div>
  );
}

function LawyerCard({ lawyer, onBook }) {
  return (
    <div className="nm-card" data-testid={`lawyer-card-${lawyer.id}`}>
      <div className="flex items-start gap-3">
        <Avatar seed={lawyer.avatar_seed} gender={lawyer.gender} />
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="font-display font-bold text-lg leading-tight">{lawyer.name}</div>
              <div className="text-xs text-[var(--nm-ink-soft)] flex items-center gap-1 mt-1">
                <MapPin className="w-3 h-3" /> {lawyer.city}, {lawyer.state}
              </div>
            </div>
            <div className="text-right shrink-0">
              <div className="flex items-center gap-1 text-sm font-semibold">
                <Star className="w-4 h-4 text-[var(--nm-saffron)] fill-[var(--nm-saffron)]" />
                {lawyer.rating}
              </div>
              <div className="text-xs text-[var(--nm-ink-soft)]">{lawyer.reviews_count} reviews</div>
            </div>
          </div>
          <div className="mt-2 flex flex-wrap gap-1">
            {lawyer.specialisations.slice(0, 3).map((s) => (
              <span key={s} className="nm-chip">{s}</span>
            ))}
          </div>
          <p className="text-sm text-[var(--nm-ink-soft)] mt-3 line-clamp-2">{lawyer.bio}</p>
          <div className="flex items-center gap-4 mt-3 text-xs text-[var(--nm-ink-soft)]">
            <span className="flex items-center gap-1"><Award className="w-3 h-3" /> {lawyer.experience_years} yrs exp.</span>
            <span className="flex items-center gap-1"><Languages className="w-3 h-3" /> {lawyer.languages.slice(0, 2).join(", ")}</span>
          </div>
        </div>
      </div>
      <div className="mt-4 pt-4 border-t border-[var(--nm-border)] flex items-center justify-between">
        <div>
          <div className="text-xs text-[var(--nm-ink-soft)] uppercase tracking-widest">Consultation</div>
          <div className="font-display font-bold text-lg">₹{lawyer.consult_fee.toLocaleString()}</div>
        </div>
        <button onClick={onBook} className="nm-btn saffron" data-testid={`book-${lawyer.id}`}>
          <Send className="w-4 h-4" /> Book consultation
        </button>
      </div>
    </div>
  );
}

function BookingModal({ lawyer, form, setForm, success, onClose, onSubmit }) {
  return (
    <div className="fixed inset-0 z-50 bg-[rgba(15,23,42,0.7)] flex items-center justify-center p-4" onClick={onClose} data-testid="booking-modal">
      <div className="bg-white border border-[var(--nm-ink)] max-w-lg w-full max-h-[90vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between p-6 border-b border-[var(--nm-border)]">
          <div>
            <div className="nm-overline">Book consultation</div>
            <h2 className="font-display font-black text-2xl mt-1">{lawyer.name}</h2>
            <div className="text-sm text-[var(--nm-ink-soft)] mt-1">{lawyer.city} · ₹{lawyer.consult_fee.toLocaleString()} per session</div>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-100" data-testid="booking-close-btn">
            <X className="w-5 h-5" />
          </button>
        </div>

        {success ? (
          <div className="p-8 text-center">
            <CheckCircle2 className="w-14 h-14 mx-auto text-[var(--nm-success)]" />
            <h3 className="font-display font-black text-2xl mt-4">Request sent!</h3>
            <p className="text-[var(--nm-ink-soft)] mt-2 text-sm">
              {success.lawyer} will reach out to you shortly. Reference ID: <code className="font-mono2">{success.id.slice(0,8)}</code>
            </p>
            <button onClick={onClose} className="nm-btn ghost mt-6" data-testid="booking-done-btn">Done</button>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="p-6 space-y-4" data-testid="booking-form">
            <div>
              <label className="text-xs uppercase tracking-widest text-[var(--nm-ink-soft)]">Describe your matter *</label>
              <textarea
                rows={4}
                className="nm-input mt-1"
                placeholder="What do you need legal help with?"
                value={form.matter_summary}
                onChange={(e) => setForm({ ...form, matter_summary: e.target.value })}
                data-testid="booking-matter"
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs uppercase tracking-widest text-[var(--nm-ink-soft)]">Preferred date</label>
                <input
                  type="date"
                  className="nm-input mt-1"
                  value={form.preferred_date}
                  onChange={(e) => setForm({ ...form, preferred_date: e.target.value })}
                  data-testid="booking-date"
                />
              </div>
              <div>
                <label className="text-xs uppercase tracking-widest text-[var(--nm-ink-soft)]">Preferred time</label>
                <input
                  type="time"
                  className="nm-input mt-1"
                  value={form.preferred_time}
                  onChange={(e) => setForm({ ...form, preferred_time: e.target.value })}
                  data-testid="booking-time"
                />
              </div>
            </div>
            <div>
              <label className="text-xs uppercase tracking-widest text-[var(--nm-ink-soft)]">Phone (optional)</label>
              <input
                className="nm-input mt-1"
                placeholder="+91…"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                data-testid="booking-phone"
              />
            </div>
            <button type="submit" className="nm-btn saffron w-full justify-center" data-testid="booking-submit-btn">
              <Send className="w-4 h-4" /> Send request
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
