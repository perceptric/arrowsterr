// AI Shopping phase 2: ask Google AI Mode and ChatGPT "buy <brand>" for the 30 hand-labeled brands and save the
// answers, so tests/shopDetect.test.ts can check the probe signal (docs/ai-shopping-plan.md, section 3.1).
//   NODE_USE_ENV_PROXY=1 node scripts/shop-probe-record.mjs                (about $0.008 a brand)
//   NODE_USE_ENV_PROXY=1 node scripts/shop-probe-record.mjs --engine=gpt   (one engine only)
import { access, mkdir, writeFile } from "node:fs/promises";

const BRANDS = {
  "allbirds.com": "Allbirds",
  "gymshark.com": "Gymshark",
  "glossier.com": "Glossier",
  "brooksrunning.com": "Brooks Running",
  "hoka.com": "HOKA",
  "warbyparker.com": "Warby Parker",
  "casper.com": "Casper",
  "patagonia.com": "Patagonia",
  "bombas.com": "Bombas",
  "awaytravel.com": "Away",
  "ouraring.com": "Oura",
  "brooklinen.com": "Brooklinen",
  "rei.com": "REI",
  "fentybeauty.com": "Fenty Beauty",
  "ninjakitchen.com": "Ninja",
  "hubspot.com": "HubSpot",
  "notion.so": "Notion",
  "ahrefs.com": "Ahrefs",
  "stripe.com": "Stripe",
  "mckinsey.com": "McKinsey",
  "deloitte.com": "Deloitte",
  "webflow.com": "Webflow",
  "figma.com": "Figma",
  "slack.com": "Slack",
  "salesforce.com": "Salesforce",
  "zapier.com": "Zapier",
  "intercom.com": "Intercom",
  "asana.com": "Asana",
  "mailchimp.com": "Mailchimp",
  "linear.app": "Linear",
};
const ENGINES = {
  aim: {
    path: "serp/google/ai_mode/live/advanced",
    body: { device: "desktop" },
    file: "",
  },
  gpt: {
    path: "ai_optimization/chat_gpt/llm_scraper/live/advanced",
    body: { force_web_search: true },
    file: ".gpt",
  },
};
const API = process.env.DFS_API_URL?.trim() || "https://api.dataforseo.com/v3";
const auth = process.env.DFS_LOGIN
  ? {
      Authorization: `Basic ${Buffer.from(`${process.env.DFS_LOGIN}:${process.env.DFS_PASSWORD}`).toString("base64")}`,
    }
  : {};
const only = process.argv.find((a) => a.startsWith("--engine="))?.split("=")[1];
const dir = new URL("../tests/fixtures/shop/probe/", import.meta.url).pathname;
await mkdir(dir, { recursive: true });
let cost = 0;
await Promise.all(
  Object.entries(BRANDS).flatMap(([domain, name]) =>
    Object.entries(ENGINES)
      .filter(([eng]) => !only || only === eng)
      .map(async ([eng, cfg]) => {
        const file = `${dir}${domain}${cfg.file}.json`;
        if (
          await access(file).then(
            () => true,
            () => false,
          )
        )
          return;
        try {
          const res = await fetch(`${API}/${cfg.path}`, {
            method: "POST",
            headers: { ...auth, "Content-Type": "application/json" },
            body: JSON.stringify([
              {
                keyword: `buy ${name}`,
                location_code: 2840,
                language_code: "en",
                ...cfg.body,
              },
            ]),
            signal: AbortSignal.timeout(240_000),
          });
          const t = (await res.json()).tasks?.[0];
          cost += Number(t?.cost ?? 0);
          await writeFile(
            file,
            JSON.stringify({
              domain,
              name,
              engine: eng,
              prompt: `buy ${name}`,
              status: t?.status_code,
              result: t?.result?.[0] ?? null,
            }) + "\n",
          );
          console.log(eng, domain, t?.status_code);
        } catch (e) {
          console.log(eng, domain, "failed", e.message);
        }
      }),
  ),
);
console.log(`cost $${cost.toFixed(4)}`);
