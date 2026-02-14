"use client";

import { MapPin, Phone, MessageCircle, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/contexts/LanguageContext";
import { translations } from "@/data/translations";
import { CONTACT } from "@/data/contact";

export default function ContactTeaser() {
  const { language } = useLanguage();
  const t = translations[language];

  return (
    <section className="py-20">
      <div className="container mx-auto px-4">
        <div className="mx-auto max-w-3xl">
          <div className="mb-8 text-center">
            <h2 className="text-3xl font-bold text-foreground sm:text-4xl">{t.contact.title}</h2>
          </div>

          <div className="rounded-2xl border border-border bg-card p-8">
            <div className="grid gap-6 md:grid-cols-2">
              {/* Info */}
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <MapPin className="mt-0.5 h-5 w-5 text-primary" />
                  <div>
                    <p className="text-sm font-medium text-silver">{t.contact.address}</p>
                    <p className="text-foreground">{CONTACT.address[language]}</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Phone className="mt-0.5 h-5 w-5 text-primary" />
                  <div>
                    <p className="text-sm font-medium text-silver">{t.hero.cta.call}</p>
                    <a
                      href={CONTACT.getPhoneUrl()}
                      className="text-foreground transition-colors hover:text-primary"
                    >
                      {CONTACT.phone}
                    </a>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <MessageCircle className="mt-0.5 h-5 w-5 text-primary" />
                  <div>
                    <p className="text-sm font-medium text-silver">WhatsApp</p>
                    <a
                      href={CONTACT.getWhatsAppUrl()}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-foreground transition-colors hover:text-primary"
                    >
                      {CONTACT.phone}
                    </a>
                  </div>
                </div>
              </div>

              {/* CTA buttons */}
              <div className="flex flex-col gap-3">
                <a href={CONTACT.getWhatsAppUrl()} target="_blank" rel="noopener noreferrer">
                  <Button className="w-full gap-2" size="lg">
                    <MessageCircle className="h-5 w-5" />
                    {t.contact.writeWhatsApp}
                  </Button>
                </a>
                <a href={CONTACT.getPhoneUrl()}>
                  <Button variant="outline" className="w-full gap-2 border-primary/50" size="lg">
                    <Phone className="h-5 w-5" />
                    {t.contact.callUs}
                  </Button>
                </a>
                <a href={CONTACT.mapUrl} target="_blank" rel="noopener noreferrer">
                  <Button
                    variant="ghost"
                    className="w-full gap-2 text-muted-foreground hover:text-primary"
                    size="lg"
                  >
                    <ExternalLink className="h-5 w-5" />
                    {t.contact.getDirections}
                  </Button>
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
