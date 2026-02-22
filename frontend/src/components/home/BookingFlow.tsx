"use client";

import { useState } from "react";
import { MessageCircle, Phone, Check, ImagePlus, ChevronLeft, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useLanguage } from "@/contexts/LanguageContext";
import { translations } from "@/data/translations";
import { CONTACT } from "@/data/contact";
import { CHAT_CATEGORIES, type ChatCategory } from "@/data/chatbot-categories";
import { zakazkyUrl } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

type Step = "category" | "form" | "success";

interface SubmitResult {
  id: number;
  whatsapp_message: string;
  whatsapp_url?: string;
}

interface BookingFlowProps {
  onClose?: () => void;
  compact?: boolean;
  requireTerm?: boolean;
}

export default function BookingFlow({ onClose, compact, requireTerm = false }: BookingFlowProps) {
  const { language } = useLanguage();
  const t = translations[language];
  const contentLanguage = language;
  const { toast } = useToast();
  const [step, setStep] = useState<Step>("category");
  const [category, setCategory] = useState<ChatCategory | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SubmitResult | null>(null);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [preferredDate, setPreferredDate] = useState("");
  const [preferredTime, setPreferredTime] = useState("");
  const [description, setDescription] = useState("");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [callbackRequested, setCallbackRequested] = useState(false);
  const [photos, setPhotos] = useState<File[]>([]);
  const chatCopy = language === "cs"
    ? {
        title: "Poptávka – co potřebujeme vědět",
        subtitle: "Vyberte kategorii, popište problém a my se vám ozveme.",
        submit: "Odeslat poptávku",
        success: "Poptávka odeslána! Brzy se vám ozveme.",
      }
    : language === "ua"
    ? {
        title: "Запит – що нам потрібно знати",
        subtitle: "Виберіть категорію, опишіть проблему – ми зв'яжемося з вами.",
        submit: "Надіслати заявку",
        success: "Заявку надіслано! Ми зв'яжемося з вами найближчим часом.",
      }
    : language === "ru"
    ? {
        title: "Запрос - что нам нужно знать",
        subtitle: "Выберите категорию, опишите проблему - мы свяжемся с вами.",
        submit: "Отправить заявку",
        success: "Заявка отправлена! Мы свяжемся с вами в ближайшее время.",
      }
    : {
        title: "Inquiry - what we need to know",
        subtitle: "Select a category, describe the issue and we will contact you.",
        submit: "Send inquiry",
        success: "Inquiry sent! We will contact you soon.",
      };
  const uiCopy = language === "cs"
    ? {
        savedBookingInfo:
          "Objednávka je uložena v adminu. WhatsApp se otevřel s předvyplněnou zprávou - stačí kliknout Odeslat, aby to došlo majiteli. Nebo nám zavolejte.",
        savedInquiryInfo:
          "Poptávka je uložena v adminu. WhatsApp se otevřel s předvyplněnou zprávou - stačí kliknout Odeslat, aby to došlo majiteli. Nebo nám zavolejte.",
        close: "Zavřít",
        backToCategory: "Zpět na výběr kategorie",
        emailInvalid: "Zadejte platný email",
        preferredDate: "Preferovaný termín",
        preferredTime: "Preferovaný čas",
        selectPhotos: "Vybrat fotky",
        filesLabel: "souborů",
        remove: "Odebrat",
        sending: "Odesílám…",
      }
    : language === "ua"
    ? {
        savedBookingInfo:
          "Запис збережено в адмінці. WhatsApp відкрився з готовим повідомленням - натисніть Надіслати, щоб воно дійшло власнику. Або зателефонуйте нам.",
        savedInquiryInfo:
          "Запит збережено в адмінці. WhatsApp відкрився з готовим повідомленням - натисніть Надіслати, щоб воно дійшло власнику. Або зателефонуйте нам.",
        close: "Закрити",
        backToCategory: "Назад до вибору категорії",
        emailInvalid: "Введіть коректний email",
        preferredDate: "Бажана дата",
        preferredTime: "Бажаний час",
        selectPhotos: "Вибрати фото",
        filesLabel: "файлів",
        remove: "Видалити",
        sending: "Надсилаю…",
      }
    : language === "ru"
    ? {
        savedBookingInfo:
          "Запись сохранена в админке. WhatsApp открылся с готовым сообщением - нажмите Отправить, чтобы оно дошло владельцу. Или позвоните нам.",
        savedInquiryInfo:
          "Запрос сохранен в админке. WhatsApp открылся с готовым сообщением - нажмите Отправить, чтобы оно дошло владельцу. Или позвоните нам.",
        close: "Закрыть",
        backToCategory: "Назад к выбору категории",
        emailInvalid: "Введите корректный email",
        preferredDate: "Предпочтительная дата",
        preferredTime: "Предпочтительное время",
        selectPhotos: "Выбрать фото",
        filesLabel: "файлов",
        remove: "Удалить",
        sending: "Отправляю…",
      }
    : {
        savedBookingInfo:
          "The booking is saved in admin. WhatsApp opened with a prefilled message - just click Send to deliver it to the owner. Or call us.",
        savedInquiryInfo:
          "The inquiry is saved in admin. WhatsApp opened with a prefilled message - just click Send to deliver it to the owner. Or call us.",
        close: "Close",
        backToCategory: "Back to category selection",
        emailInvalid: "Enter a valid email",
        preferredDate: "Preferred date",
        preferredTime: "Preferred time",
        selectPhotos: "Select photos",
        filesLabel: "files",
        remove: "Remove",
        sending: "Sending…",
      };
  const flowTitle = requireTerm ? t.booking.title : chatCopy.title;
  const flowSubtitle = requireTerm ? t.booking.subtitle : chatCopy.subtitle;
  const flowSubmit = requireTerm ? t.booking.submit : chatCopy.submit;
  const flowSuccess = requireTerm ? t.booking.success : chatCopy.success;

  const selectedCategory = category ?? CHAT_CATEGORIES[0];
  const questions = selectedCategory.questions;
  const hasErrors = !name.trim() || !email.trim() || !phone.trim() || (requireTerm && (!preferredDate || !preferredTime)) || !description.trim();
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const phoneValid = /^[\d\s+()-]{6,}$/.test(phone);

  const handleCategorySelect = (cat: ChatCategory) => {
    setCategory(cat);
    setStep("form");
    setAnswers({});
  };

  const handleBack = () => {
    setStep("category");
    setCategory(null);
  };

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    const total = [...photos, ...files].slice(0, 10);
    setPhotos(total);
  };

  const removePhoto = (idx: number) => {
    setPhotos((p) => p.filter((_, i) => i !== idx));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (hasErrors || !phoneValid) return;
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append("category", selectedCategory.id);
      formData.append("name", name.trim());
      formData.append("email", email.trim());
      formData.append("phone", phone.trim());
      formData.append("description", description.trim());
      formData.append("answers", JSON.stringify(requireTerm ? {
        ...answers,
        preferred_date: preferredDate,
        preferred_time: preferredTime,
      } : answers));
      formData.append("callback_requested", String(callbackRequested));
      photos.forEach((f) => formData.append("photos", f));

      const res = await fetch(zakazkyUrl(""), {
        method: "POST",
        body: formData,
      });
      if (!res.ok) throw new Error("Submit failed");
      const data = await res.json();
      setResult(data);
      setStep("success");
      toast({ title: flowSuccess });
      // Automaticky otevřít WhatsApp – zpráva připravena k odeslání majiteli
      const whatsappUrl = data.whatsapp_url || CONTACT.getWhatsAppUrl(data.whatsapp_message);
      window.open(whatsappUrl, "_blank", "noopener");
    } catch {
      toast({ title: t.booking.errorSubmit, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const sectionClass = compact
    ? "py-6 px-4"
    : "border-y border-border bg-secondary py-20";

  const containerClass = compact ? "px-0" : "container mx-auto px-4";

  if (step === "success" && result) {
    return (
      <section id="booking" className={sectionClass}>
        <div className={containerClass}>
          <div className="mx-auto max-w-xl rounded-2xl border border-primary/30 bg-card p-8 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
              <Check className="h-8 w-8 text-primary" />
            </div>
            <h3 className="mb-2 text-xl font-bold text-foreground">{flowSuccess}</h3>
            <p className="mb-6 text-sm text-muted-foreground">
              {requireTerm
                ? uiCopy.savedBookingInfo
                : uiCopy.savedInquiryInfo}
            </p>
            <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
              <a
                href={result.whatsapp_url || CONTACT.getWhatsAppUrl(result.whatsapp_message)}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Button className="w-full gap-2 sm:w-auto" size="lg">
                  <MessageCircle className="h-5 w-5" />
                  {t.booking.sendWhatsApp}
                </Button>
              </a>
              <a href={CONTACT.getPhoneUrl()}>
                <Button variant="outline" className="w-full gap-2 sm:w-auto" size="lg">
                  <Phone className="h-5 w-5" />
                  {t.booking.callUs}
                </Button>
              </a>
              {onClose && (
                <Button variant="ghost" onClick={onClose}>
                  {uiCopy.close}
                </Button>
              )}
            </div>
          </div>
        </div>
      </section>
    );
  }

  if (step === "category") {
    return (
      <section id="booking" className={sectionClass}>
        <div className={containerClass}>
          <div className={compact ? "mb-4" : "mb-10 text-center"}>
            <h2 className={compact ? "text-lg font-bold text-foreground" : "text-3xl font-bold text-foreground sm:text-4xl"}>
              {flowTitle}
            </h2>
            <p className={compact ? "mt-1 text-sm text-muted-foreground" : "mt-3 text-muted-foreground"}>
              {flowSubtitle}
            </p>
          </div>
          <p className={compact ? "mb-3 text-sm font-medium text-foreground" : "mb-6 text-center font-medium text-foreground"}>
            {t.booking.stepCategory}
          </p>
          <div
            className={
              compact
                ? "grid grid-cols-2 gap-2"
                : "mx-auto grid max-w-3xl grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5"
            }
          >
            {CHAT_CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => handleCategorySelect(cat)}
                className={
                  compact
                    ? `rounded-lg border border-border bg-secondary/80 py-3 px-3 text-left text-sm font-medium text-foreground transition-colors hover:border-primary/50 hover:bg-primary/10 ${cat.id === "elektro" ? "col-span-2" : ""}`
                    : "rounded-xl border border-border bg-card p-4 text-left transition-colors hover:border-primary/50 hover:bg-primary/5"
                }
              >
                <span>{cat.title[contentLanguage]}</span>
              </button>
            ))}
          </div>
        </div>
      </section>
    );
  }

  return (
    <section id="booking" className={sectionClass}>
      <div className={containerClass}>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleBack}
          className="mb-6 gap-1 text-muted-foreground"
        >
          <ChevronLeft className="h-4 w-4" />
          {uiCopy.backToCategory}
        </Button>
        <div className="mb-6">
          <h2 className="text-xl font-bold text-foreground">{selectedCategory.title[contentLanguage]}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {selectedCategory.description[contentLanguage]}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="mx-auto max-w-2xl space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="name">{t.booking.name}</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="bg-card"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email">{t.booking.email}</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="bg-card"
                required
              />
              {email && !emailValid && (
                <p className="text-xs text-destructive">{uiCopy.emailInvalid}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="phone">{t.booking.phone}</Label>
              <Input
                id="phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="bg-card"
                required
              />
              {phone && !phoneValid && (
                <p className="text-xs text-destructive">{t.booking.validation.phoneInvalid}</p>
              )}
            </div>
            {requireTerm && (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="preferred-date">{uiCopy.preferredDate}</Label>
                  <Input
                    id="preferred-date"
                    type="date"
                    value={preferredDate}
                    onChange={(e) => setPreferredDate(e.target.value)}
                    className="bg-card"
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="preferred-time">{uiCopy.preferredTime}</Label>
                  <Input
                    id="preferred-time"
                    type="time"
                    value={preferredTime}
                    onChange={(e) => setPreferredTime(e.target.value)}
                    className="bg-card"
                    required
                  />
                </div>
              </>
            )}
          </div>

          {questions.map((q) => (
            <div key={q.key} className="space-y-1.5">
              <Label htmlFor={q.key}>{q.label[contentLanguage]}</Label>
              <Input
                id={q.key}
                value={answers[q.key] ?? ""}
                onChange={(e) => setAnswers((a) => ({ ...a, [q.key]: e.target.value }))}
                className="bg-card"
              />
            </div>
          ))}

          <div className="space-y-1.5">
            <Label htmlFor="description">{t.booking.shortDescription}</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="bg-card"
              required
            />
          </div>

          <div className="space-y-2">
            <Label>{t.booking.addPhotos}</Label>
            <div className="flex flex-wrap gap-2">
              <label className="cursor-pointer">
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={handlePhotoChange}
                />
                <span className="inline-flex h-9 items-center justify-center gap-1 rounded-md border border-input bg-background px-4 text-sm font-medium hover:bg-accent hover:text-accent-foreground">
                  <ImagePlus className="h-4 w-4" />
                  {uiCopy.selectPhotos}
                </span>
              </label>
              {photos.length > 0 && (
                <span className="text-sm text-muted-foreground">
                  {photos.length} {uiCopy.filesLabel}
                </span>
              )}
            </div>
            {photos.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {photos.map((_, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => removePhoto(i)}
                    className="text-xs text-destructive underline"
                  >
                    {uiCopy.remove} {i + 1}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              id="callback"
              checked={callbackRequested}
              onCheckedChange={(c) => setCallbackRequested(!!c)}
            />
            <Label htmlFor="callback" className="cursor-pointer text-sm font-normal">
              {t.booking.callbackRequest}
            </Label>
          </div>

          <Button
            type="submit"
            size="lg"
            className="w-full gap-2 text-base font-bold"
            disabled={loading || hasErrors || !phoneValid || !emailValid}
          >
            <Send className="h-5 w-5" />
            {loading ? uiCopy.sending : flowSubmit}
          </Button>
        </form>
      </div>
    </section>
  );
}
