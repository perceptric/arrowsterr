import { test } from "node:test";
import assert from "node:assert/strict";
import { chatLine, isAutopilot, kindOf, pieceState, piecesByThread, splitChats, STATE_LABEL } from "../src/lib/writingChats.ts";

test("a piece shows the furthest step it reached", () => {
  assert.equal(pieceState({ item: "published", brief: "approved", draft: "ready" }), "published");
  assert.equal(pieceState({ item: "planned", brief: "approved", draft: "ready" }), "draft_ready");
  assert.equal(pieceState({ brief: "approved", draft: "generating" }), "writing");
  assert.equal(pieceState({ brief: "generating" }), "writing", "an outline being written counts as writing");
  assert.equal(pieceState({ brief: "ready" }), "outline_ready");
  assert.equal(pieceState({ brief: "approved" }), "outline_ready");
  assert.equal(pieceState({ brief: "approved", draft: "failed" }), "failed");
  assert.equal(pieceState({ brief: "failed" }), "failed");
  assert.equal(pieceState({ item: "planned" }), "not_started");
  assert.deepEqual(
    (["draft_ready", "writing", "outline_ready", "published"] as const).map((s) => STATE_LABEL[s]),
    ["Draft ready", "Writing", "Outline ready", "Published"],
  );
});

test("each chat lists its pieces once, in the order it first touched them, with Autopilot's marks as links", () => {
  const items = [
    { id: "i1", keyword: "freshdesk alternatives", status: "planned", extra: null },
    { id: "i2", keyword: "how to calculate nps", status: "planned", extra: { autopilot_thread: "auto" } },
    { id: "i3", keyword: "zendesk vs freshdesk", status: "published", extra: {} },
  ];
  const links = [
    { thread_id: "t1", item_id: "i3", created_at: "2026-11-25T09:00:00Z" },
    { thread_id: "t1", item_id: "i1", created_at: "2026-11-25T08:00:00Z" },
    { thread_id: "t1", item_id: "i1", created_at: "2026-11-25T10:00:00Z" },
    { thread_id: "auto", item_id: "i2", created_at: "2026-11-25T08:02:00Z" },
    { thread_id: "t2", item_id: "gone", created_at: "2026-11-25T08:00:00Z" },
  ];
  const out = piecesByThread(links, items, [{ item_id: "i1", status: "approved" }, { item_id: "i2", status: "generating" }], [{ item_id: "i1", status: "ready" }]);
  assert.deepEqual(
    out.t1.map((p) => [p.keyword, p.state]),
    [
      ["freshdesk alternatives", "draft_ready"],
      ["zendesk vs freshdesk", "published"],
    ],
  );
  assert.deepEqual(out.auto, [{ item_id: "i2", keyword: "how to calculate nps", state: "writing" }], "a piece linked twice (table and mark) shows once");
  assert.equal(out.t2, undefined, "a deleted piece leaves no empty list");
});

test("writing chats are the folder's, the Writer's, Autopilot's and any that worked on a piece", () => {
  const threads = [
    { id: "a", title: "Freshdesk alternatives", kind: "writer", project_id: null },
    { id: "b", title: "Autopilot · 2026-11-25", kind: null, project_id: null },
    { id: "c", title: "Site health check", kind: null, project_id: null },
    { id: "d", title: "Moved into the folder", kind: null, project_id: "p" },
    { id: "e", title: "Asked to write from the Calendar", kind: null, project_id: "other" },
  ];
  const pieces = { e: [{ item_id: "i", keyword: "k", state: "outline_ready" as const }] };
  const { writing, other } = splitChats(threads, "p", pieces);
  assert.deepEqual(writing.map((t) => t.id), ["a", "b", "d", "e"]);
  assert.deepEqual(other.map((t) => t.id), ["c"]);
  assert.equal(isAutopilot({ kind: "autopilot", title: "Renamed" }), true);
  assert.equal(isAutopilot({ kind: "writer", title: "Autopilot · Nov 25" }), false, "a kind wins over the title");
});

test("a chat started on the Writer page is a writer chat; others have no kind", () => {
  assert.equal(kindOf({ page: "Writer" }), "writer");
  assert.equal(kindOf({ page: "Zippie" }), null);
  assert.equal(kindOf(null), null);
});

test("the sidebar line is the first piece's status and how many more", () => {
  assert.equal(chatLine(undefined), null);
  assert.deepEqual(chatLine([{ item_id: "1", keyword: "a", state: "writing" }]), { state: "writing", text: "Writing" });
  assert.deepEqual(chatLine([{ item_id: "1", keyword: "a", state: "outline_ready" }, { item_id: "2", keyword: "b", state: "writing" }, { item_id: "3", keyword: "c", state: "writing" }]), { state: "outline_ready", text: "Outline ready · 2 more" });
});
