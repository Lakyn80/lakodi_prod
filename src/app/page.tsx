import Hero from "@/components/home/Hero";
import ServicesGrid from "@/components/home/ServicesGrid";
import HowItWorks from "@/components/home/HowItWorks";
import Gallery from "@/components/home/Gallery";
import BookingForm from "@/components/home/BookingForm";
import ContactTeaser from "@/components/home/ContactTeaser";
import { CONTACT } from "@/data/contact";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:8080";

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "AutoRepair",
  name: "Lakodi autoslužby",
  url: siteUrl,
  telephone: CONTACT.phoneRaw,
  address: {
    "@type": "PostalAddress",
    addressLocality: CONTACT.address.cs,
    addressCountry: "CZ",
  },
  openingHours: "Mo-Fr 08:00-17:00",
  sameAs: [CONTACT.mapUrl],
};

export default function HomePage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <Hero />
      <ServicesGrid />
      <HowItWorks />
      <Gallery />
      <BookingForm />
      <ContactTeaser />
    </>
  );
}
