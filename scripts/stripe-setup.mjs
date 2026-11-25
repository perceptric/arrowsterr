// Make Arrowsterr's products and prices in Stripe: node scripts/stripe-setup.mjs
// Needs STRIPE_SECRET_KEY (test or live). Safe to run again: it only adds what is missing,
// and moves a lookup key to a new price when a plan's price changed in src/lib/plans.ts.

import { MIXES, PLANS, PROMPT_STEP, SELF_SERVE, TASK_STEP, lookupKey, priceOf, promptsLookupKey, tasksLookupKey } from "../src/lib/plans.ts";

const key = (process.env.STRIPE_SECRET_KEY ?? "").trim();
if (!key) {
  console.error("Set STRIPE_SECRET_KEY first.");
  process.exit(1);
}

function encode(params, prefix = "", out = new URLSearchParams()) {
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    const name = prefix ? `${prefix}[${k}]` : k;
    if (Array.isArray(v)) v.forEach((x, i) => out.append(`${name}[${i}]`, String(x)));
    else if (typeof v === "object") encode(v, name, out);
    else out.append(name, String(v));
  }
  return out;
}

async function stripe(method, path, params = {}) {
  const body = encode(params);
  const res = await fetch(`https://api.stripe.com/v1/${path}${method === "GET" && body.size ? `?${body}` : ""}`, {
    method,
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: method === "GET" ? undefined : body,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`${method} ${path}: ${data.error?.message ?? res.status}`);
  return data;
}

async function product(productId, name, metadata) {
  const found = await stripe("GET", `products/${productId}`).catch(() => null);
  if (found) return;
  await stripe("POST", "products", { id: productId, name, metadata });
  console.log("Made product", productId);
}

/** One recurring price under a lookup key, moved to a new price when the amount changed. */
async function price(productId, lk, cents, interval, metadata) {
  const { data } = await stripe("GET", "prices", { lookup_keys: [lk], active: true, limit: 1 });
  if (data[0]?.unit_amount === cents && data[0]?.recurring?.interval === interval) {
    console.log(`${lk}: $${cents / 100} ok`);
    return;
  }
  await stripe("POST", "prices", {
    product: productId,
    currency: "usd",
    unit_amount: cents,
    recurring: { interval },
    lookup_key: lk,
    transfer_lookup_key: true,
    tax_behavior: "exclusive",
    metadata,
  });
  console.log(`${lk}: $${cents / 100} ${data[0] ? "updated" : "made"}`);
}

// Each plan in each mix (both toolsets, AI Visibility only, SEO Research only), monthly and yearly.
for (const id of SELF_SERVE) {
  const productId = `arrowsterr_${id}`;
  await product(productId, `Arrowsterr ${PLANS[id].name}`, { plan: id });
  for (const mix of MIXES) {
    for (const interval of ["month", "year"]) {
      const monthly = priceOf(id, mix, interval);
      await price(productId, lookupKey(id, interval, mix), Math.round((interval === "year" ? monthly * 12 : monthly) * 100), interval, { plan: id, mix, interval });
    }
  }
}

// Extra tasks: one unit is TASK_STEP.tasks a month, bought by quantity next to a plan.
await product("arrowsterr_tasks", `Arrowsterr extra tasks (${TASK_STEP.tasks.toLocaleString("en-US")} a month)`, { addon: "tasks" });
for (const interval of ["month", "year"]) {
  await price("arrowsterr_tasks", tasksLookupKey(interval), Math.round((interval === "year" ? TASK_STEP.annual * 12 : TASK_STEP.price) * 100), interval, { addon: "tasks", interval });
}
// Extra prompts (pricing v8): one unit is PROMPT_STEP.prompts checked daily, bought by quantity next to a plan.
await product("arrowsterr_prompts", `Arrowsterr extra prompts (${PROMPT_STEP.prompts} checked daily)`, { addon: "prompts" });
for (const interval of ["month", "year"]) {
  await price("arrowsterr_prompts", promptsLookupKey(interval), Math.round((interval === "year" ? PROMPT_STEP.annual * 12 : PROMPT_STEP.price) * 100), interval, { addon: "prompts", interval });
}
console.log("Done. Existing customers keep their old price until you move them.");
