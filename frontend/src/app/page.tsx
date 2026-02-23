import type { Metadata } from "next";
import Hero from "@/components/home/Hero";
import SeoIntro from "@/components/home/SeoIntro";
import ServicesGrid from "@/components/home/ServicesGrid";
import HowItWorks from "@/components/home/HowItWorks";
import Gallery from "@/components/home/Gallery";
import ContactTeaser from "@/components/home/ContactTeaser";
import { toCanonicalUrl } from "@/lib/seo";

export const metadata: Metadata = {
  title: "Autoservis, geometrie kol a pneuservis Praha 22 – Uhříněves | Lakodi",
  description:
    "Lakodi – autoservis, geometrie kol a pneuservis v Praze 22 Uhříněves. Diagnostika, opravy motorů, převodovky, klimatizace, přezouvání pneumatik. K Netlukám 93, 104 00 Praha 22.",
  alternates: {
    canonical: toCanonicalUrl("/"),
  },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "AutoRepair",
  name: "Lakodi Autoservis",
  address: {
    "@type": "PostalAddress",
    streetAddress: "K Netlukám 93",
    addressLocality: "Praha 22 – Uhříněves",
    postalCode: "104 00",
    addressCountry: "CZ",
  },
  url: "https://lakodi.cz",
  areaServed: "Praha 22 – Uhříněves",
  makesOffer: [
    { "@type": "Service", name: "Autoservis" },
    { "@type": "Service", name: "Geometrie kol" },
    { "@type": "Service", name: "Pneuservis" },
  ],
};

export default function HomePage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <Hero />
      <SeoIntro />
      <ServicesGrid />
      <HowItWorks />
      <Gallery />
      <ContactTeaser />
    </>
  );
}

