#!/usr/bin/env node
// UI check (docs/unify-plan.md, Part 6): signs in to a test workspace, opens every sidebar screen and settings tab
// at 1440 x 900, 768 x 1024 and 390 x 844, and saves a screenshot of each to .ui-check/<width>/<screen>.png.
// Each screen must have one h1, no page errors in the console, and no serious or critical axe findings.
//
//   APP_URL=http://localhost:3000 UI_CHECK_EMAIL=... UI_CHECK_PASSWORD=... npm run ui-check
//
// Without UI_CHECK_EMAIL and UI_CHECK_PASSWORD it checks the sign-in screen only and stops there.
// Exit code 1 when any screen fails.

import { execSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { SLUGS } from "../src/lib/routes.ts";
import { SETTINGS_TABS } from "../src/lib/settingsTabs.ts";

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, ".ui-check");
const APP = (process.env.APP_URL || "http://localhost:3000").replace(/\/+$/, "");
const EMAIL = process.env.UI_CHECK_EMAIL || "";
const PASSWORD = process.env.UI_CHECK_PASSWORD || "";
const SIZES = [
  { width: 1440, height: 900 },
  { width: 768, height: 1024 },
  { width: 390, height: 844 },
];
// The sidebar's screens (NAV in src/components/App.tsx), then every settings tab.
const SIDEBAR = [
  ["prompts", "Prompts"],
  ["competitors", "Competitors"],
  ["domains", "Sources"],
  ["urls", "Sources URLs"],
  ["keywords", "Keyword Research"],
  ["domain", "Domain Research"],
  ["gap", "Competitive Analysis"],
  ["calendar", "Editorial Calendar"],
  ["library", "Library"],
  ["brand", "Brand"],
  ["summary", "Reports"],
];
const SCREENS = [
  ...SIDEBAR.map(([id, label]) => ({ id, label, path: SLUGS[id] })),
  ...SETTINGS_TABS.map((t) => ({ id: `settings-${t.id}`, label: `Settings: ${t.label}`, path: SLUGS[t.id] })),
];
// Console noise that isn't the page's fault: analytics and error tracking blocked or off.
const NOISE = /\/ingest|posthog|sentry|ERR_BLOCKED_BY_CLIENT|favicon/i;

/** Playwright from this project, or the copy installed for the whole machine. */
function playwright() {
  const tries = ["playwright", "/opt/node-tools/node_modules/playwright"];
  try {
    tries.push(join(execSync("npm root -g", { encoding: "utf8" }).trim(), "playwright"));
  } catch {
    // No global npm.
  }
  for (const t of tries) {
    try {
      return require(t);
    } catch {
      // Try the next place.
    }
  }
  console.error("Playwright isn't installed. Run: npm install -D playwright && npx playwright install chromium");
  process.exit(1);
}

/** axe-core's browser script, when it's installed. */
function axePath() {
  try {
    return require.resolve("axe-core/axe.min.js");
  } catch {
    return null;
  }
}

/** Watch a page for errors: uncaught exceptions and console errors. */
function watch(page) {
  const errors = [];
  page.on("pageerror", (e) => errors.push(`page error: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error" && !NOISE.test(m.text()) && !NOISE.test(m.location()?.url ?? "")) errors.push(`console: ${m.text().slice(0, 200)}`);
  });
  return errors;
}

/** Wait until the screen has loaded: the network goes quiet and no block is still loading. */
async function settle(page) {
  await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
  await page.waitForFunction(() => !document.querySelector('[aria-busy="true"]'), null, { timeout: 10_000 }).catch(() => {});
  await page.waitForTimeout(300);
}

/** Serious and critical axe findings on the page, as short lines. */
async function axe(page, script) {
  if (!script) return [];
  await page.addScriptTag({ path: script });
  const found = await page.evaluate(async () => {
    const r = await window.axe.run(document, { resultTypes: ["violations"] });
    return r.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.length, target: v.nodes[0]?.target?.join(" ") ?? "" }));
  });
  return found.map((v) => `axe ${v.impact}: ${v.id} (${v.help}), ${v.nodes} on screen, first at ${v.target}`);
}

/** Visible h1 elements on the page. */
const h1s = (page) => page.evaluate(() => [...document.querySelectorAll("h1")].filter((h) => h.offsetParent !== null || h.getClientRects().length > 0).length);

const tasteLine = (url, name) => `node .claude/skills/taste-skill/scripts/inspect.mjs ${url} --app --out .taste-skill/${name}`;

async function main() {
  const { chromium } = playwright();
  const script = axePath();
  if (!script) console.log("axe-core isn't installed, so the accessibility scan is skipped. Run: npm install -D axe-core");
  const browser = await chromium.launch();
  const failures = [];
  try {
    // Sign in once at desktop size; every size reuses the session.
    const first = await browser.newContext({ viewport: SIZES[0] });
    const page = await first.newPage();
    const errors = watch(page);
    try {
      await page.goto(`${APP}${SLUGS.prompts}`, { waitUntil: "domcontentloaded", timeout: 30_000 });
    } catch (e) {
      console.error(`Couldn't open ${APP}. Start the app first (npm run dev, or npx next start). ${e.message.split("\n")[0]}`);
      process.exitCode = 1;
      return;
    }
    const signIn = page.locator('input[type="email"]');
    const shell = page.locator('nav[aria-label="Modules"]');
    await Promise.race([signIn.first().waitFor({ timeout: 30_000 }), shell.first().waitFor({ timeout: 30_000 })]).catch(() => {});

    if (!(await shell.first().isVisible().catch(() => false))) {
      if (!(await signIn.first().isVisible().catch(() => false))) {
        console.error(`Neither the sign-in screen nor the app showed at ${APP} within 30 seconds.`);
        process.exitCode = 1;
        return;
      }
      if (!EMAIL || !PASSWORD) {
        // No test workspace login: check the sign-in screen and stop.
        mkdirSync(join(OUT, String(SIZES[0].width)), { recursive: true });
        await settle(page);
        await page.screenshot({ path: join(OUT, String(SIZES[0].width), "sign-in.png"), fullPage: true });
        const notes = [...errors, ...(await axe(page, script))];
        console.log(`Sign-in screen opened at ${APP}. Screenshot: .ui-check/${SIZES[0].width}/sign-in.png`);
        for (const n of notes) console.log(`  note: ${n}`);
        console.log("Set UI_CHECK_EMAIL and UI_CHECK_PASSWORD (a test workspace login) to check every screen. Stopped at sign-in.");
        console.log(`taste-skill inspector, once signed in: ${tasteLine(`${APP}/prompts`, "prompts")}`);
        return;
      }
      await signIn.first().fill(EMAIL);
      await page.locator('input[type="password"]').first().fill(PASSWORD);
      await page.locator('button[type="submit"]').first().click();
      try {
        await shell.first().waitFor({ timeout: 30_000 });
      } catch {
        console.error("Sign-in didn't open the app within 30 seconds. Check UI_CHECK_EMAIL and UI_CHECK_PASSWORD, and that the workspace has a brand.");
        process.exitCode = 1;
        return;
      }
    }
    const state = await first.storageState();
    await first.close();

    for (const size of SIZES) {
      const dir = join(OUT, String(size.width));
      mkdirSync(dir, { recursive: true });
      const ctx = await browser.newContext({ viewport: size, storageState: state });
      for (const s of SCREENS) {
        const p = await ctx.newPage();
        const errs = watch(p);
        const problems = [];
        try {
          await p.goto(`${APP}${s.path}`, { waitUntil: "domcontentloaded", timeout: 30_000 });
          await settle(p);
          await p.screenshot({ path: join(dir, `${s.id}.png`), fullPage: true });
          const n = await h1s(p);
          if (n !== 1) problems.push(`${n} h1 elements (want 1)`);
          problems.push(...errs, ...(await axe(p, script)));
        } catch (e) {
          problems.push(`didn't load: ${e.message.split("\n")[0]}`);
        }
        await p.close();
        console.log(`${problems.length ? "FAIL" : "ok  "} ${size.width}  ${s.label}`);
        for (const x of problems) console.log(`       ${x}`);
        if (problems.length) failures.push({ size: size.width, screen: s.label, problems });
      }
      await ctx.close();
    }

    console.log(`\nScreenshots in .ui-check/<width>/<screen>.png. ${failures.length ? `${failures.length} screen checks failed.` : "Every screen passed."}`);
    console.log("taste-skill inspector, one screen at a time:");
    for (const s of SCREENS) console.log(`  ${tasteLine(`${APP}${s.path}`, s.id)}`);
    if (!existsSync(join(ROOT, ".claude/skills/taste-skill/scripts/inspect.mjs"))) console.log("  (taste-skill isn't in .claude/skills here.)");
    if (failures.length) process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
