// This app's own address for links that leave and come back (sign-in returns). It comes from APP_URL only,
// never from request headers a caller can set. Outside production, without APP_URL, the request's own address works.
export function appUrl(request?: Request): string {
  const env = process.env.APP_URL?.trim().replace(/\/+$/, "");
  if (env) return env;
  if (process.env.NODE_ENV !== "production" && request) return new URL(request.url).origin;
  return "https://app.arrowsterr.com";
}
