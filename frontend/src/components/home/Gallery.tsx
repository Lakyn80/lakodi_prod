"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useLanguage } from "@/contexts/LanguageContext";
import { translations } from "@/data/translations";
import { Button } from "@/components/ui/button";
import {
  adminApiUrl,
  apiFetchOptions,
  galleryAdminUrl,
  galleryUrl,
  uploadsUrl,
} from "@/lib/api";

interface HomeGallerySlot {
  slot_index: number;
  category: string;
  image_path: string | null;
}

const fallbackSlots: HomeGallerySlot[] = [
  { slot_index: 0, category: "Převodovky", image_path: "/services/prevodovky/repas-automat-01.webp" },
  { slot_index: 1, category: "Motory", image_path: "/services/motory/go-motoru-01.webp" },
  { slot_index: 2, category: "Geometrie", image_path: "/services/motory/go-motoru-02.webp" },
  { slot_index: 3, category: "Lakovna", image_path: "/services/karoserie-lakovani/renovace-mercedes-01.webp" },
  { slot_index: 4, category: "Diagnostika", image_path: "/services/motory/go-motoru-03.webp" },
  { slot_index: 5, category: "Karoserie", image_path: "/services/karoserie-lakovani/renovace-mercedes-02.webp" },
  { slot_index: 6, category: "Převodovky", image_path: "/services/prevodovky/repas-automat-02.webp" },
  { slot_index: 7, category: "Motory", image_path: "/services/motory/go-motoru-04.webp" },
  { slot_index: 8, category: "Geometrie", image_path: "/services/motory/go-motoru-05.webp" },
  { slot_index: 9, category: "Lakovna", image_path: "/services/karoserie-lakovani/renovace-mercedes-03.webp" },
  { slot_index: 10, category: "Diagnostika", image_path: "/services/motory/go-motoru-06.webp" },
  { slot_index: 11, category: "Karoserie", image_path: "/services/karoserie-lakovani/renovace-mercedes-04.webp" },
];

const uniqueCategories = (slots: HomeGallerySlot[]) => Array.from(new Set(slots.map((s) => s.category)));

const slotImageSrc = (imagePath: string | null) =>
  !imagePath ? null : imagePath.startsWith("/") ? imagePath : uploadsUrl(imagePath);

const isVideoPath = (src: string | null) =>
  !!src && /\.(mp4|webm|ogg|mov|m4v)$/i.test(src.split("?")[0] || "");

export default function Gallery() {
  const { language } = useLanguage();
  const t = translations[language];
  const labels = language === "cs"
    ? {
        noPhoto: "Bez fotky",
        uploadError: "Nepodařilo se nahrát médium",
        deleteError: "Nepodařilo se smazat médium",
        connectionError: "Chyba připojení",
        confirmDelete: "Opravdu smazat médium v tomto rámečku?",
        change: "Změnit",
        upload: "Nahrát",
        delete: "Smazat",
      }
    : language === "ua"
    ? {
        noPhoto: "Без фото",
        uploadError: "Не вдалося завантажити медіа",
        deleteError: "Не вдалося видалити медіа",
        connectionError: "Помилка з'єднання",
        confirmDelete: "Справді видалити медіа в цьому слоті?",
        change: "Змінити",
        upload: "Завантажити",
        delete: "Видалити",
      }
    : language === "ru"
    ? {
        noPhoto: "Нет фото",
        uploadError: "Не удалось загрузить медиа",
        deleteError: "Не удалось удалить медиа",
        connectionError: "Ошибка соединения",
        confirmDelete: "Точно удалить медиа в этом слоте?",
        change: "Изменить",
        upload: "Загрузить",
        delete: "Удалить",
      }
    : {
        noPhoto: "No photo",
        uploadError: "Failed to upload media",
        deleteError: "Failed to delete media",
        connectionError: "Connection error",
        confirmDelete: "Are you sure you want to delete media in this slot?",
        change: "Change",
        upload: "Upload",
        delete: "Delete",
      };
  const categoryLabels = language === "ua"
    ? {
        "Převodovky": "Коробки передач",
        "Motory": "Двигуни",
        "Geometrie": "Геометрія",
        "Lakovna": "Фарбування",
        "Diagnostika": "Діагностика",
        "Karoserie": "Кузов",
      }
    : language === "ru"
    ? {
        "Převodovky": "Коробки передач",
        "Motory": "Двигатели",
        "Geometrie": "Геометрия",
        "Lakovna": "Покраска",
        "Diagnostika": "Диагностика",
        "Karoserie": "Кузов",
      }
    : language === "en"
    ? {
        "Převodovky": "Gearboxes",
        "Motory": "Engines",
        "Geometrie": "Alignment",
        "Lakovna": "Paint shop",
        "Diagnostika": "Diagnostics",
        "Karoserie": "Bodywork",
      }
    : {};
  const categoryText = (value: string) =>
    categoryLabels[value as keyof typeof categoryLabels] ?? value;
  const [slots, setSlots] = useState<HomeGallerySlot[]>(fallbackSlots);
  const [isAdmin, setIsAdmin] = useState(false);
  const [workingSlot, setWorkingSlot] = useState<number | null>(null);
  const [error, setError] = useState("");
  const inputRefs = useRef<Record<number, HTMLInputElement | null>>({});

  useEffect(() => {
    fetch(galleryUrl("/home"), apiFetchOptions)
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d.slots) && d.slots.length > 0) {
          setSlots(d.slots);
        }
      })
      .catch(() => setSlots(fallbackSlots));

    const checkAdmin = () => {
      fetch(adminApiUrl("/check"), apiFetchOptions)
        .then((r) => r.json())
        .then((d) => setIsAdmin(Boolean(d.authenticated && d.role === "admin")))
        .catch(() => setIsAdmin(false));
    };
    checkAdmin();
    window.addEventListener("admin-auth-changed", checkAdmin);
    return () => window.removeEventListener("admin-auth-changed", checkAdmin);
  }, []);

  const updateSlot = (slot: HomeGallerySlot) =>
    setSlots((prev) => prev.map((s) => (s.slot_index === slot.slot_index ? slot : s)));

  const handleUpload = async (slotIndex: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError("");
    setWorkingSlot(slotIndex);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(galleryAdminUrl(`/home/${slotIndex}/upload`), {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (!res.ok) {
        if (res.status === 401) {
          setIsAdmin(false);
          window.dispatchEvent(new Event("admin-auth-changed"));
        }
        const data = await res.json().catch(() => ({}));
        setError(data.detail || labels.uploadError);
        return;
      }
      const data = await res.json();
      updateSlot(data);
    } catch {
      setError(labels.connectionError);
    } finally {
      setWorkingSlot(null);
      e.target.value = "";
    }
  };

  const handleDelete = async (slotIndex: number) => {
    if (!confirm(labels.confirmDelete)) return;
    setError("");
    setWorkingSlot(slotIndex);
    try {
      const res = await fetch(galleryAdminUrl(`/home/${slotIndex}`), {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        if (res.status === 401) {
          setIsAdmin(false);
          window.dispatchEvent(new Event("admin-auth-changed"));
        }
        const data = await res.json().catch(() => ({}));
        setError(data.detail || labels.deleteError);
        return;
      }
      const data = await res.json();
      if (data.slot) updateSlot(data.slot);
    } catch {
      setError(labels.connectionError);
    } finally {
      setWorkingSlot(null);
    }
  };

  const chips = uniqueCategories(slots);

  return (
    <section className="py-20">
      <div className="container mx-auto px-4">
        <div className="mb-8 text-center">
          <h2 className="text-3xl font-bold text-foreground sm:text-4xl">{t.gallery.title}</h2>
        </div>

        <div className="mb-8 flex flex-wrap justify-center gap-2">
          {chips.map((cat) => (
            <button
              key={cat}
              className="rounded-full border border-border bg-card px-4 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary"
            >
              {categoryText(cat)}
            </button>
          ))}
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-2 text-sm text-destructive">
            {error}
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {slots.map((slot) => {
            const src = slotImageSrc(slot.image_path);
            const isWorking = workingSlot === slot.slot_index;
            return (
              <div
                key={slot.slot_index}
                className="group relative aspect-[4/3] overflow-hidden rounded-xl border border-border bg-card transition-all hover:border-primary/30"
              >
                {src ? (
                  isVideoPath(src) ? (
                    <video
                      src={src}
                      className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                      controls
                      muted
                      playsInline
                    />
                  ) : (
                    <Image
                      src={src}
                      alt={`${categoryText(slot.category)} - ${t.hero.headline}`}
                      fill
                      sizes="(max-width: 640px) 100vw, (max-width: 1280px) 50vw, 25vw"
                      className="object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                  )
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center bg-muted/40 text-sm text-muted-foreground">
                    {labels.noPhoto}
                  </div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />
                <div className="absolute inset-0 flex items-end p-4">
                  <span className="rounded-full bg-background/60 px-3 py-1 text-xs font-medium text-foreground backdrop-blur-sm">
                    {categoryText(slot.category)}
                  </span>
                </div>
                {isAdmin && (
                  <div className="absolute right-2 top-2 z-20 flex gap-2">
                    <input
                      ref={(el) => {
                        inputRefs.current[slot.slot_index] = el;
                      }}
                      type="file"
                      accept="image/*,video/*"
                      className="hidden"
                      onChange={(e) => handleUpload(slot.slot_index, e)}
                      disabled={isWorking}
                    />
                    <button
                      type="button"
                      className="rounded-md bg-background/85 px-2 py-1 text-xs font-semibold text-foreground backdrop-blur-sm"
                      onClick={() => inputRefs.current[slot.slot_index]?.click()}
                      disabled={isWorking}
                    >
                      {isWorking ? "..." : src ? labels.change : labels.upload}
                    </button>
                    <button
                      type="button"
                      className="rounded-md bg-destructive/90 px-2 py-1 text-xs font-semibold text-destructive-foreground"
                      onClick={() => handleDelete(slot.slot_index)}
                      disabled={isWorking || !src}
                    >
                      {labels.delete}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
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
