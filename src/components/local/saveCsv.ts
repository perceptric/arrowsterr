import { csv } from "@/lib/localReport";

/** Save rows as a CSV file in the browser. Cells that start like a formula are kept as text. */
export function saveCsv(name: string, head: string[], rows: (string | number | null | undefined)[][]) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv(head, rows)], { type: "text/csv;charset=utf-8" }));
  a.download = name.replace(/[^\w.-]+/g, "-").toLowerCase();
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
