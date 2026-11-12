// AI Shopping phase 2: record 30 hand-labeled brands' sites as slim pages, so tests/shopDetect.test.ts can prove
// detection turns on every brand that sells and none that don't (docs/ai-shopping-plan.md, section 3.1).
//   NODE_USE_ENV_PROXY=1 node scripts/shop-detect-record.ts
import { writeFile } from "node:fs/promises";
import { productLinks, slimPage, type SlimPage } from "../src/lib/shopDetect.ts";

const SELL = ["allbirds.com", "gymshark.com", "glossier.com", "brooksrunning.com", "hoka.com", "warbyparker.com", "casper.com", "patagonia.com", "bombas.com", "awaytravel.com", "ouraring.com", "brooklinen.com", "rei.com", "fentybeauty.com", "ninjakitchen.com"];
const DONT = ["hubspot.com", "notion.so", "ahrefs.com", "stripe.com", "mckinsey.com", "deloitte.com", "webflow.com", "figma.com", "slack.com", "salesforce.com", "zapier.com", "intercom.com", "asana.com", "mailchimp.com", "linear.app"];
const UA = "Mozilla/5.0 (compatible; ArrowsterrBot/1.0; +https://arrowsterr.com/)";

async function get(url: string, accept = "text/html,application/xhtml+xml") {
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA, Accept: accept }, redirect: "follow", signal: AbortSignal.timeout(15_000) });
    const body = (await res.text()).slice(0, 3_000_000);
    return { status: res.status, url: res.url, body };
  } catch (e) {
    return { status: 0, url, body: "", error: String(e) };
  }
}

async function site(domain: string) {
  const home = await get(`https://${domain}/`);
  const pages: SlimPage[] = [];
  if (home.status >= 200 && home.status < 400 && home.body) {
    const h = slimPage(home.body, home.url);
    pages.push(h);
    for (const path of productLinks(h)) {
      const r = await get(new URL(path, home.url).toString());
      if (r.status >= 200 && r.status < 400 && r.body) pages.push(slimPage(r.body, r.url));
    }
  }
  const pj = await get(`https://${domain}/products.json?limit=5`, "application/json");
  let shopifyProducts = 0;
  try {
    const list = JSON.parse(pj.body)?.products;
    if (Array.isArray(list)) shopifyProducts = list.length;
  } catch {}
  return { status: home.status, pages, shopifyProducts };
}

const out = [];
for (const [label, list] of [["sells", SELL], ["none", DONT]] as const) {
  for (const domain of list) {
    const s = await site(domain);
    out.push({ domain, label, ...s });
    console.log(`${label.padEnd(5)} ${domain.padEnd(20)} home ${s.status} pages ${s.pages.length} products.json ${s.shopifyProducts}`);
  }
}
await writeFile(new URL("../tests/fixtures/shop/detect.json", import.meta.url), JSON.stringify({ recorded_at: new Date().toISOString(), sites: out }) + "\n");
