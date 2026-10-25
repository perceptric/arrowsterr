// The tags and links agent HTML may keep before the writer shows it (DocsEditor.tsx).
// DOMPurify does the cleaning; this file holds its rules, so tests can check them without a browser.
import type { Config, DOMPurify, UponSanitizeAttributeHook } from "dompurify";

export const ALLOWED_TAGS = ["p", "h3", "h4", "ul", "ol", "li", "strong", "em", "b", "i", "a", "blockquote", "table", "thead", "tbody", "tr", "th", "td", "br"];

/** Only http and https links. Anything else (javascript:, data:, relative) loses its href. */
export const SAFE_HREF = /^https?:\/\//i;

export const PURIFY_CONFIG: Config = {
  ALLOWED_TAGS,
  ALLOWED_ATTR: ["href"],
  ALLOWED_URI_REGEXP: SAFE_HREF,
  ALLOW_DATA_ATTR: false,
  ALLOW_ARIA_ATTR: false,
  ALLOW_UNKNOWN_PROTOCOLS: false,
  // A tag that isn't allowed is dropped but its text stays, and that text is cleaned too.
  KEEP_CONTENT: true,
  RETURN_TRUSTED_TYPE: false,
};

/** href stays only on links, and only for http and https. */
export const keepHref: UponSanitizeAttributeHook = (node, data) => {
  if (data.attrName !== "href") return;
  if (node.nodeName !== "A" || !SAFE_HREF.test(data.attrValue)) data.keepAttr = false;
};

/** Clean agent HTML with a DOMPurify instance made for this window. */
export function cleanWith(purify: Pick<DOMPurify, "sanitize" | "addHook" | "removeHook">, html: string): string {
  purify.addHook("uponSanitizeAttribute", keepHref);
  try {
    return String(purify.sanitize(html, PURIFY_CONFIG));
  } finally {
    purify.removeHook("uponSanitizeAttribute", keepHref);
  }
}
