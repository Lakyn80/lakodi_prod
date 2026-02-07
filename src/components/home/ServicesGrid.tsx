import { Link } from 'react-router-dom';
import {
  Settings2,
  Gauge,
  Zap,
  KeyRound,
  Disc,
  Target,
  Snowflake,
  Paintbrush,
  MessageCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/contexts/LanguageContext';
import { translations } from '@/data/translations';
import { services } from '@/data/services';
import { CONTACT } from '@/data/contact';

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  Settings2,
  Gauge,
  Zap,
  KeyRound,
  Disc,
  Target,
  Snowflake,
  Paintbrush,
};

export default function ServicesGrid() {
  const { language } = useLanguage();
  const t = translations[language];

  return (
    <section className="py-20">
      <div className="container mx-auto px-4">
        <div className="mb-12 text-center">
          <h2 className="text-3xl font-bold text-foreground sm:text-4xl">{t.services.title}</h2>
          <p className="mt-3 text-muted-foreground">{t.services.subtitle}</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {services.map((service) => {
            const Icon = iconMap[service.iconName] || Settings2;
            return (
              <div
                key={service.id}
                className="group rounded-xl border border-border bg-card p-6 transition-all hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5"
              >
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-accent">
                  <Icon className="h-6 w-6 text-primary" />
                </div>
                <h3 className="mb-2 text-lg font-semibold text-foreground">
                  {service.title[language]}
                </h3>
                <p className="mb-4 text-sm leading-relaxed text-muted-foreground">
                  {service.shortDesc[language]}
                </p>
                <div className="mb-4 flex flex-wrap gap-1.5">
                  {service.tags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full bg-accent px-2.5 py-0.5 text-xs font-medium text-silver"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Link to={`/sluzby/${service.slug}`} className="flex-1">
                    <Button variant="outline" size="sm" className="w-full text-xs">
                      {t.services.detail}
                    </Button>
                  </Link>
                  <a
                    href={CONTACT.getWhatsAppUrl(service.title[language])}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Button variant="ghost" size="sm" className="gap-1 text-xs text-primary">
                      <MessageCircle className="h-3.5 w-3.5" />
                    </Button>
                  </a>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
