import { test } from "node:test";
import assert from "node:assert/strict";
import { isMigration, migrationQuery, pendingMigrations } from "../src/lib/migrations.ts";

test("only numbered files that haven't run are pending, in order", () => {
  const files = ["schema.sql", "templates", "103_writing_chats.sql", "099_nurture.sql", "102_doc_versions_label.sql", "notes.md"];
  assert.deepEqual(pendingMigrations(files, ["099_nurture.sql"]), ["102_doc_versions_label.sql", "103_writing_chats.sql"]);
  assert.deepEqual(pendingMigrations(files, ["099_nurture.sql", "102_doc_versions_label.sql", "103_writing_chats.sql"]), []);
  assert.equal(isMigration("schema.sql"), false);
});

test("a file runs with its record in the same query", () => {
  const q = migrationQuery("103_x.sql", "alter table t add column if not exists k text\n", "abc");
  assert.match(q, /^alter table t add column if not exists k text;\n/);
  assert.match(q, /values \('103_x\.sql', now\(\), 'abc'\) on conflict do nothing;/);
  assert.match(q, /notify pgrst/);
  assert.doesNotMatch(q, /\bbegin\b|\bcommit\b/);
});
