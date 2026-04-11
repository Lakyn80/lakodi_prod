"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { Menu, Phone, MessageCircle } from "lucide-react";
import { useChatbot } from "@/contexts/ChatbotContext";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { useLanguage } from "@/contexts/LanguageContext";
import { translations } from "@/data/translations";
import { CONTACT } from "@/data/contact";
import { adminApiUrl, apiFetchOptions } from "@/lib/api";
import { getDesktopHomeHrefForHostname } from "@/lib/hosts";

export default function Header() {
  const { language, setLanguage } = useLanguage();
  const { openChatbot } = useChatbot();
  const t = translations[language];
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [desktopHomeHref, setDesktopHomeHref] = useState("/");

  useEffect(() => {
    const checkAdmin = () => {
      fetch(adminApiUrl("/check"), apiFetchOptions)
        .then((r) => r.json())
        .then((d) => setIsAdmin(Boolean(d.authenticated && d.role === "admin")))
        .catch(() => setIsAdmin(false));
    };

    if (typeof window !== "undefined") {
      setDesktopHomeHref(getDesktopHomeHrefForHostname(window.location.host));
    }

    checkAdmin();
    window.addEventListener("admin-auth-changed", checkAdmin);
    return () => window.removeEventListener("admin-auth-changed", checkAdmin);
  }, [pathname]);

  const navItems = [
    { label: t.nav.home, href: '/' },
    { label: t.nav.services, href: '/sluzby' },
    { label: t.nav.contact, href: '/kontakt' },
    ...(isAdmin ? [{ label: "Administrace", href: "/admin" }] : []),
  ];

  const isActive = (href: string) => pathname === href;

  return (
    <header className="sticky top-0 z-50 border-b border-border/50 bg-background/80 backdrop-blur-xl">
      <div className="container mx-auto flex h-16 items-center justify-between px-4 lg:h-20">
        {/* Logo */}
        <Link href="/" className="block">
          <Image
            src="/logo/lakodi_logo_crena_pozadi.png"
            alt="Lakodi"
            width={380}
            height={116}
            priority
            className="h-16 w-auto lg:h-20"
          />
        </Link>

        {/* Desktop Nav */}
        <nav className="hidden items-center gap-1 lg:flex">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href === "/" ? desktopHomeHref : item.href}
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
            <button
              onClick={() => setLanguage('ru')}
              className={`rounded px-2 py-1 transition-colors ${
                language === 'ru'
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              RU
            </button>
            <button
              onClick={() => setLanguage('en')}
              className={`rounded px-2 py-1 transition-colors ${
                language === 'en'
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              EN
            </button>
          </div>

          {/* Desktop CTAs */}
          <div className="hidden items-center gap-2 lg:flex">
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5 text-muted-foreground hover:text-primary"
              onClick={openChatbot}
            >
              <MessageCircle className="h-4 w-4" />
              {t.hero.cta.chat}
            </Button>
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
                <Button
                  className="w-full gap-2"
                  size="lg"
                  onClick={() => { openChatbot(); setOpen(false); }}
                >
                  <MessageCircle className="h-5 w-5" />
                  {t.hero.cta.chat}
                </Button>
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
