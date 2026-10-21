import type { Metadata } from "next";
import { WpConnected } from "@/components/WpConnected";

export const metadata: Metadata = { title: "Connect WordPress · Arrowsterr", robots: { index: false, follow: false } };

// Where WordPress sends people back after they approve Arrowsterr (wpAuthorize.ts). The page hands the answer to
// the Arrowsterr window that opened it and closes.
export default function WordPressConnectedPage() {
  return <WpConnected />;
}
