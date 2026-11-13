// A brief item's shape, and a document saved as a Word file. Pure, shared by the browser and tests.
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** A Word file that opens editable in Word and Google Docs. */
export function wordFile(title: string, html: string) {
  return `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>body{font-family:Arial,sans-serif;font-size:11pt;line-height:1.5}h1{font-size:20pt}h2{font-size:15pt;margin-top:18pt}h3{font-size:12.5pt}h4{font-size:11pt}table{border-collapse:collapse;width:100%}td,th{border:1px solid #bbb;padding:6pt;vertical-align:top;text-align:left}th{background:#f1f3f6}</style></head><body>${html}</body></html>`;
}
