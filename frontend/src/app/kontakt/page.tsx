"use client";

import { Phone, MessageCircle, ExternalLink, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/contexts/LanguageContext";
import { useChatbot } from "@/contexts/ChatbotContext";
import { translations } from "@/data/translations";
import { CONTACT } from "@/data/contact";

export default function KontaktPage() {
  const { language } = useLanguage();
  const { openChatbot } = useChatbot();
  const t = translations[language];

  return (
    <div className="container mx-auto px-4 py-16">
      <div className="mx-auto max-w-4xl">
        <h1 className="mb-2 text-3xl font-bold text-foreground sm:text-4xl">{t.contact.title}</h1>
        <p className="mb-12 text-muted-foreground">{CONTACT.address[language]}</p>

        <div className="mb-12 grid gap-6 md:grid-cols-2">
          <div className="flex flex-col gap-4">
            <a
              href={CONTACT.getPhoneUrl()}
              className="flex items-center gap-4 rounded-xl border border-border bg-card p-6 transition-colors hover:border-primary/50 hover:bg-primary/5"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                <Phone className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="font-medium text-foreground">{t.contact.callUs}</p>
                <p className="text-primary">{CONTACT.phone}</p>
              </div>
            </a>
            <button
              type="button"
              onClick={openChatbot}
              className="flex w-full items-center gap-4 rounded-xl border border-border bg-card p-6 text-left transition-colors hover:border-primary/50 hover:bg-primary/5"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                <MessageCircle className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="font-medium text-foreground">{t.contact.chat}</p>
                <p className="text-primary">{t.contact.openChat}</p>
              </div>
            </button>
          </div>
          <div className="rounded-xl border border-border bg-card p-6">
            <div className="flex items-center gap-3 mb-4">
              <Clock className="h-5 w-5 text-primary" />
              <h3 className="font-medium text-foreground">{t.footer.openingHours}</h3>
            </div>
            <p className="text-muted-foreground">{CONTACT.openingHours[language]}</p>
          </div>
        </div>

        <a
          href={CONTACT.mapUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mb-8 block"
        >
          <Button className="gap-2" size="lg">
            <ExternalLink className="h-5 w-5" />
            {t.contact.getDirections}
          </Button>
        </a>

        <div className="overflow-hidden rounded-xl border border-border">
          <iframe
            src="https://maps.google.com/maps?q=K+Netluk%C3%A1m+93,+14000+Praha+22&z=15&output=embed"
            width="100%"
            height="400"
            style={{ border: 0 }}
            allowFullScreen
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
            title={t.contact.mapTitle}
            className="block w-full"
          />
        </div>
      </div>
    </div>
  );
}
