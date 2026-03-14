import type { MetadataRoute } from "next";
import { CANONICAL_HOST, toCanonicalUrl } from "@/lib/seo";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
      },
    ],
    host: CANONICAL_HOST,
    sitemap: toCanonicalUrl("/sitemap.xml"),
  };
}
