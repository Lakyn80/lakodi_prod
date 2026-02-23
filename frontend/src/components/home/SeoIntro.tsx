"use client";

import { useLanguage } from "@/contexts/LanguageContext";
import { translations } from "@/data/translations";

export default function SeoIntro() {
  const { language } = useLanguage();
  const t = translations[language];

  return (
    <section className="relative overflow-hidden py-16 sm:py-20">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(14,116,144,0.14),transparent_60%)]"
      />
      <div className="container mx-auto px-4">
        <div className="relative mx-auto max-w-5xl rounded-3xl border border-border/80 bg-gradient-to-br from-card to-card/85 p-8 shadow-[0_24px_70px_-36px_rgba(0,0,0,0.55)] sm:p-12">
          <p className="text-center text-xs font-semibold uppercase tracking-[0.22em] text-primary sm:text-sm">
            {t.homeSeo.badge}
          </p>
          <h2 className="mt-3 text-center text-3xl font-extrabold leading-tight text-foreground sm:text-4xl lg:text-5xl">
            {t.homeSeo.title}
          </h2>
          <div className="mx-auto mt-6 h-px w-full max-w-3xl bg-border/70" />
          <p className="mx-auto mt-6 max-w-4xl text-center leading-8 text-muted-foreground sm:text-lg">
            {t.homeSeo.description}
          </p>
        </div>
      </div>
    </section>
  );
}

