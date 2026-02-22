"use client";

import { useEffect, useState } from "react";
import { adminApiUrl, galleryAdminUrl, galleryUrl, uploadsUrl, apiFetchOptions } from "@/lib/api";
import { useLanguage } from "@/contexts/LanguageContext";

interface GalleryImage {
  id: number;
  image_path: string;
}

const mediaSrc = (path: string) => (path.startsWith("/") ? path : uploadsUrl(path));
const isVideoPath = (path: string) => /\.(mp4|webm|ogg|mov|m4v)$/i.test(path.split("?")[0] || "");

export default function GaleriePage() {
  const { language } = useLanguage();
  const labels = language === "cs"
    ? {
        title: "Galerie",
        upload: "Nahrát nové foto/video",
        uploading: "Nahrávám…",
        loading: "Načítání…",
        empty: "Zatím žádné fotky v této kategorii.",
        delete: "Smazat",
        confirmDelete: "Opravdu smazat médium?",
        uploadError: "Nepodařilo se nahrát médium",
        deleteError: "Nepodařilo se smazat médium",
        connectionError: "Chyba připojení",
      }
    : language === "ua"
    ? {
        title: "Галерея",
        upload: "Завантажити нове фото/відео",
        uploading: "Завантажую…",
        loading: "Завантаження…",
        empty: "Поки що немає фото в цій категорії.",
        delete: "Видалити",
        confirmDelete: "Справді видалити медіа?",
        uploadError: "Не вдалося завантажити медіа",
        deleteError: "Не вдалося видалити медіа",
        connectionError: "Помилка з'єднання",
      }
    : language === "ru"
    ? {
        title: "Галерея",
        upload: "Загрузить новое фото/видео",
        uploading: "Загружаю…",
        loading: "Загрузка…",
        empty: "Пока нет фото в этой категории.",
        delete: "Удалить",
        confirmDelete: "Точно удалить медиа?",
        uploadError: "Не удалось загрузить медиа",
        deleteError: "Не удалось удалить медиа",
        connectionError: "Ошибка соединения",
      }
    : {
        title: "Gallery",
        upload: "Upload new photo/video",
        uploading: "Uploading…",
        loading: "Loading…",
        empty: "No photos in this category yet.",
        delete: "Delete",
        confirmDelete: "Are you sure you want to delete this media?",
        uploadError: "Failed to upload media",
        deleteError: "Failed to delete media",
        connectionError: "Connection error",
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
  const [categories, setCategories] = useState<string[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [images, setImages] = useState<GalleryImage[]>([]);
  const [loading, setLoading] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(galleryUrl("/categories"), apiFetchOptions)
      .then((r) => r.json())
      .then((d) => {
        const cats = d.categories || [];
        setCategories(cats);
        if (cats.length > 0 && !selectedCategory) setSelectedCategory(cats[0]);
      })
      .catch(() => setCategories([]));

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

  useEffect(() => {
    if (!selectedCategory) {
      setImages([]);
      return;
    }
    setLoading(true);
    fetch(galleryUrl(`/${encodeURIComponent(selectedCategory)}`), apiFetchOptions)
      .then((r) => r.json())
      .then((d) => setImages(d.images || []))
      .catch(() => setImages([]))
      .finally(() => setLoading(false));
  }, [selectedCategory]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!selectedCategory) return;
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError("");
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("category", selectedCategory);
      const res = await fetch(galleryAdminUrl("/upload"), {
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
        setError(data.detail || labels.uploadError);
        return;
      }
      const media = await res.json();
      setImages((prev) => [media, ...prev]);
    } catch {
      setError(labels.connectionError);
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const handleDelete = async (mediaId: number) => {
    if (!confirm(labels.confirmDelete)) return;
    setError("");
    try {
      const res = await fetch(galleryAdminUrl(`/${mediaId}`), {
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
      setImages((prev) => prev.filter((img) => img.id !== mediaId));
    } catch {
      setError(labels.connectionError);
    }
  };

  return (
    <div className="container mx-auto px-4 py-12">
      <h1 className="mb-8 text-3xl font-bold text-foreground">{labels.title}</h1>
      <div className="mb-6 flex flex-wrap gap-2">
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setSelectedCategory(cat)}
            className={`rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
              selectedCategory === cat
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card text-foreground hover:bg-muted/50"
            }`}
          >
            {categoryText(cat)}
          </button>
        ))}
      </div>
      {isAdmin && selectedCategory && (
        <div className="mb-4">
          <label className="inline-flex cursor-pointer items-center rounded-md border border-border bg-card px-3 py-2 text-sm font-medium text-foreground hover:bg-muted/50">
            <input
              type="file"
              accept="image/*,video/*"
              className="hidden"
              onChange={handleUpload}
              disabled={uploading}
            />
            {uploading ? labels.uploading : labels.upload}
          </label>
        </div>
      )}
      {error && (
        <p className="mb-4 text-sm text-destructive">{error}</p>
      )}
      {loading ? (
        <p className="text-muted-foreground">{labels.loading}</p>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {images.map((img) => (
            <div key={img.id} className="relative overflow-hidden rounded-lg border border-border bg-card">
              {isVideoPath(img.image_path) ? (
                <video
                  src={mediaSrc(img.image_path)}
                  controls
                  className="h-48 w-full object-cover"
                />
              ) : (
                <img
                  src={mediaSrc(img.image_path)}
                  alt=""
                  className="h-48 w-full object-cover"
                />
              )}
              {isAdmin && (
                <button
                  type="button"
                  onClick={() => handleDelete(img.id)}
                  className="absolute right-2 top-2 rounded bg-destructive/90 px-2 py-1 text-xs font-semibold text-destructive-foreground"
                >
                  {labels.delete}
                </button>
              )}
            </div>
          ))}
          {images.length === 0 && selectedCategory && (
            <p className="col-span-full text-muted-foreground">{labels.empty}</p>
          )}
        </div>
      )}
    </div>
  );
}
