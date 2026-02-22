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
  MessageCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/contexts/LanguageContext";
import { useChatbot } from "@/contexts/ChatbotContext";
import { translations } from "@/data/translations";
import { services } from "@/data/services";
import { CONTACT } from "@/data/contact";

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

const tagTranslations: Record<string, { ua: string; ru: string; en: string }> = {
  GO: { ua: "Капремонт", ru: "Капремонт", en: "Overhaul" },
  Repas: { ua: "Реставрація", ru: "Реставрация", en: "Rebuild" },
  Automat: { ua: "Автомат", ru: "Автомат", en: "Automatic" },
  Manuál: { ua: "Механіка", ru: "Механика", en: "Manual" },
  Benzín: { ua: "Бензин", ru: "Бензин", en: "Petrol" },
  Diesel: { ua: "Дизель", ru: "Дизель", en: "Diesel" },
  Diagnostika: { ua: "Діагностика", ru: "Диагностика", en: "Diagnostics" },
  Elektrika: { ua: "Електрика", ru: "Электрика", en: "Electrical" },
  Online: { ua: "Онлайн", ru: "Онлайн", en: "Online" },
  Klíče: { ua: "Ключі", ru: "Ключи", en: "Keys" },
  "Řídicí jednotky": { ua: "Блоки керування", ru: "Блоки управления", en: "Control units" },
  Opravy: { ua: "Ремонт", ru: "Ремонт", en: "Repairs" },
  Tlumiče: { ua: "Амортизатори", ru: "Амортизаторы", en: "Shocks" },
  Ramena: { ua: "Важелі", ru: "Рычаги", en: "Control arms" },
  "3D": { ua: "3D", ru: "3D", en: "3D" },
  Geometrie: { ua: "Геометрія", ru: "Геометрия", en: "Alignment" },
  Plnění: { ua: "Заправка", ru: "Заправка", en: "Refill" },
  Servis: { ua: "Сервіс", ru: "Сервис", en: "Service" },
  Karoserie: { ua: "Кузов", ru: "Кузов", en: "Bodywork" },
  Lakování: { ua: "Фарбування", ru: "Покраска", en: "Painting" },
  Leštění: { ua: "Полірування", ru: "Полировка", en: "Polishing" },
  Veterán: { ua: "Ретро-авто", ru: "Ретро-авто", en: "Classic car" },
  Renovace: { ua: "Реставрація", ru: "Реставрация", en: "Restoration" },
};

export default function ServicesGrid() {
  const { language } = useLanguage();
  const { openChatbot } = useChatbot();
  const t = translations[language];
  const contentLanguage = language;
  const translateTag = (tag: string) =>
    language === "cs" ? tag : (tagTranslations[tag]?.[language] ?? tag);

  return (
    <section className="py-20">
      <div className="container mx-auto px-4">
        <div className="mb-12 text-center">
          <h2 className="text-3xl font-bold text-foreground sm:text-4xl">{t.services.title}</h2>
          <p className="mt-3 text-muted-foreground">{t.services.subtitle}</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {services.map((service) => {
            const Icon = iconMap[service.iconName] || Settings2;
            return (
              <div
                key={service.id}
                className="group flex h-full flex-col rounded-xl border border-border bg-card p-6 transition-all hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5"
              >
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-accent">
                  <Icon className="h-6 w-6 text-primary" />
                </div>
                <h3 className="mb-2 text-lg font-semibold text-foreground">
                  {service.title[contentLanguage]}
                </h3>
                <p className="mb-4 text-sm leading-relaxed text-muted-foreground">
                  {service.shortDesc[contentLanguage]}
                </p>
                <div className="mb-4 flex flex-wrap gap-1.5">
                  {service.tags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full bg-accent px-2.5 py-0.5 text-xs font-medium text-silver"
                    >
                      {translateTag(tag)}
                    </span>
                  ))}
                </div>
                <div className="mt-auto flex gap-2">
                  <Button asChild variant="outline" size="sm" className="flex-1 w-full text-xs">
                    <Link href={`/sluzby/${service.slug}`}>{t.services.detail}</Link>
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-1 text-xs text-primary"
                    onClick={openChatbot}
                  >
                    <MessageCircle className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
