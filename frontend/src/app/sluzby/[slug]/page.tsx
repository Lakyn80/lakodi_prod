import type { Metadata } from "next";
import { notFound } from "next/navigation";
import ServiceDetailPage from "@/components/services/ServiceDetailPage";
import { getServiceBySlug, services } from "@/data/services";
import { toCanonicalUrl } from "@/lib/seo";

type DetailPageProps = {
  params: Promise<{ slug: string }>;
};

export function generateStaticParams() {
  return services.map((service) => ({ slug: service.slug }));
}

export async function generateMetadata({ params }: DetailPageProps): Promise<Metadata> {
  const { slug } = await params;
  const service = getServiceBySlug(slug);

  if (!service) {
    notFound();
  }

  return {
    title: service.title.cs,
    description: service.shortDesc.cs,
    alternates: {
      canonical: toCanonicalUrl(`/sluzby/${service.slug}`),
    },
  };
}

export default async function ServiceDetailRoute({ params }: DetailPageProps) {
  const { slug } = await params;
  const service = getServiceBySlug(slug);

  if (!service) {
    notFound();
  }

  return <ServiceDetailPage service={service} />;
}
