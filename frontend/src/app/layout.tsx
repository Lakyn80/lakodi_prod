import type { Metadata } from "next";
import "./globals.css";
import Providers from "./providers";
import Layout from "@/components/layout/Layout";
import { CANONICAL_HOST, toCanonicalUrl } from "@/lib/seo";

export const metadata: Metadata = {
  metadataBase: new URL(CANONICAL_HOST),
  themeColor: "#000000",
  appleWebApp: {
    capable: true,
    title: "Lakodi",
    statusBarStyle: "default",
  },
  icons: {
    icon: [
      { url: "/favicon.ico", type: "image/x-icon" },
      { url: "/icon-192x192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512x512.png", sizes: "512x512", type: "image/png" },
    ],
    shortcut: "/favicon.ico",
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  title: {
    default: "Lakodi autoservis",
    template: "%s | Lakodi autoservis",
  },
  description:
    "Lakodi autoservis – rychlý a férový autoservis v Praze Uhříněvsi. Diagnostika, opravy, servis a klimatizace.",
  openGraph: {
    title: "Lakodi autoservis",
    description:
      "Rychlý a férový autoservis v Praze Uhříněvsi. Diagnostika, opravy, servis a klimatizace.",
    type: "website",
    url: toCanonicalUrl("/"),
    siteName: "Lakodi autoservis",
    images: [
      {
        url: toCanonicalUrl("/og-image.jpg"),
        width: 1200,
        height: 630,
        alt: "Lakodi autoservis logo",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Lakodi autoservis",
    description:
      "Rychlý a férový autoservis v Praze Uhříněvsi. Diagnostika, opravy, servis a klimatizace.",
    images: [toCanonicalUrl("/twitter-image.jpg")],
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="cs">
      <body className="min-h-screen antialiased">
        <Providers>
          <Layout>{children}</Layout>
        </Providers>
      </body>
    </html>
  );
}

