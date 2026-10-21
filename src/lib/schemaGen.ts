// The Schema Markup Generator (docs/free-tools.md): the fields for each type, the JSON-LD they build and what's
// missing, following Google's structured data docs and schema.org. Pure and free of imports, so the form can rebuild
// the JSON-LD in the visitor's browser on every key press.

export type SchemaType = "FAQPage" | "Article" | "Product" | "Organization" | "LocalBusiness";
export const SCHEMA_TYPES: { type: SchemaType; label: string }[] = [
  { type: "FAQPage", label: "FAQ" },
  { type: "Article", label: "Article" },
  { type: "Product", label: "Product" },
  { type: "Organization", label: "Organization" },
  { type: "LocalBusiness", label: "Local business" },
];

export type Need = "required" | "recommended" | "optional";
export type FieldKind = "text" | "longtext" | "url" | "date" | "number" | "select" | "list" | "faqs" | "hours";
export type SchemaField = { key: string; label: string; kind: FieldKind; need: Need; options?: string[] };

export type Faq = { q: string; a: string };
export type Hours = { days: string[]; opens: string; closes: string };
export type SchemaValues = Record<string, string | string[] | Faq[] | Hours[] | undefined>;

export const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const AVAILABILITY = ["InStock", "OutOfStock", "PreOrder", "BackOrder", "LimitedAvailability", "Discontinued", "SoldOut", "OnlineOnly", "InStoreOnly"];
const CONDITION = ["NewCondition", "UsedCondition", "RefurbishedCondition", "DamagedCondition"];

const ADDRESS: SchemaField[] = [
  { key: "street", label: "Street address", kind: "text", need: "recommended" },
  { key: "city", label: "City", kind: "text", need: "recommended" },
  { key: "region", label: "State or region", kind: "text", need: "recommended" },
  { key: "postalCode", label: "Postal code", kind: "text", need: "recommended" },
  { key: "country", label: "Country code", kind: "text", need: "recommended" },
];

/** Each type's fields, in form order. "required" and "recommended" follow Google's docs for that rich result. */
export const SCHEMA_FIELDS: Record<SchemaType, SchemaField[]> = {
  FAQPage: [{ key: "faqs", label: "Questions and answers", kind: "faqs", need: "required" }],
  Article: [
    { key: "subtype", label: "Kind", kind: "select", need: "optional", options: ["Article", "BlogPosting", "NewsArticle"] },
    { key: "headline", label: "Headline", kind: "text", need: "recommended" },
    { key: "description", label: "Description", kind: "longtext", need: "optional" },
    { key: "url", label: "Page address", kind: "url", need: "optional" },
    { key: "image", label: "Image addresses", kind: "list", need: "recommended" },
    { key: "datePublished", label: "Published", kind: "date", need: "recommended" },
    { key: "dateModified", label: "Updated", kind: "date", need: "recommended" },
    { key: "authorName", label: "Author", kind: "text", need: "recommended" },
    { key: "authorUrl", label: "Author page", kind: "url", need: "recommended" },
    { key: "publisherName", label: "Publisher", kind: "text", need: "optional" },
    { key: "publisherLogo", label: "Publisher logo", kind: "url", need: "optional" },
  ],
  Product: [
    { key: "name", label: "Product name", kind: "text", need: "required" },
    { key: "description", label: "Description", kind: "longtext", need: "recommended" },
    { key: "image", label: "Image addresses", kind: "list", need: "recommended" },
    { key: "brand", label: "Brand", kind: "text", need: "recommended" },
    { key: "sku", label: "SKU", kind: "text", need: "optional" },
    { key: "gtin", label: "GTIN", kind: "text", need: "recommended" },
    { key: "url", label: "Page address", kind: "url", need: "optional" },
    { key: "price", label: "Price", kind: "number", need: "recommended" },
    { key: "priceCurrency", label: "Currency", kind: "text", need: "recommended" },
    { key: "availability", label: "Availability", kind: "select", need: "recommended", options: AVAILABILITY },
    { key: "condition", label: "Condition", kind: "select", need: "optional", options: CONDITION },
    { key: "priceValidUntil", label: "Price valid until", kind: "date", need: "optional" },
    { key: "ratingValue", label: "Average rating", kind: "number", need: "optional" },
    { key: "reviewCount", label: "Number of reviews", kind: "number", need: "optional" },
  ],
  Organization: [
    { key: "name", label: "Name", kind: "text", need: "recommended" },
    { key: "legalName", label: "Legal name", kind: "text", need: "optional" },
    { key: "url", label: "Website", kind: "url", need: "recommended" },
    { key: "logo", label: "Logo address", kind: "url", need: "recommended" },
    { key: "description", label: "Description", kind: "longtext", need: "recommended" },
    { key: "email", label: "Email", kind: "text", need: "optional" },
    { key: "telephone", label: "Phone", kind: "text", need: "optional" },
    { key: "foundingDate", label: "Founded", kind: "date", need: "optional" },
    ...ADDRESS.map((f) => ({ ...f, need: "optional" as Need })),
    { key: "sameAs", label: "Profiles (LinkedIn, X, Wikipedia)", kind: "list", need: "recommended" },
  ],
  LocalBusiness: [
    { key: "subtype", label: "Kind", kind: "select", need: "optional", options: ["LocalBusiness", "Restaurant", "Store", "Dentist", "MedicalClinic", "LegalService", "AutoRepair", "HomeAndConstructionBusiness", "HealthAndBeautyBusiness", "RealEstateAgent", "FinancialService", "LodgingBusiness"] },
    { key: "name", label: "Business name", kind: "text", need: "required" },
    ...ADDRESS.map((f) => (f.key === "street" || f.key === "city" ? { ...f, need: "required" as Need } : f)),
    { key: "telephone", label: "Phone", kind: "text", need: "recommended" },
    { key: "url", label: "Website", kind: "url", need: "recommended" },
    { key: "image", label: "Image addresses", kind: "list", need: "recommended" },
    { key: "priceRange", label: "Price range", kind: "text", need: "recommended" },
    { key: "latitude", label: "Latitude", kind: "number", need: "recommended" },
    { key: "longitude", label: "Longitude", kind: "number", need: "recommended" },
    { key: "hours", label: "Opening hours", kind: "hours", need: "recommended" },
    { key: "sameAs", label: "Profiles", kind: "list", need: "optional" },
  ],
};

const str = (v: SchemaValues[string]) => (typeof v === "string" ? v.trim() : "");
const list = (v: SchemaValues[string]) => (Array.isArray(v) ? (v as unknown[]).filter((x): x is string => typeof x === "string").map((x) => x.trim()).filter(Boolean) : str(v) ? str(v).split(/\s*[\n,]\s*/).filter(Boolean) : []);
const faqs = (v: SchemaValues[string]) => (Array.isArray(v) ? (v as Faq[]).filter((f) => f && typeof f === "object" && str(f.q) && str(f.a)) : []);
const hours = (v: SchemaValues[string]) => (Array.isArray(v) ? (v as Hours[]).filter((h) => h && typeof h === "object" && Array.isArray(h.days) && h.days.length && /^\d{2}:\d{2}$/.test(h.opens) && /^\d{2}:\d{2}$/.test(h.closes)) : []);
const num = (v: SchemaValues[string]) => {
  const n = Number(str(v).replace(/,/g, ""));
  return str(v) && Number.isFinite(n) ? n : null;
};

/** Drop empty strings, empty lists and empty objects, so the JSON-LD only carries what was filled in. */
function prune<T>(value: T): T | undefined {
  if (Array.isArray(value)) {
    const out = value.map(prune).filter((x) => x !== undefined);
    return (out.length ? out : undefined) as T | undefined;
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value).map(([k, v]) => [k, prune(v)] as const).filter(([, v]) => v !== undefined);
    // An object with only its @type left says nothing.
    if (!entries.length || entries.every(([k]) => k === "@type")) return undefined;
    return Object.fromEntries(entries) as T;
  }
  if (value === "" || value === null || value === undefined) return undefined;
  return value;
}

function address(v: SchemaValues) {
  return { "@type": "PostalAddress", streetAddress: str(v.street), addressLocality: str(v.city), addressRegion: str(v.region), postalCode: str(v.postalCode), addressCountry: str(v.country).toUpperCase() };
}

/** The JSON-LD object for a type and its values. */
export function buildSchema(type: SchemaType, v: SchemaValues): Record<string, unknown> {
  const one = (xs: string[]) => (xs.length === 1 ? xs[0] : xs);
  let body: Record<string, unknown>;
  switch (type) {
    case "FAQPage":
      body = { "@type": "FAQPage", mainEntity: faqs(v.faqs).map((f) => ({ "@type": "Question", name: f.q.trim(), acceptedAnswer: { "@type": "Answer", text: f.a.trim() } })) };
      break;
    case "Article":
      body = {
        "@type": SCHEMA_FIELDS.Article[0].options!.includes(str(v.subtype)) ? str(v.subtype) : "Article",
        headline: str(v.headline),
        description: str(v.description),
        url: str(v.url),
        mainEntityOfPage: str(v.url),
        image: one(list(v.image)),
        datePublished: str(v.datePublished),
        dateModified: str(v.dateModified),
        author: { "@type": "Person", name: str(v.authorName), url: str(v.authorUrl) },
        publisher: { "@type": "Organization", name: str(v.publisherName), logo: { "@type": "ImageObject", url: str(v.publisherLogo) } },
      };
      break;
    case "Product": {
      const price = num(v.price);
      const rating = num(v.ratingValue);
      const count = num(v.reviewCount);
      body = {
        "@type": "Product",
        name: str(v.name),
        description: str(v.description),
        image: one(list(v.image)),
        brand: { "@type": "Brand", name: str(v.brand) },
        sku: str(v.sku),
        gtin: str(v.gtin).replace(/\D/g, ""),
        offers: {
          "@type": "Offer",
          url: str(v.url),
          price: price ?? "",
          priceCurrency: str(v.priceCurrency).toUpperCase(),
          availability: str(v.availability) ? `https://schema.org/${str(v.availability)}` : "",
          itemCondition: str(v.condition) ? `https://schema.org/${str(v.condition)}` : "",
          priceValidUntil: str(v.priceValidUntil),
        },
        aggregateRating: rating !== null && count !== null ? { "@type": "AggregateRating", ratingValue: rating, reviewCount: count } : undefined,
      };
      break;
    }
    case "Organization":
      body = {
        "@type": "Organization",
        name: str(v.name),
        legalName: str(v.legalName),
        url: str(v.url),
        logo: str(v.logo),
        description: str(v.description),
        email: str(v.email),
        telephone: str(v.telephone),
        foundingDate: str(v.foundingDate),
        address: address(v),
        sameAs: list(v.sameAs),
      };
      break;
    case "LocalBusiness": {
      const lat = num(v.latitude);
      const lng = num(v.longitude);
      body = {
        "@type": SCHEMA_FIELDS.LocalBusiness[0].options!.includes(str(v.subtype)) ? str(v.subtype) : "LocalBusiness",
        name: str(v.name),
        address: address(v),
        telephone: str(v.telephone),
        url: str(v.url),
        image: one(list(v.image)),
        priceRange: str(v.priceRange),
        geo: lat !== null && lng !== null ? { "@type": "GeoCoordinates", latitude: lat, longitude: lng } : undefined,
        openingHoursSpecification: hours(v.hours).map((h) => ({ "@type": "OpeningHoursSpecification", dayOfWeek: h.days, opens: h.opens, closes: h.closes })),
        sameAs: list(v.sameAs),
      };
      break;
    }
  }
  return { "@context": "https://schema.org", ...(prune(body) ?? { "@type": type }) };
}

export type SchemaIssue = { key: string; label: string; level: "required" | "recommended" | "error"; message: string };

const URL_RE = /^https?:\/\/[^\s/$.?#][^\s]*\.[^\s]+$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:?\d{2})?)?$/;

/** What's missing or wrong: required fields first, then mistakes, then recommended fields. */
export function checkSchema(type: SchemaType, v: SchemaValues): SchemaIssue[] {
  const out: SchemaIssue[] = [];
  for (const f of SCHEMA_FIELDS[type]) {
    const val = v[f.key];
    const empty = f.kind === "faqs" ? !faqs(val).length : f.kind === "hours" ? !hours(val).length : f.kind === "list" ? !list(val).length : !str(val);
    if (empty) {
      if (f.need !== "optional") out.push({ key: f.key, label: f.label, level: f.need, message: f.need === "required" ? `Add ${f.label.toLowerCase()}.` : `Google recommends ${f.label.toLowerCase()}.` });
      continue;
    }
    if (f.kind === "url" && !URL_RE.test(str(val))) out.push({ key: f.key, label: f.label, level: "error", message: `${f.label} needs a full address that starts with https://.` });
    if (f.kind === "list" && /image|sameAs/.test(f.key) && list(val).some((x) => !URL_RE.test(x))) out.push({ key: f.key, label: f.label, level: "error", message: `Each of ${f.label.toLowerCase()} needs a full address that starts with https://.` });
    if (f.kind === "date" && !DATE_RE.test(str(val))) out.push({ key: f.key, label: f.label, level: "error", message: `${f.label} needs a date like 2026-10-21.` });
    if (f.kind === "number" && num(val) === null) out.push({ key: f.key, label: f.label, level: "error", message: `${f.label} needs a number.` });
  }
  if (type === "FAQPage" && Array.isArray(v.faqs) && (v.faqs as Faq[]).some((f) => f && Boolean(str(f.q)) !== Boolean(str(f.a)))) out.push({ key: "faqs", label: "Questions and answers", level: "error", message: "Each question needs an answer, and each answer a question." });
  if (type === "Product") {
    if (str(v.priceCurrency) && !/^[A-Za-z]{3}$/.test(str(v.priceCurrency))) out.push({ key: "priceCurrency", label: "Currency", level: "error", message: "Currency needs a 3-letter code, like USD." });
    if (str(v.gtin) && ![8, 12, 13, 14].includes(str(v.gtin).replace(/\D/g, "").length)) out.push({ key: "gtin", label: "GTIN", level: "error", message: "A GTIN has 8, 12, 13 or 14 digits." });
    const rating = num(v.ratingValue);
    if (rating !== null && (rating < 1 || rating > 5)) out.push({ key: "ratingValue", label: "Average rating", level: "error", message: "The average rating needs to be between 1 and 5." });
    if (Boolean(str(v.ratingValue)) !== Boolean(str(v.reviewCount))) out.push({ key: "reviewCount", label: "Number of reviews", level: "error", message: "A rating needs both the average and the number of reviews." });
    if (num(v.price) === null && !(num(v.ratingValue) !== null && num(v.reviewCount) !== null)) out.push({ key: "price", label: "Price", level: "required", message: "Google needs a price or a rating to show a product result." });
    if (num(v.price) !== null && !str(v.priceCurrency)) out.push({ key: "priceCurrency", label: "Currency", level: "required", message: "A price needs its currency." });
  }
  if (str(v.country) && !/^[A-Za-z]{2}$/.test(str(v.country))) out.push({ key: "country", label: "Country code", level: "error", message: "Use a 2-letter country code, like US." });
  const lat = num(v.latitude);
  const lng = num(v.longitude);
  if (lat !== null && Math.abs(lat) > 90) out.push({ key: "latitude", label: "Latitude", level: "error", message: "Latitude is between -90 and 90." });
  if (lng !== null && Math.abs(lng) > 180) out.push({ key: "longitude", label: "Longitude", level: "error", message: "Longitude is between -180 and 180." });
  if (type === "LocalBusiness" && (lat === null) !== (lng === null)) out.push({ key: lat === null ? "latitude" : "longitude", label: "Location", level: "error", message: "Add both latitude and longitude." });
  const rank = { required: 0, error: 1, recommended: 2 };
  return out.sort((a, b) => rank[a.level] - rank[b.level]);
}

/** The script tag to paste into the page. A "</" inside a value can't close the tag early. */
export function schemaScript(obj: Record<string, unknown>): string {
  return `<script type="application/ld+json">\n${JSON.stringify(obj, null, 2).replace(/<\//g, "<\\/")}\n</script>`;
}
