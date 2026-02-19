"use client";

import Link from "next/link";
import Image from "next/image";
import { useLanguage } from "@/contexts/LanguageContext";
import { translations } from "@/data/translations";
import { Button } from "@/components/ui/button";

const galleryItems = [
  { src: "/services/prevodovky/repas-automat-01.webp", categoryIndex: 0 },
  { src: "/services/motory/go-motoru-01.webp", categoryIndex: 1 },
  { src: "/services/motory/go-motoru-02.webp", categoryIndex: 2 },
  { src: "/services/karoserie-lakovani/renovace-mercedes-01.webp", categoryIndex: 3 },
  { src: "/services/motory/go-motoru-03.webp", categoryIndex: 4 },
  { src: "/services/karoserie-lakovani/renovace-mercedes-02.webp", categoryIndex: 5 },
  { src: "/services/prevodovky/repas-automat-02.webp", categoryIndex: 0 },
  { src: "/services/motory/go-motoru-04.webp", categoryIndex: 1 },
  { src: "/services/motory/go-motoru-05.webp", categoryIndex: 2 },
  { src: "/services/karoserie-lakovani/renovace-mercedes-03.webp", categoryIndex: 3 },
  { src: "/services/motory/go-motoru-06.webp", categoryIndex: 4 },
  { src: "/services/karoserie-lakovani/renovace-mercedes-04.webp", categoryIndex: 5 },
];

export default function Gallery() {
  const { language } = useLanguage();
  const t = translations[language];

  return (
    <section className="py-20">
      <div className="container mx-auto px-4">
        <div className="mb-8 text-center">
          <h2 className="text-3xl font-bold text-foreground sm:text-4xl">{t.gallery.title}</h2>
        </div>

        {/* Category Chips */}
        <div className="mb-8 flex flex-wrap justify-center gap-2">
          {t.gallery.categories.map((cat) => (
            <button
              key={cat}
              className="rounded-full border border-border bg-card px-4 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary"
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Gallery Grid */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {galleryItems.map((item, i) => (
            <div
              key={`${item.src}-${i}`}
              className="group relative aspect-[4/3] overflow-hidden rounded-xl border border-border bg-card transition-all hover:border-primary/30"
            >
              <Image
                src={item.src}
                alt={`${t.gallery.categories[item.categoryIndex]} - Lakodi autoservis`}
                fill
                sizes="(max-width: 640px) 100vw, (max-width: 1280px) 50vw, 25vw"
                className="object-cover transition-transform duration-500 group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />
              <div className="absolute inset-0 flex items-end p-4">
                <span className="rounded-full bg-background/60 px-3 py-1 text-xs font-medium text-foreground backdrop-blur-sm">
                  {t.gallery.categories[item.categoryIndex]}
                </span>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-8 text-center">
          <Button
            asChild
            variant="outline"
            size="lg"
            className="border-primary/50 text-primary hover:bg-primary/10"
          >
            <Link href="/sluzby">{t.gallery.showMore}</Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
