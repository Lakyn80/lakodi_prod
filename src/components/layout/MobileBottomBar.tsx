"use client";

import { Phone, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/contexts/LanguageContext";
import { translations } from "@/data/translations";
import { CONTACT } from "@/data/contact";
import { useIsMobile } from "@/hooks/use-mobile";

export default function MobileBottomBar() {
  const isMobile = useIsMobile();
  const { language } = useLanguage();
  const t = translations[language];

  if (!isMobile) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-card/95 p-2 backdrop-blur-sm lg:hidden">
      <div className="flex gap-2">
        <a
          href={CONTACT.getWhatsAppUrl()}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-1"
        >
          <Button className="w-full gap-2 font-semibold" size="lg">
            <MessageCircle className="h-5 w-5" />
            WhatsApp
          </Button>
        </a>
        <a href={CONTACT.getPhoneUrl()} className="flex-1">
          <Button
            variant="outline"
            className="w-full gap-2 border-primary font-semibold text-primary hover:bg-primary hover:text-primary-foreground"
            size="lg"
          >
            <Phone className="h-5 w-5" />
            {t.hero.cta.call}
          </Button>
        </a>
      </div>
    </div>
  );
}
