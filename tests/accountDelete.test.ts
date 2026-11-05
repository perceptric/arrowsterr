import assert from "node:assert/strict";
import { test } from "node:test";
import { planAccountDelete, planText, type WorkspaceRow } from "../src/lib/accountDelete.ts";

const me = "u1";
const ws = (id: string, members: WorkspaceRow["members"], extra: Partial<WorkspaceRow> = {}): WorkspaceRow => ({ id, name: `WS ${id}`, plan: "free", plan_status: null, stripe_subscription_id: null, members, ...extra });
const m = (user_id: string, role: WorkspaceRow["members"][number]["role"], created_at = "2026-01-01") => ({ user_id, role, created_at });

test("account delete: a workspace of one is deleted", () => {
  const p = planAccountDelete(me, [ws("a", [m(me, "owner")])]);
  assert.deepEqual(p.remove.map((w) => w.id), ["a"]);
  assert.equal(p.blocked.length, 0);
});

test("account delete: a paid plan on a workspace that would be deleted blocks it", () => {
  const p = planAccountDelete(me, [ws("a", [m(me, "owner")], { plan: "scale", plan_status: "active", stripe_subscription_id: "sub_1" })]);
  assert.equal(p.remove.length, 0);
  assert.match(p.blocked[0].why, /Cancel its plan/);
  // A cancelled subscription no longer blocks.
  assert.equal(planAccountDelete(me, [ws("a", [m(me, "owner")], { plan_status: "canceled", stripe_subscription_id: "sub_1" })]).remove.length, 1);
});

test("account delete: an owned workspace with others passes to the longest-standing admin", () => {
  const p = planAccountDelete(me, [ws("a", [m(me, "owner"), m("u3", "admin", "2026-03-01"), m("u2", "admin", "2026-02-01"), m("u4", "editor", "2025-01-01")])]);
  assert.deepEqual(p.transfer, [{ id: "a", name: "WS a", to: "u2" }]);
});

test("account delete: an owned workspace with members but no admin blocks the delete", () => {
  const p = planAccountDelete(me, [ws("a", [m(me, "owner"), m("u2", "editor")])]);
  assert.equal(p.transfer.length, 0);
  assert.match(p.blocked[0].why, /admin/);
});

test("account delete: a workspace you only belong to is left, and its plan never blocks", () => {
  const p = planAccountDelete(me, [ws("a", [m("u9", "owner"), m(me, "editor")], { plan_status: "active", stripe_subscription_id: "sub_1" })]);
  assert.deepEqual(p.leave.map((w) => w.id), ["a"]);
  assert.equal(p.blocked.length, 0);
});

test("account delete: the plan reads as plain sentences", () => {
  const p = planAccountDelete(me, [ws("a", [m(me, "owner")]), ws("b", [m(me, "owner"), m("u2", "admin")]), ws("c", [m("u9", "owner"), m(me, "viewer")])]);
  assert.deepEqual(planText(p, { u2: "dana@acme.com" }), [
    "WS a will be deleted with everything in it.",
    "WS b will pass to dana@acme.com.",
    "You will leave WS c. It keeps going without you.",
  ]);
});
