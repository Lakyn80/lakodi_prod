"use client";

import Link from "next/link";
import { useLanguage } from "@/contexts/LanguageContext";

const labels = {
  cs: {
    title: "Stránka nebyla nalezena",
    back: "Zpět na hlavní stránku",
  },
  ua: {
    title: "Сторінку не знайдено",
    back: "Повернутися на головну сторінку",
  },
  ru: {
    title: "Страница не найдена",
    back: "Вернуться на главную страницу",
  },
  en: {
    title: "Page not found",
    back: "Back to home page",
  },
};

export default function NotFound() {
  const { language } = useLanguage();
  const t = labels[language];

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted">
      <div className="text-center">
        <h1 className="mb-4 text-4xl font-bold">404</h1>
        <p className="mb-4 text-xl text-muted-foreground">{t.title}</p>
        <Link href="/" className="text-primary underline hover:text-primary/90">
          {t.back}
        </Link>
      </div>
    </div>
  );
}
