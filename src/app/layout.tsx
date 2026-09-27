import type { Metadata } from "next";
import { Hanken_Grotesk, Geist_Mono } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { SITE } from "@/lib/site";
import "./globals.css";

const sans = Hanken_Grotesk({ variable: "--font-sans", subsets: ["latin"] });
const mono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: { default: `Cadence: ${SITE.tagline}`, template: "%s · Cadence" },
  description: SITE.description,
  applicationName: "Cadence",
  keywords: ["LinkedIn posting", "LinkedIn scheduler", "AI LinkedIn posts", "personal brand", "ghostwriting", "Claude", "open source"],
  alternates: { canonical: "/" },
  openGraph: { type: "website", siteName: "Cadence", title: SITE.tagline, description: SITE.description, url: "/" },
  twitter: { card: "summary_large_image", title: `Cadence: ${SITE.tagline}`, description: SITE.description },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-background text-foreground">
        {children}
        <Toaster richColors position="top-center" />
      </body>
    </html>
  );
}
