import "server-only";
import { lookup } from "node:dns/promises";
import type { SupabaseClient } from "@supabase/supabase-js";
import { vetPage, type VetDeps } from "./articleResearch";
import { askJson, claudeModel } from "./claude";
import { UA, safeFetch } from "./safeFetch";
import type { DraftDeps } from "./writerDraft";
import { sectionPlain } from "./writerDraft";
import { imagePath, imageTasks, imagesResult, planRenders, specPrompt, SPECS_SCHEMA, isDrawn, type ImageRow } from "./writerImages";
import type { ImagesOut } from "./writerImageTypes";

// The database, storage and Claude behind a draft's images (writerImages.ts), and the Fly worker's side:
// /api/writer/image-next leases one image, /api/writer/image-done saves it (docs/agentic-writing.md, section 5).

const BUCKET = "doc-images";
const LEASE_S = 90; // 20 seconds a page and the frame, plus the trip
const MAX_BYTES = 9_000_000; // under the bucket's 10 MB
const SETUP = "Run supabase/057_writer_images.sql in Supabase.";
const must = <T>(r: { data: T; error: { message: string } | null }) => {
  if (r.error) throw new Error(r.error.message + (/writer_images|lease_writer_image/.test(r.error.message) ? ` ${SETUP}` : ""));
  return r.data;
};
const stamp = () => new Date().toISOString();

const robotsSeen = new Map<string, { at: number; value: { status: number; body: string } | null }>();
/** The same checks a research page gets: a public address, and robots.txt allows it. */
const vetDeps: VetDeps = {
  resolve: async (host) => (await lookup(host, { all: true })).map((a) => a.address),
  async robots(origin) {
    const hit = robotsSeen.get(origin);
    if (hit && Date.now() - hit.at < 3600_000) return hit.value;
    const r = await safeFetch(`${origin}/robots.txt`, { timeout: 8_000, maxBytes: 500_000, accept: "text/plain,*/*;q=0.5", ua: UA });
    const value = r.status ? { status: r.status, body: r.ok ? r.body : "" } : null;
    if (robotsSeen.size > 2000) robotsSeen.clear();
    robotsSeen.set(origin, { at: Date.now(), value });
    return value;
  },
};

const COLS = "n, kind, status, public_url, width, height, error, created_at, attempts, locked_until";
type Row = ImageRow & { attempts: number; locked_until: string | null };

/** A row whose worker died on its last try reads as failed, so the draft stops waiting for it. */
const settled = (r: Row, now: number): ImageRow =>
  r.status === "working" && r.attempts >= 3 && r.locked_until && Date.parse(r.locked_until) < now ? { ...r, status: "failed", error: "The worker stopped while making this image." } : r;

/**
 * The draft's image step (DraftDeps.images). The first time for a draft version it writes the drawn images' specs
 * in one Claude call, checks each screenshot's page, and saves a row per image for the worker. After that it reads
 * the rows: "wait" while images are being made (10 minutes at most), then the images to place and the ones to note.
 */
export function draftImages(db: SupabaseClient, model = process.env.WRITER_MODEL?.trim() || claudeModel()): NonNullable<DraftDeps["images"]> {
  return async ({ draft, brief, sections, ctx, prefix }): Promise<ImagesOut> => {
    const tasks = imageTasks(brief);
    const now = Date.now();
    const rows = (must(await db.from("writer_images").select(COLS).eq("draft_id", draft.id).eq("version", draft.version)) ?? []) as Row[];
    if (rows.length) return imagesResult(tasks, rows.map((r) => settled(r, now)), now);

    const article = { title: brief.h1, sections: sections.map((s) => ({ h2: s.h2 || "intro", text: sectionPlain(s) })) };
    // One call writes every drawn image's spec. With only the featured image, its title is enough.
    const raw = tasks.some((t) => isDrawn(t.kind) && t.kind !== "featured") ? await askJson(specPrompt(tasks, article), SPECS_SCHEMA, { prefix, model, maxTokens: 6000 }).catch(() => ({ specs: [] })) : { specs: [] }; // a failed call leaves notes, never a failed draft
    const { renders, missing } = planRenders(tasks, raw, article, ctx.kit);
    const base = { workspace_id: draft.workspace_id, draft_id: draft.id, version: draft.version };
    const out: Record<string, unknown>[] = [];
    for (const r of renders) {
      if (r.url) {
        const vet = await vetPage(r.url, vetDeps).catch((e: unknown) => ({ ok: false as const, reason: "failed" as const, error: e instanceof Error ? e.message : String(e) }));
        if (!vet.ok) {
          out.push({ ...base, n: r.n, kind: r.kind, url: r.url, status: "failed", error: `The page can't be pictured: ${vet.error}` });
          continue;
        }
      }
      out.push({ ...base, n: r.n, kind: r.kind, url: r.url ?? null, html: r.html, status: "queued" });
    }
    for (const m of missing) out.push({ ...base, n: m.n, kind: m.kind, url: m.url ?? null, status: "failed", error: m.reason });
    if (out.length) must(await db.from("writer_images").upsert(out, { onConflict: "draft_id,version,n", ignoreDuplicates: true }));
    const made = (must(await db.from("writer_images").select(COLS).eq("draft_id", draft.id).eq("version", draft.version)) ?? []) as Row[];
    return imagesResult(tasks, made, Date.now());
  };
}

// ─────────────── the worker ───────────────
/** The next image for a worker to make, leased for 90 seconds, or null when none is waiting. */
export async function leaseNextImage(db: SupabaseClient, worker: string): Promise<{ id: number; kind: string; url: string | null; html: string; width: number } | null> {
  const rows = must(await db.rpc("lease_writer_image", { p_worker: worker, p_lease_seconds: LEASE_S })) as { id: number; kind: string; url: string | null; html: string | null }[] | null;
  const r = rows?.[0];
  if (!r) return null;
  return { id: r.id, kind: r.kind, url: r.url, html: r.html ?? "", width: 1600 };
}

type Leased = { id: number; workspace_id: string; draft_id: string; version: number; n: number; status: string; locked_by: string | null; attempts: number };
async function leased(db: SupabaseClient, worker: string, id: number) {
  const r = must(await db.from("writer_images").select("id, workspace_id, draft_id, version, n, status, locked_by, attempts").eq("id", id).maybeSingle()) as Leased | null;
  return r && r.status === "working" && r.locked_by === worker ? r : null;
}

/** The file's real type from its first bytes. Only PNG and JPEG come from the worker. */
export function sniff(b: Uint8Array): "png" | "jpg" | null {
  if (b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "png";
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpg";
  return null;
}

/** The picture the worker made: saved at the image's own path (a retry overwrites it) and the row marked done. */
export async function saveImage(db: SupabaseClient, worker: string, id: number, bytes: Uint8Array, size: { width: number; height: number }): Promise<{ ok: boolean; error?: string }> {
  const row = await leased(db, worker, id);
  if (!row) return { ok: false, error: "This image is not leased to this worker." };
  const ext = sniff(bytes);
  if (!ext) return { ok: false, error: "Send a PNG or a JPEG." };
  if (bytes.length > MAX_BYTES) return { ok: false, error: "The image is too big." };
  const width = Math.round(size.width);
  const height = Math.round(size.height);
  if (!(width > 0 && width <= 4000 && height > 0 && height <= 8000)) return { ok: false, error: "Send the image's width and height." };
  const path = imagePath(row.workspace_id, row.draft_id, row.version, row.n, ext);
  const { error } = await db.storage.from(BUCKET).upload(path, bytes, { contentType: ext === "png" ? "image/png" : "image/jpeg", upsert: true });
  if (error) throw new Error(error.message);
  const publicUrl = db.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
  must(
    await db
      .from("writer_images")
      .update({ status: "done", path, public_url: publicUrl, width, height, error: null, locked_until: null, updated_at: stamp() })
      .eq("id", id)
      .eq("locked_by", worker)
      .eq("status", "working"),
  );
  return { ok: true };
}

/**
 * Why the worker could not make an image. A page that blocked the bot or came back blank is final; anything else
 * goes back in the queue once, then fails, so the draft keeps a note there and finishes.
 */
export async function failImage(db: SupabaseClient, worker: string, id: number, error: string, final: boolean): Promise<{ ok: boolean; error?: string }> {
  const row = await leased(db, worker, id);
  if (!row) return { ok: false, error: "This image is not leased to this worker." };
  const again = !final && row.attempts < 2;
  must(
    await db
      .from("writer_images")
      .update({ status: again ? "queued" : "failed", error: error.slice(0, 500) || "This image could not be made.", locked_by: null, locked_until: null, updated_at: stamp() })
      .eq("id", id)
      .eq("locked_by", worker)
      .eq("status", "working"),
  );
  return { ok: true };
}
