import type { MetadataRoute } from "next";
import { services } from "@/data/services";
import { toCanonicalUrl } from "@/lib/seo";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const serviceRoutes = services.map((service) => ({
    url: toCanonicalUrl(`/sluzby/${service.slug}`),
    lastModified: now,
    changeFrequency: "weekly" as const,
    priority: 0.8,
  }));

  return [
    {
      url: toCanonicalUrl("/"),
      lastModified: now,
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: toCanonicalUrl("/sluzby"),
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.9,
    },
    {
      url: toCanonicalUrl("/kontakt"),
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.7,
    },
    {
      url: toCanonicalUrl("/galerie"),
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.6,
    },
    ...serviceRoutes,
  ];
}
