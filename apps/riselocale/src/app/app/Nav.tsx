"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/app", label: "Scans", exact: true },
  { href: "/app/businesses", label: "Businesses" },
  { href: "/app/alerts", label: "Alerts" },
  { href: "/app/settings", label: "Settings" },
];

export default function Nav({ unread }: { unread: number }) {
  const path = usePathname();
  return (
    <nav className="nav" aria-label="Main">
      {ITEMS.map((i) => {
        const on = i.exact ? path === i.href || path.startsWith("/app/scans") : path.startsWith(i.href);
        return (
          <Link key={i.href} href={i.href} aria-current={on ? "page" : undefined}>
            {i.label}
            {i.label === "Alerts" && unread > 0 && <span className="rl-tag rl-tag--brand count">{unread}</span>}
          </Link>
        );
      })}
    </nav>
  );
}
