import "server-only";
import { askJson } from "./claude";
import { readBrand } from "./guideline";
import { FONTS } from "./reportTheme";
import { evidenceText } from "./brandCss";
import { cleanKit, fontNames, KIT_SCHEMA, paletteOf, pickLogo, type BrandKit, type KitPart } from "./brandKit";

/** Brand Kits are learned with Opus: it reads the most evidence and gets the small details right. */
const KIT_MODEL = "claude-opus-5-5";

type Said = Exclude<KitPart, { part: "done" } | { part: "error" }>;

/**
 * Learn a Brand Kit from a website (docs/reports.md, section 31).
 * say() gets each part as soon as it is known: the measured colors and fonts come straight from the site's CSS,
 * then the agent picks the logo and finishes the kit. Every stylesheet the page uses is parsed (src/lib/brandCss.ts),
 * so the agent sees how the site really styles its headings, buttons, links and cards.
 */
export async function learnKit(domain: string, say: (p: Said) => void): Promise<{ kit: BrandKit; why: string }> {
  const b = await readBrand(domain);
  say({ part: "site", domain, title: (b.siteName || b.title).slice(0, 80) });
  const e = b.css;
  // Colors used as backgrounds and text say more about a brand than every hex in the file.
  const colors = paletteOf([...e.bgColors, ...e.textColors, ...b.colors]);
  if (colors.length) say({ part: "colors", colors });
  const fonts = fontNames([...e.faces.map((f) => [f.family, 1] as [string, number]), ...b.families], b.googleFonts);
  if (fonts.length) say({ part: "fonts", fonts });

  const logoList = b.logos.map((u, i) => `${i}: ${u.startsWith("data:") ? `inline SVG from the header (${decodeURIComponent(u).slice(0, 300)}...)` : u}`).join("\n");
  const out = await askJson<Record<string, unknown>>(
    `You are a senior brand designer and front-end engineer. You build a Brand Kit for a company from its homepage and every stylesheet it loads. Reports, emails and pages will use it, so it must match the company's own site down to the details.

Website: ${domain}
Site name: ${b.siteName || "unknown"}
Page title: ${b.title}
Meta description: ${b.description}
Headings: ${b.headings.slice(0, 15).join(" | ")}
Buttons: ${b.ctas.slice(0, 10).join(" | ")}
Page text: ${b.body.slice(0, 2500)}
Emails on the page: ${b.contact.emails.join(", ") || "none"}
Phones on the page: ${b.contact.phones.join(", ") || "none"}

Logo options (index: address):
${logoList || "none found"}

Measured from the site's CSS (${b.files} stylesheets, every rule parsed, CSS variables resolved):
${evidenceText(e)}
- Font families named in the CSS: ${b.families.map(([f, n]) => `${f} (${n})`).join(" | ") || "none"}
- Web fonts loaded: ${b.googleFonts.join(", ") || "none"}

Rules:
- name is the company's short brand name, as people say it. Not the page title.
- logo is the index of the option most likely to be the main logo. ${b.homeLogo ? "Option 0 is the picture in the link to the homepage, so it is the logo." : ""} A file or SVG named or placed as the logo beats a favicon or a social image. Use -1 if none fit.
- logoOnDark is true only if the logo looks white or light (for example a file named logo-white), so it needs a dark background.
- colors.primary is the main brand color, the one on buttons and links. colors.secondary is a second brand color that looks good next to it.
- colors.ink is for headings, colors.text for body copy, colors.muted for small notes. All three must be easy to read on colors.surface (cards) and colors.paper (the page). colors.line is a soft border color.
- Use 6-digit hex colors like #0943b0. Take every color from the evidence above; never invent one.
- fonts must come from this list: ${FONTS.join(", ")}. Pick the closest match to the site's fonts.
- siteFonts are the site's own font names for headings and body text, exactly as the CSS names them (the first family, no fallbacks). Use the fonts list name only when the site uses a system font.
- type gives the desktop h1, h2, h3 and body text: size in px (convert rem at 16px), weight 100 to 900, lineHeight as a ratio (convert px by dividing by the size), tracking in em, upper true when the site sets text-transform: uppercase. Read them from the h1, h2, h3, body and p styles; where a value is missing, choose what fits the rest.
- buttons.primary is the site's main call-to-action button and buttons.secondary its second style (often an outline). bg, text and border are hex, radius in px (999 for a pill), weight 100 to 900, upper for uppercase labels, padY and padX in px. Read them from the button styles.
- link.color and link.underline come from the link style.
- shadow is the box-shadow the site uses on cards, copied as a CSS value, or "none".
- radius is 0 to 28, the corner radius of cards and fields.
- footer is one short contact line, like "hello@company.com · company.com". Use a real email from the page if there is one.
- voice.tone is up to 3 single words for how the brand sounds. voice.sample is one short line in that voice, taken from or close to the page.
- why is one short sentence on what you learned about the brand.`,
    KIT_SCHEMA,
    { model: KIT_MODEL, maxTokens: 4000 },
  );
  // The picture in the link to the homepage is the logo; the agent's pick is used only when there is none.
  const kit = cleanKit({ ...out, logo: b.homeLogo ?? pickLogo(out.logo, b.logos) });
  say({ part: "logo", logo: kit.logo, onDark: kit.logoOnDark });
  return { kit, why: typeof out.why === "string" ? out.why.slice(0, 300) : "" };
}
