import type { Metadata } from "next";
import "leaflet/dist/leaflet.css";
import "./brand.css";
import "./app.css";
import { isDemo } from "@/lib/source";

export const metadata: Metadata = {
  title: "RiseLocale",
  description: "Local rank tracking on Google Maps, the Local Pack and organic results.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {isDemo() && <div className="demo-bar">Demo data. Ranks on this server are made up for trying the app.</div>}
        {children}
      </body>
    </html>
  );
}
