"use client";

import Image from "next/image";
import Link from "next/link";
import { ChevronLeft, ImagePlus, MessageCircle } from "lucide-react";
import { CONTACT } from "@/data/contact";
import { Service } from "@/data/services";
import { useLanguage } from "@/contexts/LanguageContext";
import { Button } from "@/components/ui/button";

const labels = {
  cs: {
    back: "Zpět na všechny služby",
    overview: "Přehled prací v této sekci",
    price: "Orientační cena",
    gallery: "Mini galerie",
    addPhotos:
      "Vlastní fotky přidáš do frontend/public/services/<sekce>/ a jejich cesty doplníš do pole gallery v frontend/src/data/services.ts.",
    askWhatsApp: "Zeptat se na WhatsApp",
  },
  ua: {
    back: "Назад до всіх послуг",
    overview: "Перелік робіт у цьому розділі",
    price: "Орієнтовна ціна",
    gallery: "Міні галерея",
    addPhotos:
      "Власні фото додай у frontend/public/services/<секція>/ та впиши шляхи у поле gallery у файлі frontend/src/data/services.ts.",
    askWhatsApp: "Запитати у WhatsApp",
  },
};

export default function ServiceDetailPage({ service }: { service: Service }) {
  const { language } = useLanguage();
  const t = labels[language];

  return (
    <section className="py-14 sm:py-20">
      <div className="container mx-auto px-4">
        <Link
          href="/sluzby"
          className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-primary"
        >
          <ChevronLeft className="h-4 w-4" />
          {t.back}
        </Link>

        <div className="mb-8 rounded-2xl border border-border bg-card p-6 sm:p-8">
          <h1 className="text-3xl font-bold text-foreground sm:text-4xl">{service.title[language]}</h1>
          <p className="mt-4 max-w-3xl leading-relaxed text-muted-foreground">{service.intro[language]}</p>
          <p className="mt-3 text-sm text-silver">{service.pricingNote[language]}</p>
          <div className="mt-5 flex flex-wrap gap-2">
            {service.items.map((item) => (
              <a
                key={item.id}
                href={`#${item.id}`}
                className="rounded-full border border-border bg-secondary px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
              >
                {item.title[language]}
              </a>
            ))}
          </div>
        </div>

        <div className="mb-6">
          <h2 className="text-lg font-semibold text-foreground">{t.overview}</h2>
        </div>

        <div className="space-y-6">
          {service.items.map((item) => (
            <article
              id={item.id}
              key={item.id}
              className="scroll-mt-24 rounded-2xl border border-border bg-card p-6 sm:p-8"
            >
              <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                <h3 className="text-2xl font-semibold text-foreground">{item.title[language]}</h3>
                <div className="rounded-xl border border-primary/30 bg-primary/10 px-3 py-2">
                  <p className="text-[11px] uppercase tracking-wide text-primary/80">{t.price}</p>
                  <p className="text-sm font-semibold text-primary">{item.priceRange[language]}</p>
                </div>
              </div>

              <ul className="mb-6 list-disc space-y-2 pl-5 text-muted-foreground">
                {item.description[language].map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>

              <div className="mb-3 flex items-center gap-2">
                <ImagePlus className="h-4 w-4 text-primary" />
                <p className="text-sm font-semibold text-foreground">{t.gallery}</p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {item.gallery.map((src, index) => (
                  <div
                    key={`${item.id}-${src}-${index}`}
                    className="relative aspect-[4/3] overflow-hidden rounded-xl border border-border bg-secondary"
                  >
                    <Image
                      src={src}
                      alt={`${service.title[language]} - ${item.title[language]} (${index + 1})`}
                      fill
                      sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                      className="object-cover"
                    />
                  </div>
                ))}
              </div>

              <p className="mt-3 text-xs text-muted-foreground">{t.addPhotos}</p>

              <div className="mt-5">
                <a
                  href={CONTACT.getWhatsAppUrl(`${service.title[language]} - ${item.title[language]}`)}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Button variant="outline" className="gap-2">
                    <MessageCircle className="h-4 w-4" />
                    {t.askWhatsApp}
                  </Button>
                </a>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
