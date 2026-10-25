// Which addresses the site audit may crawl. Pure, so the tests can cover it.

const bare = (host: string) => host.toLowerCase().replace(/\.$/, "").replace(/^www\./, "");

/** True for an http(s) address on the audited domain or its www twin. Other hosts, subdomains included, are never crawled. */
export function onSite(url: string, domain: string): boolean {
  try {
    const u = new URL(url);
    return /^https?:$/.test(u.protocol) && !u.username && !u.password && bare(u.hostname) === bare(domain);
  } catch {
    return false;
  }
}
