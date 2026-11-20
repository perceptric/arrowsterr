// A brand a partner made through the partner API (docs/API.md, "Partner API"): created_by_key is set.
// It belongs to one of the partner's customers, who must never see Arrowsterr. So such a brand gets no
// Arrowsterr emails (alerts, weekly summaries, getting-started tips, scheduled reports), and a brand key's
// MCP answers use neutral words (src/lib/mcp/whiteLabel.ts). tests/whiteLabel.test.ts checks both.

export const isPartnerBrand = (b: { created_by_key?: string | null } | null | undefined) => Boolean(b?.created_by_key);
