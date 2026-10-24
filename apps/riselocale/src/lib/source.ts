// Picks the rank data source from the server's settings.

import { dataForSeo } from "./dataforseo.ts";
import { demoProvider } from "./demo.ts";
import type { Provider } from "./provider.ts";

export const isDemo = () => process.env.RL_DATA?.trim() === "demo";
const dfsReady = () => Boolean(process.env.DFS_LOGIN?.trim() && process.env.DFS_PASSWORD?.trim());

/** The provider, or null when none is set up (the app then says what to add). */
export function provider(): Provider | null {
  if (isDemo()) return demoProvider();
  if (!dfsReady()) return null;
  return dataForSeo({
    login: process.env.DFS_LOGIN!.trim(),
    password: process.env.DFS_PASSWORD!.trim(),
    api: process.env.DFS_API_URL?.trim(),
    language: process.env.RL_LANGUAGE?.trim() || "en",
    locationCode: Number(process.env.RL_LOCATION_CODE) || 2840,
  });
}

export const NO_SOURCE = "Rank data isn't set up. Add DFS_LOGIN and DFS_PASSWORD, or set RL_DATA=demo to try the app.";
