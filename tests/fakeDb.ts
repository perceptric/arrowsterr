// A small in-memory stand-in for the Supabase client, for tests that run server code without a database.
// It supports the query calls the API, MCP and partner code use, and records every row it hands back
// (`served`), so a test can check that a caller never saw another brand's rows.
import { randomUUID } from "node:crypto";

type Row = Record<string, unknown>;
type Filter = (r: Row) => boolean;
type Result = { data: unknown; error: { message: string; code?: string } | null; count?: number | null };

export type FakeDb = ReturnType<typeof fakeDb>;

/** Unique indexes, by table: each is a list of columns that must not repeat (rows with a null in them are skipped). */
const UNIQUE: Record<string, string[][]> = {
  brands: [["workspace_id", "external_id"]],
  api_keys: [["hash"]],
  sites: [["workspace_id", "domain"]],
};

const pick = (row: Row, cols: string) => {
  if (!cols || cols.trim() === "*") return { ...row };
  const out: Row = {};
  for (const c of cols.split(",").map((x) => x.trim()).filter(Boolean)) out[c] = row[c];
  return out;
};

/** "brand_id.eq.x,domain.eq.\"acme.com\"" as one filter. */
function orFilter(expr: string): Filter {
  const parts = expr.split(",").map((p) => {
    const [col, op, ...rest] = p.split(".");
    const val = rest.join(".").replace(/^"|"$/g, "");
    if (op !== "eq") throw new Error(`fakeDb: or() supports eq only, got ${op}`);
    return (r: Row) => String(r[col]) === val;
  });
  return (r) => parts.some((f) => f(r));
}

export function fakeDb(seed: Record<string, Row[]> = {}) {
  const tables: Record<string, Row[]> = Object.fromEntries(Object.entries(seed).map(([k, v]) => [k, v.map((r) => ({ ...r }))]));
  const served: { table: string; row: Row }[] = [];
  const rpcs: { name: string; args: Row }[] = [];
  const rows = (t: string) => (tables[t] ??= []);

  function clash(table: string, row: Row, except?: Row) {
    for (const cols of UNIQUE[table] ?? []) {
      if (cols.some((c) => row[c] === null || row[c] === undefined)) continue;
      if (rows(table).some((r) => r !== except && cols.every((c) => r[c] === row[c]))) return `duplicate key value violates unique constraint "${table}_${cols.join("_")}"`;
    }
    return null;
  }

  function from(table: string) {
    let op: "select" | "insert" | "update" | "delete" | "upsert" = "select";
    let cols = "*";
    let countMode = false;
    let head = false;
    let returning: string | null = null;
    let payload: Row[] = [];
    let patch: Row = {};
    let upsertOpts: { onConflict?: string; ignoreDuplicates?: boolean } = {};
    const filters: Filter[] = [];
    const orderBy: { col: string; asc: boolean }[] = [];
    let lim: number | null = null;
    let offset = 0;
    let mode: "many" | "maybe" | "single" = "many";

    const run = (): Result => {
      if (op === "insert" || op === "upsert") {
        const made: Row[] = [];
        for (const p of payload) {
          if (op === "upsert" && upsertOpts.onConflict) {
            const keys = upsertOpts.onConflict.split(",").map((x) => x.trim());
            const hit = rows(table).find((r) => keys.every((k) => r[k] === p[k]));
            if (hit) {
              if (!upsertOpts.ignoreDuplicates) Object.assign(hit, p);
              continue;
            }
          }
          const row: Row = { id: randomUUID(), created_at: new Date().toISOString(), ...p };
          const dup = clash(table, row);
          if (dup) return { data: null, error: { message: dup, code: "23505" } };
          rows(table).push(row);
          made.push(row);
        }
        return finish(made);
      }
      let hit = rows(table).filter((r) => filters.every((f) => f(r)));
      if (op === "update") {
        for (const r of hit) Object.assign(r, patch);
        return finish(hit);
      }
      if (op === "delete") {
        tables[table] = rows(table).filter((r) => !hit.includes(r));
        return finish(hit);
      }
      for (const o of [...orderBy].reverse()) hit = [...hit].sort((a, b) => (String(a[o.col]) < String(b[o.col]) ? -1 : String(a[o.col]) > String(b[o.col]) ? 1 : 0) * (o.asc ? 1 : -1));
      if (countMode && head) return { data: null, error: null, count: hit.length };
      const page = hit.slice(offset, lim === null ? undefined : offset + lim);
      const out = page.map((r) => pick(r, cols));
      for (const row of out) served.push({ table, row });
      return shape(out, countMode ? hit.length : null);
    };
    const finish = (touched: Row[]): Result => {
      if (returning === null) return { data: null, error: null };
      const out = touched.map((r) => pick(r, returning!));
      for (const row of out) served.push({ table, row });
      return shape(out, null);
    };
    const shape = (out: Row[], count: number | null): Result => {
      if (mode === "maybe") return { data: out[0] ?? null, error: null, count };
      if (mode === "single") return out.length === 1 ? { data: out[0], error: null, count } : { data: null, error: { message: "JSON object requested, multiple (or no) rows returned" }, count };
      return { data: out, error: null, count };
    };

    const q = {
      select(c = "*", opts: { count?: string; head?: boolean } = {}) {
        if (op === "select") {
          cols = c;
          countMode = Boolean(opts.count);
          head = Boolean(opts.head);
        } else returning = c;
        return q;
      },
      insert(r: Row | Row[]) {
        op = "insert";
        payload = Array.isArray(r) ? r : [r];
        return q;
      },
      upsert(r: Row | Row[], opts: { onConflict?: string; ignoreDuplicates?: boolean } = {}) {
        op = "upsert";
        payload = Array.isArray(r) ? r : [r];
        upsertOpts = opts;
        return q;
      },
      update(p: Row) {
        op = "update";
        patch = p;
        return q;
      },
      delete() {
        op = "delete";
        return q;
      },
      eq: (c: string, v: unknown) => (filters.push((r) => r[c] === v), q),
      neq: (c: string, v: unknown) => (filters.push((r) => r[c] !== v), q),
      is: (c: string, v: unknown) => (filters.push((r) => (v === null ? r[c] === null || r[c] === undefined : r[c] === v)), q),
      in: (c: string, v: unknown[]) => (filters.push((r) => v.includes(r[c])), q),
      gte: (c: string, v: unknown) => (filters.push((r) => String(r[c]) >= String(v)), q),
      gt: (c: string, v: unknown) => (filters.push((r) => String(r[c]) > String(v)), q),
      lte: (c: string, v: unknown) => (filters.push((r) => String(r[c]) <= String(v)), q),
      lt: (c: string, v: unknown) => (filters.push((r) => String(r[c]) < String(v)), q),
      ilike: (c: string, v: string) => (filters.push((r) => new RegExp(`^${v.replace(/%/g, ".*")}$`, "i").test(String(r[c] ?? ""))), q),
      or: (expr: string) => (filters.push(orFilter(expr)), q),
      order: (col: string, o: { ascending?: boolean; nullsFirst?: boolean } = {}) => (orderBy.push({ col, asc: o.ascending !== false }), q),
      limit: (n: number) => ((lim = n), q),
      range: (a: number, b: number) => ((offset = a), (lim = b - a + 1), q),
      maybeSingle: () => ((mode = "maybe"), q),
      single: () => ((mode = "single"), q),
      then: (ok: (r: Result) => unknown, bad?: (e: unknown) => unknown) => {
        try {
          return Promise.resolve(run()).then(ok, bad);
        } catch (e) {
          return bad ? Promise.resolve(bad(e)) : Promise.reject(e);
        }
      },
    };
    return q;
  }

  return {
    tables,
    served,
    rpcs,
    from,
    rpc: (name: string, args: Row) => {
      rpcs.push({ name, args });
      return Promise.resolve({ data: null, error: null });
    },
  };
}
