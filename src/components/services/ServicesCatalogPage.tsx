"use client";

import Link from "next/link";
import {
  Settings2,
  Gauge,
  Zap,
  KeyRound,
  Disc,
  Target,
  Snowflake,
  Paintbrush,
  ArrowRight,
} from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { services } from "@/data/services";
import { Button } from "@/components/ui/button";

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  Settings2,
  Gauge,
  Zap,
  KeyRound,
  Disc,
  Target,
  Snowflake,
  Paintbrush,
};

const labels = {
  cs: {
    title: "Služby a orientační ceník",
    subtitle:
      "Vyber konkrétní sekci. U každé služby najdeš detail prací, orientační ceny a mini galerii.",
    open: "Otevřít detail služby",
    listTitle: "Co umíme v této sekci",
  },
  ua: {
    title: "Послуги та орієнтовні ціни",
    subtitle:
      "Оберіть потрібний розділ. Для кожної послуги є деталі робіт, орієнтовні ціни та міні галерея.",
    open: "Відкрити деталі послуги",
    listTitle: "Що робимо в цьому розділі",
  },
};

export default function ServicesCatalogPage() {
  const { language } = useLanguage();
  const t = labels[language];

  return (
    <section className="py-14 sm:py-20">
      <div className="container mx-auto px-4">
        <div className="mx-auto mb-10 max-w-3xl text-center">
          <h1 className="text-3xl font-bold text-foreground sm:text-4xl">{t.title}</h1>
          <p className="mt-3 text-muted-foreground">{t.subtitle}</p>
        </div>

        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {services.map((service) => {
            const Icon = iconMap[service.iconName] || Settings2;

            return (
              <article
                key={service.id}
                className="rounded-2xl border border-border bg-card p-6 shadow-sm transition-colors hover:border-primary/40"
              >
                <div className="mb-4 flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10">
                    <Icon className="h-5 w-5 text-primary" />
                  </div>
                  <h2 className="text-xl font-semibold text-foreground">{service.title[language]}</h2>
                </div>

                <p className="mb-5 text-sm leading-relaxed text-muted-foreground">
                  {service.shortDesc[language]}
                </p>

                <div className="mb-4 flex flex-wrap gap-1.5">
                  {service.tags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full border border-border bg-secondary px-2.5 py-1 text-xs text-muted-foreground"
                    >
                      {tag}
                    </span>
                  ))}
                </div>

                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-silver">
                  {t.listTitle}
                </p>
                <ul className="mb-5 space-y-1.5">
                  {service.items.map((item) => (
                    <li key={item.id}>
                      <Link
                        href={`/sluzby/${service.slug}#${item.id}`}
                        className="text-sm text-primary transition-colors hover:text-primary/80 hover:underline"
                      >
                        {item.title[language]}
                      </Link>
                    </li>
                  ))}
                </ul>

                <Button asChild className="w-full gap-2">
                  <Link href={`/sluzby/${service.slug}`}>
                    {t.open}
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
