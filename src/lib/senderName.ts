// The sender name on a white-label email. It always says it came through Arrowsterr, so a kit's name
// can't pass for someone else's own mail. No server imports, so tests can use it.
export function senderName(maker: string | null | undefined): string {
  const name = (maker ?? "").replace(/[<>"\r\n]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 60);
  if (!name || name.toLowerCase() === "arrowsterr") return "Arrowsterr";
  return / via Arrowsterr$/i.test(name) ? name : `${name} via Arrowsterr`;
}
