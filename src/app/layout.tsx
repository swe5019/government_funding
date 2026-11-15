import { Analytics } from "@vercel/analytics/next";
import type { Metadata } from "next";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { siteConfig } from "@/config/site";
import "./globals.css";

const description =
  "Government contracts and grants to public companies, by stock ticker: see which stocks receive federal money, from which agencies and programs, straight from USAspending.gov records.";

export const metadata: Metadata = {
  metadataBase: new URL(siteConfig.url),
  title: { default: `${siteConfig.name}: government contracts and grants to public companies`, template: `%s · ${siteConfig.name}` },
  description,
  applicationName: siteConfig.name,
  openGraph: { type: "website", siteName: siteConfig.name, title: siteConfig.name, description, url: "/" },
  twitter: { card: "summary_large_image", title: siteConfig.name, description },
  // Search Console / Bing Webmaster ownership checks (HTML-tag method); set in Vercel when verifying.
  verification: {
    ...(process.env.GOOGLE_SITE_VERIFICATION ? { google: process.env.GOOGLE_SITE_VERIFICATION } : {}),
    ...(process.env.BING_SITE_VERIFICATION ? { other: { "msvalidate.01": process.env.BING_SITE_VERIFICATION } } : {}),
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="flex min-h-full flex-col font-sans">
        <SiteHeader />
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">{children}</main>
        <SiteFooter />
        <Analytics />
      </body>
    </html>
  );
}
