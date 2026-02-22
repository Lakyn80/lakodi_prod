"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ChevronLeft, ImagePlus, MessageCircle } from "lucide-react";
import { Service } from "@/data/services";
import { useLanguage } from "@/contexts/LanguageContext";
import { useChatbot } from "@/contexts/ChatbotContext";
import { Button } from "@/components/ui/button";
import {
  adminApiUrl,
  apiFetchOptions,
  galleryAdminUrl,
  galleryUrl,
  uploadsUrl,
} from "@/lib/api";

const labels = {
  cs: {
    back: "Zpět na všechny služby",
    overview: "Přehled prací v této sekci",
    price: "Orientační cena",
    gallery: "Mini galerie",
    askChat: "Poptávka přes chat",
    uploadError: "Nepodařilo se nahrát médium",
    deleteError: "Nepodařilo se smazat médium",
    connectionError: "Chyba připojení",
    uploading: "Nahrávám…",
    uploadButton: "Nahrát nové foto/video",
    deleteButton: "Smazat",
  },
  ua: {
    back: "Назад до всіх послуг",
    overview: "Перелік робіт у цьому розділі",
    price: "Орієнтовна ціна",
    gallery: "Міні галерея",
    askChat: "Запит через чат",
    uploadError: "Не вдалося завантажити медіа",
    deleteError: "Не вдалося видалити медіа",
    connectionError: "Помилка з'єднання",
    uploading: "Завантажую…",
    uploadButton: "Завантажити нове фото/відео",
    deleteButton: "Видалити",
  },
  ru: {
    back: "Назад ко всем услугам",
    overview: "Перечень работ в этом разделе",
    price: "Ориентировочная цена",
    gallery: "Мини-галерея",
    askChat: "Запрос через чат",
    uploadError: "Не удалось загрузить медиа",
    deleteError: "Не удалось удалить медиа",
    connectionError: "Ошибка соединения",
    uploading: "Загружаю…",
    uploadButton: "Загрузить новое фото/видео",
    deleteButton: "Удалить",
  },
  en: {
    back: "Back to all services",
    overview: "Overview of work in this section",
    price: "Indicative price",
    gallery: "Mini gallery",
    askChat: "Inquiry via chat",
    uploadError: "Failed to upload media",
    deleteError: "Failed to delete media",
    connectionError: "Connection error",
    uploading: "Uploading…",
    uploadButton: "Upload new photo/video",
    deleteButton: "Delete",
  },
};

export default function ServiceDetailPage({ service }: { service: Service }) {
  const { language } = useLanguage();
  const { openChatbot } = useChatbot();
  const t = labels[language];
  const contentLanguage = language;
  const [isAdmin, setIsAdmin] = useState(false);
  const [itemMedia, setItemMedia] = useState<Record<string, string[]>>({});
  const [workingItem, setWorkingItem] = useState<string | null>(null);
  const [error, setError] = useState("");
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  useEffect(() => {
    fetch(galleryUrl(`/service/${service.slug}`), apiFetchOptions)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.items && typeof d.items === "object") {
          setItemMedia(d.items as Record<string, string[]>);
        } else {
          setItemMedia({});
        }
      })
      .catch(() => setItemMedia({}));

    const checkAdmin = () => {
      fetch(adminApiUrl("/check"), apiFetchOptions)
        .then((r) => r.json())
        .then((d) => setIsAdmin(Boolean(d.authenticated && d.role === "admin")))
        .catch(() => setIsAdmin(false));
    };
    checkAdmin();
    window.addEventListener("admin-auth-changed", checkAdmin);
    return () => window.removeEventListener("admin-auth-changed", checkAdmin);
  }, [service.slug]);

  const mediaSrc = (path: string) => (path.startsWith("/") ? path : uploadsUrl(path));
  const isVideoPath = (path: string) => /\.(mp4|webm|ogg|mov|m4v)$/i.test(path.split("?")[0] || "");

  const getMediaList = (itemId: string, fallback: string[]) => itemMedia[itemId] ?? fallback;

  const handleUpload = async (itemId: string, fallback: string[], e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const current = getMediaList(itemId, fallback);
    setWorkingItem(itemId);
    setError("");
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("media_paths", JSON.stringify(current));
      const res = await fetch(galleryAdminUrl(`/service/${service.slug}/${itemId}/upload`), {
        method: "POST",
        credentials: "include",
        body: formData,
      });
      if (!res.ok) {
        if (res.status === 401) {
          setIsAdmin(false);
          window.dispatchEvent(new Event("admin-auth-changed"));
        }
        const data = await res.json().catch(() => ({}));
        setError(data.detail || t.uploadError);
        return;
      }
      const data = await res.json();
      setItemMedia((prev) => ({ ...prev, [itemId]: data.media_paths || current }));
    } catch {
      setError(t.connectionError);
    } finally {
      setWorkingItem(null);
      e.target.value = "";
    }
  };

  const handleDelete = async (itemId: string, fallback: string[], mediaPath: string) => {
    const current = getMediaList(itemId, fallback);
    setWorkingItem(itemId);
    setError("");
    try {
      const res = await fetch(galleryAdminUrl(`/service/${service.slug}/${itemId}/remove`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ media_path: mediaPath, media_paths: current }),
      });
      if (!res.ok) {
        if (res.status === 401) {
          setIsAdmin(false);
          window.dispatchEvent(new Event("admin-auth-changed"));
        }
        const data = await res.json().catch(() => ({}));
        setError(data.detail || t.deleteError);
        return;
      }
      const data = await res.json();
      setItemMedia((prev) => ({ ...prev, [itemId]: data.media_paths || current.filter((m) => m !== mediaPath) }));
    } catch {
      setError(t.connectionError);
    } finally {
      setWorkingItem(null);
    }
  };

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
          <h1 className="text-3xl font-bold text-foreground sm:text-4xl">{service.title[contentLanguage]}</h1>
          <p className="mt-4 max-w-3xl leading-relaxed text-muted-foreground">{service.intro[contentLanguage]}</p>
          <p className="mt-3 text-sm text-silver">{service.pricingNote[contentLanguage]}</p>
          <div className="mt-5 flex flex-wrap gap-2">
            {service.items.map((item) => (
              <a
                key={item.id}
                href={`#${item.id}`}
                className="rounded-full border border-border bg-secondary px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
              >
                {item.title[contentLanguage]}
              </a>
            ))}
          </div>
        </div>

        <div className="mb-6">
          <h2 className="text-lg font-semibold text-foreground">{t.overview}</h2>
        </div>
        {error && <p className="mb-4 text-sm text-destructive">{error}</p>}

        <div className="space-y-6">
          {service.items.map((item) => (
            <article
              id={item.id}
              key={item.id}
              className="scroll-mt-24 rounded-2xl border border-border bg-card p-6 sm:p-8"
            >
              <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                <h3 className="text-2xl font-semibold text-foreground">{item.title[contentLanguage]}</h3>
                <div className="rounded-xl border border-primary/30 bg-primary/10 px-3 py-2">
                  <p className="text-[11px] uppercase tracking-wide text-primary/80">{t.price}</p>
                  <p className="text-sm font-semibold text-primary">{item.priceRange[contentLanguage]}</p>
                </div>
              </div>

              <ul className="mb-6 list-disc space-y-2 pl-5 text-muted-foreground">
                {item.description[contentLanguage].map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>

              <div className="mb-3 flex items-center gap-2">
                <ImagePlus className="h-4 w-4 text-primary" />
                <p className="text-sm font-semibold text-foreground">{t.gallery}</p>
              </div>

              {isAdmin && (
                <div className="mb-3">
                  <input
                    ref={(el) => {
                      inputRefs.current[item.id] = el;
                    }}
                    type="file"
                    accept="image/*,video/*"
                    className="hidden"
                    onChange={(e) => handleUpload(item.id, item.gallery, e)}
                    disabled={workingItem === item.id}
                  />
                  <button
                    type="button"
                    className="rounded-md border border-border bg-background px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted/50"
                    onClick={() => inputRefs.current[item.id]?.click()}
                    disabled={workingItem === item.id}
                  >
                    {workingItem === item.id ? t.uploading : t.uploadButton}
                  </button>
                </div>
              )}

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {getMediaList(item.id, item.gallery).map((src, index) => (
                  <div
                    key={`${item.id}-${src}-${index}`}
                    className="group relative aspect-[4/3] overflow-hidden rounded-xl border border-border bg-secondary"
                  >
                    {isVideoPath(src) ? (
                      <video
                        src={mediaSrc(src)}
                        className="h-full w-full object-cover"
                        controls
                        playsInline
                      />
                    ) : (
                      <Image
                        src={mediaSrc(src)}
                        alt={`${service.title[contentLanguage]} - ${item.title[contentLanguage]} (${index + 1})`}
                        fill
                        sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                        className="object-cover"
                      />
                    )}
                    {isAdmin && (
                      <button
                        type="button"
                        className="absolute right-2 top-2 rounded bg-destructive/90 px-2 py-1 text-xs font-semibold text-destructive-foreground"
                        onClick={() => handleDelete(item.id, item.gallery, src)}
                        disabled={workingItem === item.id}
                      >
                        {t.deleteButton}
                      </button>
                    )}
                  </div>
                ))}
              </div>

              <div className="mt-5">
                <Button variant="outline" className="gap-2" onClick={openChatbot}>
                  <MessageCircle className="h-4 w-4" />
                  {t.askChat}
                </Button>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
