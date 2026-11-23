import type { Metadata } from "next";
import { Funnel_Display, Geist_Mono, Inter } from "next/font/google";
import "./globals.css";
import { DialogHost } from "@/components/Dialogs";

// Every word in the app.
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
});

// Headings in the PDF reports (src/lib/pdf/design.ts).
const display = Funnel_Display({
  variable: "--font-funnel",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

// Code, ids and URLs.
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
      className={`${inter.variable} ${display.variable} ${mono.variable} h-full`}
    >
      <body className="min-h-full">
        <div className="aw flex min-h-screen flex-col">
          {children}
          <DialogHost />
        </div>
      </body>
    </html>
  );
}
