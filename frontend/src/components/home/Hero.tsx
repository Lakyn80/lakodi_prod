"use client";

import Image from "next/image";
import { Phone, MessageCircle, CalendarDays, Shield, Settings2, Target, Snowflake } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/contexts/LanguageContext";
import { translations } from "@/data/translations";
import { CONTACT } from "@/data/contact";
import { useChatbot } from "@/contexts/ChatbotContext";
import heroImage from "@/assets/hero-automotive.jpg";

export default function Hero() {
  const { language } = useLanguage();
  const { openChatbot } = useChatbot();
  const t = translations[language];
  const labels = language === "cs"
    ? {
        heroAlt: "Autoservis Lakodi - profesionální autoservis Praha Uhříněves",
        videoAria: "Lakodi prezentační video",
      }
    : language === "ua"
    ? {
        heroAlt: "Lakodi автосервіс - професійний автосервіс Прага Угржінєвес",
        videoAria: "Lakodi презентаційне відео",
      }
    : language === "ru"
    ? {
        heroAlt: "Lakodi автосервис - профессиональный автосервис Прага Угржиневес",
        videoAria: "Lakodi презентационное видео",
      }
    : {
        heroAlt: "Lakodi auto service - professional car service in Prague Uhříněves",
        videoAria: "Lakodi presentation video",
      };

  const chipIcons = [Shield, Settings2, Target, Snowflake];

  const scrollToBooking = () => {
    openChatbot("booking");
  };

  return (
    <section className="relative flex min-h-[100dvh] items-center justify-center overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0">
        <Image
          src={heroImage}
          alt={labels.heroAlt}
          fill
          priority
          sizes="100vw"
          className="object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/80 to-background/40" />
      </div>

      {/* Content */}
      <div className="container relative z-10 mx-auto px-4 py-20 text-center">
        <h1
          className="bg-gradient-to-b from-white via-slate-200 to-slate-400 bg-clip-text text-4xl font-extrabold tracking-tight text-transparent sm:text-5xl md:text-6xl lg:text-7xl"
          style={{ textShadow: "0 1px 0 rgba(255,255,255,0.7), 0 2px 0 rgba(210,220,230,0.6), 0 10px 25px rgba(0,0,0,0.45)" }}
        >
          {t.hero.headline}
        </h1>
        <p className="mt-3 text-lg font-medium text-primary sm:text-xl">
          {t.hero.subheadline}
        </p>
        <p className="mx-auto mt-6 max-w-2xl text-base text-muted-foreground sm:text-lg">
          {t.hero.description}
        </p>

        {/* CTA Buttons */}
        <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center sm:gap-4">
          <Button
            size="lg"
            className="w-full gap-2 text-base font-bold sm:w-auto sm:px-8"
            onClick={scrollToBooking}
          >
            <CalendarDays className="h-5 w-5" />
            {t.hero.cta.book}
          </Button>
          <Button
            size="lg"
            variant="outline"
            className="w-full gap-2 border-primary/50 text-base font-semibold text-foreground hover:bg-primary/10 sm:w-auto sm:px-8"
            onClick={() => openChatbot("chat")}
          >
            <MessageCircle className="h-5 w-5 text-primary" />
            {t.hero.cta.chat}
          </Button>
          <a href={CONTACT.getPhoneUrl()} className="w-full sm:w-auto">
            <Button
              size="lg"
              variant="outline"
              className="w-full gap-2 border-border text-base font-semibold text-foreground hover:bg-accent sm:px-8"
            >
              <Phone className="h-5 w-5 text-silver" />
              {t.hero.cta.call}
            </Button>
          </a>
        </div>

        {/* Trust Chips */}
        <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
          {t.hero.chips.map((chip, i) => {
            const Icon = chipIcons[i];
            return (
              <div
                key={i}
                className="flex items-center gap-2 rounded-full border border-border/60 bg-card/50 px-4 py-2 backdrop-blur-sm"
              >
                <Icon className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium text-muted-foreground">{chip}</span>
              </div>
            );
          })}
        </div>

        <div className="mx-auto mt-8 w-full max-w-xl">
          <div className="overflow-hidden rounded-2xl border border-border/60 bg-card/50 backdrop-blur-sm">
            <video
              className="h-auto w-full"
              autoPlay
              muted
              loop
              playsInline
              preload="metadata"
              aria-label={labels.videoAria}
            >
              <source src="/video/logo_video_A.mp4" type="video/mp4" />
            </video>
          </div>
        </div>
      </div>
    </section>
  );
}
