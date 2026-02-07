import { Phone, MessageCircle, CalendarDays, Shield, Settings2, Target, Snowflake } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/contexts/LanguageContext';
import { translations } from '@/data/translations';
import { CONTACT } from '@/data/contact';
import heroImage from '@/assets/hero-automotive.jpg';

export default function Hero() {
  const { language } = useLanguage();
  const t = translations[language];

  const chipIcons = [Shield, Settings2, Target, Snowflake];

  const scrollToBooking = () => {
    document.getElementById('booking')?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <section className="relative flex min-h-[100dvh] items-center justify-center overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0">
        <img
          src={heroImage}
          alt="Autoservis Lakodi – profesionální autoservis Praha Uhříněves"
          className="h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/80 to-background/40" />
      </div>

      {/* Content */}
      <div className="container relative z-10 mx-auto px-4 py-20 text-center">
        <h1 className="text-4xl font-extrabold tracking-tight text-foreground sm:text-5xl md:text-6xl lg:text-7xl">
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
          <a
            href={CONTACT.getWhatsAppUrl()}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full sm:w-auto"
          >
            <Button
              size="lg"
              variant="outline"
              className="w-full gap-2 border-primary/50 text-base font-semibold text-foreground hover:bg-primary/10 sm:px-8"
            >
              <MessageCircle className="h-5 w-5 text-primary" />
              {t.hero.cta.whatsapp}
            </Button>
          </a>
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
      </div>
    </section>
  );
}
