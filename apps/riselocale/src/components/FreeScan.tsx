"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { freeSearch, startFreeScan } from "@/app/actions";
import type { Listing } from "@/lib/match";

export default function FreeScan() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Listing[] | null>(null);
  const [biz, setBiz] = useState<Listing | null>(null);
  const [keyword, setKeyword] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function search(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBiz(null);
    start(async () => {
      const res = await freeSearch(q);
      if (res.error) setError(res.error);
      setResults(res.results ?? null);
    });
  }

  function run(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!biz) return setError("Pick your business from the list.");
    start(async () => {
      const res = await startFreeScan({ business: biz, keyword, email });
      if (res.error) setError(res.error);
      else if (res.url) router.push(res.url);
    });
  }

  return (
    <div className="form panel panel-body" style={{ maxWidth: 560 }}>
      <form className="row" onSubmit={search}>
        <div className="rl-field" style={{ flex: "3 1 240px" }}>
          <label htmlFor="fq">Your business and city</label>
          <input id="fq" className="rl-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Joe's Pizza Palace, Brooklyn NY" />
        </div>
        <div style={{ flex: "0 0 auto" }}>
          <button className="rl-btn rl-btn--secondary" disabled={pending || q.trim().length < 3}>
            Find
          </button>
        </div>
      </form>
      {results && !results.length && <p className="small muted">No businesses found. Try the name as it shows on Google, with the city.</p>}
      {results && results.length > 0 && (
        <ul className="results">
          {results.map((l) => (
            <li key={l.cid || l.place_id || l.title}>
              <button type="button" aria-pressed={biz === l} onClick={() => setBiz(l)} disabled={l.lat == null}>
                <b>{l.title}</b>
                <span className="sub">{[l.category, l.address].filter(Boolean).join(", ")}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {biz && (
        <form className="form" onSubmit={run}>
          <div className="rl-field">
            <label htmlFor="fk">Keyword</label>
            <input id="fk" className="rl-input" value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="pizza delivery near me" required minLength={2} />
          </div>
          <div className="rl-field">
            <label htmlFor="fe">Email</label>
            <input id="fe" className="rl-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@business.com" required />
          </div>
          <div>
            <button className="rl-btn rl-btn--primary" disabled={pending}>
              {pending ? "Starting…" : "Run my free 5×5 scan"}
            </button>
          </div>
        </form>
      )}
      {error && <p className="error">{error}</p>}
    </div>
  );
}
