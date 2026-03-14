import type { Metadata } from "next";
import { toCanonicalUrl } from "@/lib/seo";

export const metadata: Metadata = {
  alternates: {
    canonical: toCanonicalUrl("/kontakt"),
  },
};

export default function KontaktLayout({ children }: { children: React.ReactNode }) {
  return children;
}
