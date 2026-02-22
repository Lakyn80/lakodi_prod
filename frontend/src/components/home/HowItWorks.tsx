"use client";

import { MessageCircle, Camera, CalendarCheck } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { translations } from "@/data/translations";

const stepIcons = [MessageCircle, Camera, CalendarCheck];

export default function HowItWorks() {
  const { language } = useLanguage();
  const t = translations[language];

  return (
    <section className="border-y border-border bg-secondary py-20">
      <div className="container mx-auto px-4">
        <div className="mb-12 text-center">
          <h2 className="text-3xl font-bold text-foreground sm:text-4xl">
            {t.howItWorks.title}
          </h2>
          <p className="mt-3 text-muted-foreground">{t.howItWorks.subtitle}</p>
        </div>

        <div className="mx-auto grid max-w-4xl gap-8 md:grid-cols-3">
          {t.howItWorks.steps.map((step, i) => {
            const Icon = stepIcons[i];
            return (
              <div key={i} className="relative text-center">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 ring-1 ring-primary/20">
                  <Icon className="h-7 w-7 text-primary" />
                </div>
                <div className="mb-2 text-xs font-bold uppercase tracking-widest text-primary">
                  {i + 1}.
                </div>
                <h3 className="mb-2 text-lg font-semibold text-foreground">{step.title}</h3>
                <p className="text-sm text-muted-foreground">{step.desc}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
