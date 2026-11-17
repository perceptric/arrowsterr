// Feed health for a Google Merchant Center account, from the Merchant API (products v1): how many items are
// approved, limited or disapproved, the top item issues, and missing details AI shopping answers lean on.
// No server-only code here, so tests can load it. Built page by page while the catalog sync reads products.

type Money = { amountMicros?: string | number; currencyCode?: string } | null;
type Attrs = {
  title?: string;
  description?: string;
  brand?: string;
  gtins?: string[];
  gtin?: string[] | string;
  identifierExists?: boolean;
  price?: Money;
  salePrice?: Money;
  availability?: string;
  imageLink?: string;
};
type DestinationStatus = { reportingContext?: string; approvedCountries?: string[]; pendingCountries?: string[]; disapprovedCountries?: string[] };
type ItemIssue = { code?: string; severity?: string; resolution?: string; attribute?: string; reportingContext?: string; description?: string; detail?: string; documentation?: string; applicableCountries?: string[] };
export type HealthProduct = {
  name?: string;
  offerId?: string;
  productAttributes?: Attrs;
  attributes?: Attrs;
  productStatus?: { destinationStatuses?: DestinationStatus[]; itemLevelIssues?: ItemIssue[] } | null;
};

export type ItemStatus = "approved" | "limited" | "disapproved" | "pending";
export const MISSING_KEYS = ["gtin", "brand", "price", "availability", "image", "description"] as const;
export type MissingKey = (typeof MISSING_KEYS)[number];
type Example = { id: string; title: string };
export type FeedIssue = { code: string; title: string; severity: "disapproved" | "demoted" | "info"; attribute: string | null; items: number; doc: string | null; examples: Example[] };
export type FeedHealth = {
  items: number;
  status: Record<ItemStatus, number>;
  issues: FeedIssue[];
  missing: Record<MissingKey, { items: number; examples: Example[] }>;
};

const SEVERITY: Record<string, FeedIssue["severity"]> = { DISAPPROVED: "disapproved", DEMOTED: "demoted" };
const RANK: Record<FeedIssue["severity"], number> = { disapproved: 0, demoted: 1, info: 2 };
const MAX_EXAMPLES = 3;
const MAX_CODES = 500;

/** One item's status across Google's destinations (Shopping ads, free listings and the rest). */
export function itemStatus(p: HealthProduct): ItemStatus {
  const dests = p.productStatus?.destinationStatuses ?? [];
  const issues = p.productStatus?.itemLevelIssues ?? [];
  const approved = dests.some((d) => d.approvedCountries?.length);
  const disapproved = dests.some((d) => d.disapprovedCountries?.length) || issues.some((i) => i.severity === "DISAPPROVED");
  const demoted = issues.some((i) => i.severity === "DEMOTED");
  // Shown somewhere but held back somewhere else, or shown less: limited.
  if (approved) return disapproved || demoted ? "limited" : "approved";
  if (disapproved) return "disapproved";
  return "pending";
}

const filled = (s: unknown) => typeof s === "string" && s.trim().length > 0;
/** The details AI shopping answers use that this item lacks. A GTIN is not needed when the item says it has none. */
export function missingOf(p: HealthProduct): MissingKey[] {
  const a = p.productAttributes ?? p.attributes ?? {};
  const gtins = a.gtins ?? (Array.isArray(a.gtin) ? a.gtin : a.gtin ? [a.gtin] : []);
  const out: MissingKey[] = [];
  if (!gtins.some(filled) && a.identifierExists !== false) out.push("gtin");
  if (!filled(a.brand)) out.push("brand");
  if (a.price?.amountMicros === undefined || a.price.amountMicros === null || a.price.amountMicros === "") out.push("price");
  if (!filled(a.availability) || /UNSPECIFIED/i.test(String(a.availability))) out.push("availability");
  if (!filled(a.imageLink)) out.push("image");
  if (!filled(a.description)) out.push("description");
  return out;
}

type Acc = { items: number; status: Record<ItemStatus, number>; issues: Map<string, FeedIssue>; missing: FeedHealth["missing"] };

export function healthStart(): Acc {
  return {
    items: 0,
    status: { approved: 0, limited: 0, disapproved: 0, pending: 0 },
    issues: new Map(),
    missing: Object.fromEntries(MISSING_KEYS.map((k) => [k, { items: 0, examples: [] }])) as unknown as FeedHealth["missing"],
  };
}

/** Add one page of products. Each issue counts an item once, however many destinations report it. */
export function healthAdd(acc: Acc, products: HealthProduct[]) {
  for (const p of products) {
    acc.items++;
    acc.status[itemStatus(p)]++;
    const a = p.productAttributes ?? p.attributes ?? {};
    const ex: Example = { id: p.offerId ?? p.name?.split("/").pop() ?? "", title: (a.title ?? "").slice(0, 120) };
    for (const k of missingOf(p)) {
      const m = acc.missing[k];
      m.items++;
      if (m.examples.length < MAX_EXAMPLES) m.examples.push(ex);
    }
    const seen = new Set<string>();
    for (const i of p.productStatus?.itemLevelIssues ?? []) {
      const code = String(i.code ?? "").slice(0, 120);
      if (!code || seen.has(code)) continue;
      seen.add(code);
      const sev = SEVERITY[String(i.severity)] ?? "info";
      let row = acc.issues.get(code);
      if (!row) {
        if (acc.issues.size >= MAX_CODES) continue;
        row = { code, title: String(i.description || code).slice(0, 200), severity: sev, attribute: i.attribute ? String(i.attribute).slice(0, 60) : null, items: 0, doc: /^https:\/\//.test(String(i.documentation ?? "")) ? String(i.documentation) : null, examples: [] };
        acc.issues.set(code, row);
      }
      if (RANK[sev] < RANK[row.severity]) row.severity = sev;
      row.items++;
      if (row.examples.length < MAX_EXAMPLES) row.examples.push(ex);
    }
  }
}

/** The finished summary: the worst and most common issues first. */
export function healthDone(acc: Acc, top = 12): FeedHealth {
  const issues = [...acc.issues.values()].sort((a, b) => RANK[a.severity] - RANK[b.severity] || b.items - a.items || a.code.localeCompare(b.code)).slice(0, top);
  return { items: acc.items, status: acc.status, issues, missing: acc.missing };
}

/** The whole summary for a list of products, for tests and small accounts. */
export function feedHealth(products: HealthProduct[], top = 12): FeedHealth {
  const acc = healthStart();
  healthAdd(acc, products);
  return healthDone(acc, top);
}
