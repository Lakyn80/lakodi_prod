import type { Metadata } from "next";
import { toCanonicalUrl } from "@/lib/seo";

export const metadata: Metadata = {
  alternates: {
    canonical: toCanonicalUrl("/galerie"),
  },
};

export default function GalerieLayout({ children }: { children: React.ReactNode }) {
  return children;
}
