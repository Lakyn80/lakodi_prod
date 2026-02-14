import type { Metadata } from "next";
import "./globals.css";
import Providers from "./providers";
import Layout from "@/components/layout/Layout";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:8080";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Lakodi autoslužby",
    template: "%s | Lakodi autoslužby",
  },
  description:
    "Lakodi autoslužby – rychlý a férový autoservis v Praze Uhříněvsi. Diagnostika, opravy, servis a klimatizace.",
  openGraph: {
    title: "Lakodi autoslužby",
    description:
      "Rychlý a férový autoservis v Praze Uhříněvsi. Diagnostika, opravy, servis a klimatizace.",
    type: "website",
  },
  alternates: {
    canonical: "/",
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
