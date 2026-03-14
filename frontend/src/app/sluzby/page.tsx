import type { Metadata } from "next";
import ServicesCatalogPage from "@/components/services/ServicesCatalogPage";
import { toCanonicalUrl } from "@/lib/seo";

export const metadata: Metadata = {
  title: "Služby",
  description:
    "Přehled autoservisních služeb Lakodi: převodovky, motory, diagnostika, podvozky, geometrie, klimatizace a karosářské práce.",
  alternates: {
    canonical: toCanonicalUrl("/sluzby"),
  },
};

export default function ServicesPage() {
  return <ServicesCatalogPage />;
}
