import { test } from "node:test";
import assert from "node:assert/strict";
import { guidelinesSavedAt, kitSavedAt, savedLine, sectionOf, voiceSavedAt } from "../src/lib/brandStatus.ts";

const NOW = new Date(2026, 9, 25, 15, 0).getTime();
const OCT3 = new Date(2026, 9, 3, 10, 0).toISOString();

test("sectionOf: voice is the page's own, an unknown tab opens it", () => {
  assert.equal(sectionOf(undefined), "voice");
  assert.equal(sectionOf("voice"), "voice");
  assert.equal(sectionOf("kit"), "kit");
  assert.equal(sectionOf("guidelines"), "guidelines");
  assert.equal(sectionOf("other"), "voice");
});

test("savedLine: nothing while loading, Not set, or the saved day", () => {
  assert.equal(savedLine(undefined, NOW), "");
  assert.equal(savedLine(null, NOW), "Not set");
  assert.equal(savedLine(OCT3, NOW), "Saved Oct 3");
});

test("voiceSavedAt: only a row with a voice counts", () => {
  assert.equal(voiceSavedAt(null), null);
  assert.equal(voiceSavedAt({ voice: null, updated_at: OCT3 }), null);
  assert.equal(voiceSavedAt({ voice: { tone: [] }, updated_at: OCT3 }), OCT3);
});

test("guidelinesSavedAt: empty guidelines are not set", () => {
  assert.equal(guidelinesSavedAt(null), null);
  assert.equal(guidelinesSavedAt({ body: "  ", links: [], files: [], updated_at: OCT3 }), null);
  assert.equal(guidelinesSavedAt({ body: "Use plain words", links: [], files: [], updated_at: OCT3 }), OCT3);
  assert.equal(guidelinesSavedAt({ body: "", links: ["https://acme.com"], files: [], updated_at: OCT3 }), OCT3);
  assert.equal(guidelinesSavedAt({ body: "", links: [], files: [{}], updated_at: OCT3 }), OCT3);
});

test("kitSavedAt: saved over learned, null without a kit", () => {
  assert.equal(kitSavedAt(null), null);
  assert.equal(kitSavedAt({ confirmed_at: null, learned_at: OCT3 }), OCT3);
  assert.equal(kitSavedAt({ confirmed_at: "2026-10-05T10:00:00Z", learned_at: OCT3 }), "2026-10-05T10:00:00Z");
});
