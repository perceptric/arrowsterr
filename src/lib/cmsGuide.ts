// Click-by-click steps for connecting each CMS, shown in Zippie's connect wizard.
// open() builds a link straight to the right admin screen once the person has typed their site address.
import type { CmsKind } from "./cmsTypes";

const site = (v: string | undefined) => {
  const s = (v ?? "").trim().replace(/\/+$/, "");
  if (!s) return "";
  return /^https?:\/\//.test(s) ? s : `https://${s}`;
};

export type CmsGuide = { blurb: string; steps: string[]; open: (form: Record<string, string>) => { label: string; href: string } | null };

export const CMS_GUIDE: Record<CmsKind, CmsGuide> = {
  wordpress: {
    blurb: "Zippie needs an application password. It only works through the WordPress API and you can delete it any time.",
    steps: [
      "Type your site address below, then click Open WordPress.",
      "Scroll to Application Passwords at the bottom of your profile.",
      "Type Arrowsterr as the name and click Add New Application Password.",
      "Copy the password WordPress shows and paste it below, with your WordPress username.",
    ],
    open: (f) => (site(f.siteUrl) ? { label: "Open WordPress", href: `${site(f.siteUrl)}/wp-admin/profile.php#application-passwords-section` } : null),
  },
  framer: {
    blurb: "Arrowsterr needs an API key for your Framer project. It only works with this project and you can delete it any time.",
    steps: [
      "Click Open Framer and open your website project.",
      "Copy the project's link from your browser's address bar and paste it below.",
      "Open Site Settings, then General, then API Keys. Create a key named Arrowsterr and paste it below.",
      "Type the name of your blog collection, or leave it empty to use the one that looks like a blog.",
    ],
    open: () => ({ label: "Open Framer", href: "https://framer.com/projects" }),
  },
  webflow: {
    blurb: "Zippie needs a site API token with CMS access.",
    steps: [
      "Click Open Webflow and pick your site.",
      "Open Site settings, then Apps & integrations, then API access.",
      "Generate a token with CMS read and write, then paste it below.",
      "Open your blog collection's settings and copy its collection ID.",
    ],
    open: () => ({ label: "Open Webflow", href: "https://webflow.com/dashboard" }),
  },
  shopify: {
    blurb: "Zippie needs an Admin API token from a custom app with write_content access.",
    steps: [
      "Type your store address below, then click Open Shopify.",
      "Click Create an app, name it Arrowsterr, and give it the write_content scope.",
      "Install the app and copy the Admin API access token. Paste it below.",
      "Open your blog in the Shopify admin. The number at the end of its address is the blog ID.",
    ],
    open: (f) => {
      const shop = (f.shop ?? "").trim().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
      return shop ? { label: "Open Shopify", href: `https://${shop}/admin/settings/apps/development` } : null;
    },
  },
  hubspot: {
    blurb: "Zippie needs a private app token with the content scope.",
    steps: [
      "Click Open HubSpot and sign in.",
      "Open Settings, then Integrations, then Private apps, and click Create a private app.",
      "Name it Arrowsterr, tick the content scope, create it and copy the token. Paste it below.",
      "Open your blog's settings. The number in its address is the blog ID.",
    ],
    open: () => ({ label: "Open HubSpot", href: "https://app.hubspot.com" }),
  },
  ghost: {
    blurb: "Zippie needs the Admin API key from a custom integration.",
    steps: [
      "Type your Ghost address below, then click Open Ghost.",
      "Click Add custom integration and name it Arrowsterr.",
      "Copy the Admin API key and the API URL, and paste them below.",
    ],
    open: (f) => (site(f.siteUrl) ? { label: "Open Ghost", href: `${site(f.siteUrl)}/ghost/#/settings/integrations` } : null),
  },
  wix: {
    blurb: "Arrowsterr needs an API key from your Wix account and your site's ID.",
    steps: [
      "Click Open Wix and open API Keys in your account settings.",
      "Create a key named Arrowsterr with the Wix Blog and Members permissions, and paste it below.",
      "Open your site's dashboard. The site ID is the long code after /dashboard/ in the address. Paste it below.",
    ],
    open: () => ({ label: "Open Wix", href: "https://manage.wix.com/account/api-keys" }),
  },
  webhook: {
    blurb: "Arrowsterr sends each article to your site's address as JSON: title, slug, description, image, HTML and schema.",
    steps: [
      "Paste the address your site takes articles at. It must start with https.",
      "Add a secret if your site checks the X-Arrowsterr-Signature header.",
      "Your site can answer with an id and url, so updates change the same post.",
    ],
    open: () => null,
  },
};
