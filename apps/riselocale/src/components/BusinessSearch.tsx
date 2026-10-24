"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addBusiness, searchBusinesses } from "@/app/actions";
import type { Listing } from "@/lib/match";

export default function BusinessSearch() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Listing[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function search(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    start(async () => {
      const res = await searchBusinesses(q);
      if (res.error) setError(res.error);
      setResults(res.results ?? null);
    });
  }

  function pick(l: Listing) {
    start(async () => {
      const res = await addBusiness({ ...l, lat: l.lat!, lng: l.lng! });
      if ("error" in res && res.error) setError(res.error);
      else if ("id" in res) router.push(`/app/businesses/${res.id}`);
    });
  }

  return (
    <div className="form">
      <form className="row" onSubmit={search}>
        <div className="rl-field" style={{ flex: "3 1 260px" }}>
          <label htmlFor="q">Business name and city</label>
          <input id="q" className="rl-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Joe's Pizza Palace, Brooklyn NY" autoFocus />
        </div>
        <div style={{ flex: "0 0 auto" }}>
          <button className="rl-btn rl-btn--primary" disabled={pending || q.trim().length < 3}>
            {pending ? "Searching…" : "Find on Google"}
          </button>
        </div>
      </form>
      {error && <p className="error">{error}</p>}
      {results && !results.length && <p className="small muted">No businesses found. Try the name as it shows on Google, with the city.</p>}
      {results && results.length > 0 && (
        <ul className="results">
          {results.map((l) => (
            <li key={l.cid || l.place_id || l.title}>
              <button type="button" onClick={() => pick(l)} disabled={pending || l.lat == null}>
                <span>
                  <b>{l.title}</b> {l.rating != null && <span className="sub">{l.rating} ★ ({l.reviews ?? 0})</span>}
                </span>
                <span className="sub">{[l.category, l.address, l.domain].filter(Boolean).join(", ")}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
