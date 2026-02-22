"use client";

import { Phone, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/contexts/LanguageContext";
import { useChatbot } from "@/contexts/ChatbotContext";
import { translations } from "@/data/translations";
import { CONTACT } from "@/data/contact";
import { useIsMobile } from "@/hooks/use-mobile";

export default function MobileBottomBar() {
  const isMobile = useIsMobile();
  const { language } = useLanguage();
  const { openChatbot } = useChatbot();
  const t = translations[language];

  if (!isMobile) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-card/95 p-2 backdrop-blur-sm lg:hidden">
      <div className="flex gap-2">
        <Button
          className="flex-1 gap-2 font-semibold"
          size="lg"
          onClick={openChatbot}
        >
          <MessageCircle className="h-5 w-5" />
          {t.hero.cta.chat}
        </Button>
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
