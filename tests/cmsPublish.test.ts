import assert from "node:assert/strict";
import { test } from "node:test";
import { cmsSlug, framerItem, mapFields, pickCollection } from "../src/lib/cmsMap.ts";
import { cmsScheduleKey, publishPlan, runCmsSchedule, type ScheduleDeps } from "../src/lib/cmsSchedule.ts";
import type { Published } from "../src/lib/cmsTypes.ts";

test("the blog collection is picked, a named one wins, and a missing name picks nothing", () => {
  const list = [
    { id: "c1", name: "Team" },
    { id: "c2", name: "Blog Posts" },
    { id: "c3", name: "Careers" },
  ];
  assert.equal(pickCollection(list)?.id, "c2");
  assert.equal(pickCollection(list, "careers")?.id, "c3");
  assert.equal(pickCollection(list, "c1")?.id, "c1");
  assert.equal(pickCollection(list, "Blgo"), null);
  assert.equal(pickCollection([{ id: "x", name: "Pages" }])?.id, "x");
  assert.equal(pickCollection([]), null);
});

test("Framer fields map by type and name, and a collection without rich text is refused", () => {
  const map = mapFields([
    { id: "t", name: "Title", type: "string" },
    { id: "a", name: "Author", type: "string" },
    { id: "s", name: "Excerpt", type: "string" },
    { id: "b", name: "Content", type: "formattedText" },
    { id: "i", name: "Cover", type: "image" },
    { id: "d", name: "Date", type: "date" },
  ]);
  assert.deepEqual(map, { title: "t", body: "b", summary: "s", image: "i", date: "d" });
  // Author is never taken for the title or the summary.
  const loose = mapFields([
    { id: "a", name: "Author", type: "string" },
    { id: "b", name: "Body", type: "formattedText" },
  ]);
  assert.deepEqual(loose, { title: null, body: "b", summary: null, image: null, date: null });
  assert.equal(mapFields([{ id: "t", name: "Title", type: "string" }]), null);
});

test("Webflow field types map the same way", () => {
  const map = mapFields([
    { id: "post-body", name: "Post Body", type: "RichText" },
    { id: "post-summary", name: "Post Summary", type: "PlainText" },
    { id: "main-image", name: "Main Image", type: "Image" },
    { id: "thumb", name: "Thumbnail image", type: "Image" },
  ]);
  assert.equal(map?.body, "post-body");
  assert.equal(map?.summary, "post-summary");
  assert.equal(map?.image, "main-image");
});

test("a Framer item carries the article, keeps its id on update, and only new items get a date", () => {
  const map = { title: "t", body: "b", summary: "s", image: "i", date: "d" };
  const now = new Date("2026-11-11T10:00:00Z");
  const fresh = framerItem(map, { title: "GEO vs SEO", html: "<p>Hi</p>", slug: "", description: "Short", image: "https://x.com/a.png", live: false }, now);
  assert.equal(fresh.slug, "geo-vs-seo");
  assert.equal(fresh.draft, true);
  assert.equal("id" in fresh, false);
  assert.deepEqual(fresh.fieldData.b, { type: "formattedText", value: "<p>Hi</p>", contentType: "html" });
  assert.equal(fresh.fieldData.d.value, "2026-11-11T10:00:00.000Z");
  const update = framerItem(map, { title: "GEO vs SEO", html: "<p>Hi</p>", slug: "geo", description: "", image: "", live: true }, now, "item9");
  assert.equal(update.id, "item9");
  assert.equal(update.draft, false);
  assert.equal(update.fieldData.d, undefined, "the first publish date stays");
  assert.equal(update.fieldData.s, undefined);
  assert.equal(cmsSlug({ slug: "", title: "!!" }), "post");
});

function memory(rec: Published | null, fail = 0) {
  let saved: Published | null = rec ? { ...rec } : null;
  const calls = { live: [] as string[], published: 0 };
  let left = fail;
  const deps: ScheduleDeps = {
    record: async () => (saved ? { ...saved } : null),
    goLive: async (id) => {
      if (left-- > 0) throw new Error("503: Service Unavailable");
      calls.live.push(id);
      return { id, url: "https://acme.com/blog/geo" };
    },
    save: async (r) => void (saved = { ...r }),
    published: async () => void calls.published++,
    now: () => new Date("2026-11-13T09:00:30Z"),
  };
  return { deps, calls, saved: () => saved };
}
const at = "2026-11-13T09:00:00.000Z";
const rec: Published = { connectionId: "c1", kind: "webflow", id: "item1", url: null, live: false, at: "2026-11-11T10:00:00Z", scheduledFor: at };

test("a scheduled article goes live once, on the same item, even when the job runs twice", async () => {
  const m = memory(rec);
  assert.equal(await runCmsSchedule(m.deps, at), "published");
  assert.equal(await runCmsSchedule(m.deps, at), "skipped");
  assert.deepEqual(m.calls.live, ["item1"]);
  assert.equal(m.calls.published, 1);
  const s = m.saved()!;
  assert.equal(s.live, true);
  assert.equal(s.scheduledFor, undefined);
  assert.equal(s.url, "https://acme.com/blog/geo");
});

test("a moved or cleared schedule skips the old job, and a failure keeps the schedule for the retry", async () => {
  const moved = memory({ ...rec, scheduledFor: "2026-11-14T09:00:00.000Z" });
  assert.equal(await runCmsSchedule(moved.deps, at), "skipped");
  assert.equal(moved.calls.live.length, 0);
  assert.equal(await runCmsSchedule(memory(null).deps, at), "skipped");

  const flaky = memory(rec, 1);
  await assert.rejects(runCmsSchedule(flaky.deps, at), /503/);
  assert.equal(flaky.saved()!.scheduledFor, at, "nothing changed, so the retry still matches");
  assert.equal(await runCmsSchedule(flaky.deps, at), "published");
  assert.deepEqual(flaky.calls.live, ["item1"]);
});

test("Publish modes: a passed time publishes now, a bad one asks again", () => {
  const now = new Date("2026-11-11T10:00:00Z");
  assert.deepEqual(publishPlan("publish", null, now), { live: true, at: null });
  assert.deepEqual(publishPlan("draft", null, now), { live: false, at: null });
  assert.deepEqual(publishPlan("schedule", "2026-11-13T09:00:00Z", now), { live: false, at: "2026-11-13T09:00:00.000Z" });
  assert.deepEqual(publishPlan("schedule", "2026-11-11T09:00:00Z", now), { live: true, at: null });
  assert.ok("error" in publishPlan("schedule", "soon", now));
  assert.equal(cmsScheduleKey("d", "c", at), `cms:d:c:${at}`);
});
