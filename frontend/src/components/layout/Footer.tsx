"use client";

import Link from "next/link";
import { MapPin, Phone, MessageCircle, Clock } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { useChatbot } from "@/contexts/ChatbotContext";
import { translations } from "@/data/translations";
import { CONTACT } from "@/data/contact";

export default function Footer() {
  const { language } = useLanguage();
  const { openChatbot } = useChatbot();
  const t = translations[language];

  const navItems = [
    { label: t.nav.home, href: '/' },
    { label: t.nav.services, href: '/sluzby' },
    { label: t.nav.contact, href: '/kontakt' },
  ];

  return (
    <footer className="border-t border-border bg-secondary">
      <div className="container mx-auto px-4 py-12">
        <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-4">
          {/* Brand */}
          <div>
            <h3 className="text-lg font-bold text-foreground">{t.hero.headline}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{CONTACT.address[language]}</p>
          </div>

          {/* Quick Links */}
          <div>
            <h4 className="mb-3 text-sm font-semibold uppercase tracking-wider text-silver">
              {t.footer.quickLinks}
            </h4>
            <nav className="flex flex-col gap-2">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="text-sm text-muted-foreground transition-colors hover:text-primary"
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>

          {/* Contact */}
          <div>
            <h4 className="mb-3 text-sm font-semibold uppercase tracking-wider text-silver">
              {t.footer.contactInfo}
            </h4>
            <div className="flex flex-col gap-2 text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-silver" />
                {CONTACT.address[language]}
              </div>
              <a
                href={CONTACT.getPhoneUrl()}
                className="flex items-center gap-2 transition-colors hover:text-primary"
              >
                <Phone className="h-4 w-4 text-silver" />
                {CONTACT.phone}
              </a>
              <button
                type="button"
                onClick={openChatbot}
                className="flex items-center gap-2 transition-colors hover:text-primary"
              >
                <MessageCircle className="h-4 w-4 text-silver" />
                {t.contact.chat}
              </button>
              <a
                href="https://www.tiktok.com/@zoro44511?_r=1&_t=ZN-93xAOVEaeda"
                target="_blank"
                rel="noreferrer"
                className="transition-colors hover:text-primary"
              >
                TikTok
              </a>
              <a
                href="https://www.facebook.com/groups/3063744427114288"
                target="_blank"
                rel="noreferrer"
                className="transition-colors hover:text-primary"
              >
                Facebook
              </a>
            </div>
          </div>

          {/* Opening hours */}
          <div>
            <h4 className="mb-3 text-sm font-semibold uppercase tracking-wider text-silver">
              {t.footer.openingHours}
            </h4>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Clock className="h-4 w-4 text-silver" />
              {CONTACT.openingHours[language]}
            </div>
          </div>
        </div>

        {/* SEO text */}
        <div className="mt-10 border-t border-border pt-6">
          <p className="text-xs leading-relaxed text-muted-foreground/60">{t.footer.seoText}</p>
        </div>

        {/* Copyright */}
        <div className="mt-6 text-center text-xs text-muted-foreground/40">
          {t.footer.copyright}
          <div className="mt-1">
            <a
              href="https://lukiora.com"
              target="_blank"
              rel="noreferrer"
              className="transition-colors hover:text-primary"
            >
              {t.footer.createdBy}
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}

