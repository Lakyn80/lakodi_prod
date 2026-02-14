"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, Phone, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { useLanguage } from "@/contexts/LanguageContext";
import { translations } from "@/data/translations";
import { CONTACT } from "@/data/contact";

export default function Header() {
  const { language, setLanguage } = useLanguage();
  const t = translations[language];
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const navItems = [
    { label: t.nav.home, href: '/' },
    { label: t.nav.services, href: '/sluzby' },
    { label: t.nav.converter, href: '/converter' },
    { label: t.nav.contact, href: '/kontakt' },
  ];

  const isActive = (href: string) => pathname === href;

  return (
    <header className="sticky top-0 z-50 border-b border-border/50 bg-background/80 backdrop-blur-xl">
      <div className="container mx-auto flex h-16 items-center justify-between px-4 lg:h-20">
        {/* Logo */}
        <Link href="/" className="flex flex-col">
          <span className="text-lg font-bold tracking-tight text-foreground lg:text-xl">
            Lakodi autoslužby
          </span>
          <span className="text-xs text-muted-foreground">{CONTACT.address[language]}</span>
        </Link>

        {/* Desktop Nav */}
        <nav className="hidden items-center gap-1 lg:flex">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                isActive(item.href)
                  ? 'text-primary'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        {/* Right side */}
        <div className="flex items-center gap-2">
          {/* Language switch */}
          <div className="flex items-center rounded-md border border-border bg-secondary p-0.5 text-xs font-medium">
            <button
              onClick={() => setLanguage('cs')}
              className={`rounded px-2 py-1 transition-colors ${
                language === 'cs'
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              CZ
            </button>
            <button
              onClick={() => setLanguage('ua')}
              className={`rounded px-2 py-1 transition-colors ${
                language === 'ua'
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              UA
            </button>
          </div>

          {/* Desktop CTAs */}
          <div className="hidden items-center gap-2 lg:flex">
            <a href={CONTACT.getWhatsAppUrl()} target="_blank" rel="noopener noreferrer">
              <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground hover:text-primary">
                <MessageCircle className="h-4 w-4" />
                WhatsApp
              </Button>
            </a>
            <a href={CONTACT.getPhoneUrl()}>
              <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground hover:text-primary">
                <Phone className="h-4 w-4" />
                {CONTACT.phone}
              </Button>
            </a>
          </div>

          {/* Mobile hamburger */}
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild className="lg:hidden">
              <Button variant="ghost" size="icon">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-72 border-border bg-card">
              <nav className="mt-8 flex flex-col gap-2">
                {navItems.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className={`rounded-md px-4 py-3 text-base font-medium transition-colors ${
                      isActive(item.href)
                        ? 'bg-primary/10 text-primary'
                        : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                    }`}
                  >
                    {item.label}
                  </Link>
                ))}
              </nav>
              <div className="mt-6 flex flex-col gap-3 px-4">
                <a href={CONTACT.getWhatsAppUrl()} target="_blank" rel="noopener noreferrer">
                  <Button className="w-full gap-2" size="lg">
                    <MessageCircle className="h-5 w-5" />
                    WhatsApp
                  </Button>
                </a>
                <a href={CONTACT.getPhoneUrl()}>
                  <Button variant="outline" className="w-full gap-2" size="lg">
                    <Phone className="h-5 w-5" />
                    {t.hero.cta.call}
                  </Button>
                </a>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
