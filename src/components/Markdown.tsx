// Shows an AI answer the way the model wrote it: headings, lists, tables, bold and links.
// Builds React elements only, so nothing in the answer runs as HTML.
import type { ReactNode } from "react";

const CITE = /\[((?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)+)\]\((https?:\/\/[^)\s]+)\)/gi;

/** A run of cited sites as one small tag: "eve.legal +2". It links to the first site; the rest are in its tooltip. */
function Cite({ run }: { run: string }) {
  const links = [...run.matchAll(CITE)].map((m) => ({ site: m[1].replace(/^www\./i, "").toLowerCase(), url: m[2] }));
  const [first, ...rest] = links;
  return (
    <a className="aw-cite" href={first.url} target="_blank" rel="noopener noreferrer nofollow" title={links.map((l) => l.site).join(", ")}>
      {first.site}
      {rest.length ? <span className="aw-cite__more">+{rest.length}</span> : null}
    </a>
  );
}

/** Bold, italic, links and cited sites inside one line. */
function inline(text: string, key: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /((?:\s*\[(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)+\]\(https?:\/\/[^)\s]+\))+)|\*\*([^*]+)\*\*|\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)|\*([^*]+)\*|`([^`]+)`/gi;
  let last = 0;
  let i = 0;
  for (const m of text.matchAll(re)) {
    if (m.index! > last) out.push(text.slice(last, m.index));
    const k = `${key}-${i++}`;
    if (m[1]) out.push(" ", <Cite key={k} run={m[1]} />);
    else if (m[2]) out.push(<strong key={k}>{inline(m[2], k)}</strong>);
    else if (m[3])
      out.push(
        <a key={k} href={m[4]} target="_blank" rel="noopener noreferrer nofollow">
          {m[3]}
        </a>,
      );
    else if (m[6]) out.push(<code key={k} className="aw-md-inline">{m[6]}</code>);
    else out.push(<em key={k}>{m[5]}</em>);
    last = m.index! + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

const cells = (line: string) =>
  line
    .trim()
    .replace(/^\||\|$/g, "")
    .split("|")
    .map((c) => c.trim());

export function Markdown({ text }: { text: string }) {
  const lines = text.replace(/\r/g, "").split("\n");
  const blocks: ReactNode[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const k = `b${i}`;
    if (!line.trim()) {
      i++;
      continue;
    }
    if (/^\s*```/.test(line)) {
      const code: string[] = [];
      i++;
      while (i < lines.length && !/^\s*```/.test(lines[i])) code.push(lines[i++]);
      i++;
      blocks.push(
        <pre key={k} className="aw-md-code">
          <code>{code.join("\n")}</code>
        </pre>,
      );
      continue;
    }
    if (/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      blocks.push(<hr key={k} className="border-0 border-t border-rule-faint" />);
      i++;
      continue;
    }
    if (/^\s*!\[[^\]]*\]\([^)]*\)\s*$/.test(line)) {
      i++;
      continue;
    }
    const h = line.match(/^(#{1,6})\s+(.*)/);
    if (h) {
      blocks.push(
        <p key={k} className={`font-medium text-ink ${h[1].length <= 2 ? "text-[16px]" : "text-[15px]"}`}>
          {inline(h[2], k)}
        </p>,
      );
      i++;
      continue;
    }
    if (/^\s*\|/.test(line)) {
      const rows: string[][] = [];
      while (i < lines.length && /^\s*\|/.test(lines[i])) {
        if (!/^\s*\|?\s*:?-{2,}/.test(lines[i])) rows.push(cells(lines[i]));
        i++;
      }
      const [head, ...body] = rows;
      blocks.push(
        <div key={k} className="overflow-x-auto">
          <table className="aw-table aw-table--compact aw-table--tight">
            <thead>
              <tr>
                {head.map((c, j) => (
                  <th key={j}>{inline(c, `${k}h${j}`)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {body.map((r, ri) => (
                <tr key={ri}>
                  {r.map((c, j) => (
                    <td key={j}>{inline(c, `${k}r${ri}c${j}`)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }
    if (/^\s*(?:[-*•]|\d+[.)])\s+/.test(line)) {
      const ordered = /^\s*\d/.test(line);
      const items: string[] = [];
      while (i < lines.length && /^\s*(?:[-*•]|\d+[.)])\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*(?:[-*•]|\d+[.)])\s+/, ""));
      const List = ordered ? "ol" : "ul";
      blocks.push(
        <List key={k} className={`flex flex-col gap-1 pl-5 ${ordered ? "list-decimal" : "list-disc"}`}>
          {items.map((it, j) => (
            <li key={j}>{inline(it, `${k}i${j}`)}</li>
          ))}
        </List>,
      );
      continue;
    }
    blocks.push(<p key={k}>{inline(line.replace(/^>\s?/, ""), k)}</p>);
    i++;
  }
  return <div className="flex flex-col gap-3 text-[14px] leading-relaxed text-body">{blocks}</div>;
}
