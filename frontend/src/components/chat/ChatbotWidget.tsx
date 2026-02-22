"use client";

import { MessageCircle } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useChatbot } from "@/contexts/ChatbotContext";
import BookingFlow from "@/components/home/BookingFlow";
import { useLanguage } from "@/contexts/LanguageContext";
import { translations } from "@/data/translations";

export default function ChatbotWidget() {
  const { isOpen, mode, openChatbot, closeChatbot } = useChatbot();
  const { language } = useLanguage();
  const t = translations[language];

  return (
    <>
      {/* Plovoucí tlačítko – z-[100] aby bylo vždy viditelné */}
      <button
        onClick={openChatbot}
        className="fixed bottom-24 right-6 z-[100] flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-all hover:scale-105 hover:shadow-xl lg:bottom-8"
        aria-label={t.hero.cta.chat}
      >
        <MessageCircle className="h-7 w-7" />
      </button>

      {/* Drawer s chatbottem */}
      <Sheet open={isOpen} onOpenChange={(open) => !open && closeChatbot()}>
        <SheetContent
          side="right"
          className="flex w-full flex-col border-border bg-background p-0 sm:max-w-lg"
        >
          <SheetHeader className="border-b border-border px-6 py-4 pr-12">
            <SheetTitle className="text-left">{t.hero.cta.chat}</SheetTitle>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto">
            <BookingFlow onClose={closeChatbot} compact requireTerm={mode === "booking"} />
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
