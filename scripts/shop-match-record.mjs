// AI Shopping phase 3: record real catalogs and real AI answers for the matching test (tests/shopMatch.test.ts).
// Catalogs come from 7 real Shopify stores' public /products.json; answers from prompts where their products show up.
//   NODE_USE_ENV_PROXY=1 node scripts/shop-match-record.mjs catalogs
//   NODE_USE_ENV_PROXY=1 node scripts/shop-match-record.mjs answers     (about $0.008 a prompt, both engines)
import { access, mkdir, writeFile } from "node:fs/promises";

export const BRANDS = {
  "allbirds.com": { name: "Allbirds", prompts: ["best wool sneakers", "most comfortable sustainable sneakers", "allbirds tree runner vs wool runner", "best slip on shoes for travel", "allbirds tree dasher review", "best machine washable sneakers"] },
  "glossier.com": { name: "Glossier", prompts: ["best lip balm for dry lips", "glossier boy brow review", "best cream blush", "glossier you perfume worth it", "best dewy skin tint", "best brow gel"] },
  "casper.com": { name: "Casper", prompts: ["best mattress in a box", "casper original vs wave", "best pillow for side sleepers", "best foam mattress for couples", "casper dream mattress review", "best weighted blanket"] },
  "brooklinen.com": { name: "Brooklinen", prompts: ["best percale sheets", "best linen sheets", "brooklinen luxe sateen review", "best down comforter", "best bath towels", "best duvet cover"] },
  "awaytravel.com": { name: "Away", prompts: ["best hard shell carry on", "away the bigger carry on review", "best checked luggage", "best luggage set", "best packing cubes", "best carry on with battery"] },
  "gymshark.com": { name: "Gymshark", prompts: ["best gym leggings", "gymshark vital seamless review", "best squat proof leggings", "best gym shorts for men", "best sports bra for lifting", "best gym hoodie"] },
  "fentybeauty.com": { name: "Fenty Beauty", prompts: ["best foundation for oily skin", "fenty pro filtr foundation review", "best lip gloss", "best highlighter for dark skin", "fenty gloss bomb worth it", "best setting powder"] },
};
const UA = "Mozilla/5.0 (compatible; ArrowsterrBot/1.0; +https://arrowsterr.com/)";
const DIR = new URL("../tests/fixtures/shop/match/", import.meta.url).pathname;
const exists = (p) => access(p).then(() => true, () => false);

async function catalogs() {
  await mkdir(`${DIR}catalogs`, { recursive: true });
  for (const domain of Object.keys(BRANDS)) {
    const products = [];
    for (let page = 1; page <= 8; page++) {
      const res = await fetch(`https://${domain}/products.json?limit=250&page=${page}`, { headers: { "User-Agent": UA, Accept: "application/json" }, signal: AbortSignal.timeout(30_000) });
      if (!res.ok) break;
      const list = (await res.json()).products ?? [];
      // Only what the test reads: the title, the handle, the vendor and the lowest and highest price.
      products.push(
        ...list.map((p) => {
          const prices = [...new Set((p.variants ?? []).map((v) => String(v.price)).filter((x) => x !== "null"))].sort((a, b) => Number(a) - Number(b));
          return { id: String(p.id), title: p.title, handle: p.handle, vendor: p.vendor, variants: (prices.length > 1 ? [prices[0], prices.at(-1)] : prices).map((price) => ({ price })) };
        }),
      );
      if (list.length < 250) break;
    }
    await writeFile(`${DIR}catalogs/${domain}.json`, JSON.stringify({ domain, recorded_at: new Date().toISOString(), products }) + "\n");
    console.log(domain, products.length, "products");
  }
}

const API = process.env.DFS_API_URL?.trim() || "https://api.dataforseo.com/v3";
const auth = process.env.DFS_LOGIN ? { Authorization: `Basic ${Buffer.from(`${process.env.DFS_LOGIN}:${process.env.DFS_PASSWORD}`).toString("base64")}` } : {};
const ENGINES = {
  aim: { path: "serp/google/ai_mode/live/advanced", body: { device: "desktop" } },
  gpt: { path: "ai_optimization/chat_gpt/llm_scraper/live/advanced", body: { force_web_search: true } },
};
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);

async function answers() {
  await mkdir(`${DIR}answers`, { recursive: true });
  const jobs = [];
  for (const [domain, b] of Object.entries(BRANDS)) for (const q of b.prompts) for (const [eng, cfg] of Object.entries(ENGINES)) jobs.push({ domain, q, eng, cfg });
  let cost = 0;
  const run = async () => {
    for (let j = jobs.shift(); j; j = jobs.shift()) {
      const file = `${DIR}answers/${j.domain.split(".")[0]}--${slug(j.q)}--${j.eng}.json`;
      if (await exists(file)) continue;
      try {
        const res = await fetch(`${API}/${j.cfg.path}`, { method: "POST", headers: { ...auth, "Content-Type": "application/json" }, body: JSON.stringify([{ keyword: j.q, location_code: 2840, language_code: "en", ...j.cfg.body }]), signal: AbortSignal.timeout(240_000) });
        const t = (await res.json()).tasks?.[0];
        cost += Number(t?.cost ?? 0);
        if (t?.status_code !== 20000) throw new Error(`${t?.status_code} ${t?.status_message}`);
        await writeFile(file, JSON.stringify({ domain: j.domain, prompt: j.q, engine: j.eng, result: t.result?.[0] ?? null }) + "\n");
        console.log("ok", j.eng, j.q);
      } catch (e) {
        console.log("fail", j.eng, j.q, e.message);
      }
    }
  };
  await Promise.all(Array.from({ length: 6 }, run));
  console.log(`cost $${cost.toFixed(4)}`);
}

if (process.argv[2] === "catalogs") await catalogs();
else if (process.argv[2] === "answers") await answers();
else console.log("catalogs | answers");
