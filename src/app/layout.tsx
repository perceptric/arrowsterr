import type { Metadata } from "next";
import { DM_Mono, Funnel_Display, Geist, Geist_Mono, IBM_Plex_Mono, Inter } from "next/font/google";
import { WebVitals } from "@/components/WebVitals";
import "./globals.css";

// The Arro game's pixel-style text.
const plex = IBM_Plex_Mono({
  variable: "--font-plex",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

// The product UI, in the style of Twenty: Inter at 13px.
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

// Code, API names and variables, as in Twenty.
const dmMono = DM_Mono({
  variable: "--font-dm-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

// Long-form pages that still use Geist.
const geist = Geist({
  variable: "--font-geist",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
});

// Headings 18px and up (brand v5).
const display = Funnel_Display({
  variable: "--font-funnel",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

// Numbers, prompts and URLs inside product screens.
const mono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});


export const metadata: Metadata = {
  title: "Arrowsterr",
  description: "See how AI engines talk about your brand.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${plex.variable} ${inter.variable} ${geist.variable} ${display.variable} ${mono.variable} ${dmMono.variable} h-full`}
    >
      <body className="min-h-full">
        <WebVitals />
        <div className="aw flex min-h-screen flex-col">{children}</div>
      </body>
    </html>
  );
}
