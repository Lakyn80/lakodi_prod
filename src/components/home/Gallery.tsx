import { useLanguage } from '@/contexts/LanguageContext';
import { translations } from '@/data/translations';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';

const galleryGradients = [
  'from-sky-900/30 to-card',
  'from-amber-900/30 to-card',
  'from-emerald-900/30 to-card',
  'from-violet-900/30 to-card',
  'from-rose-900/30 to-card',
  'from-cyan-900/30 to-card',
];

export default function Gallery() {
  const { language } = useLanguage();
  const t = translations[language];

  return (
    <section className="py-20">
      <div className="container mx-auto px-4">
        <div className="mb-8 text-center">
          <h2 className="text-3xl font-bold text-foreground sm:text-4xl">{t.gallery.title}</h2>
        </div>

        {/* Category Chips */}
        <div className="mb-8 flex flex-wrap justify-center gap-2">
          {t.gallery.categories.map((cat) => (
            <button
              key={cat}
              className="rounded-full border border-border bg-card px-4 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary"
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Gallery Grid – placeholder cards */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {t.gallery.categories.map((cat, i) => (
            <div
              key={i}
              className={`group relative aspect-[4/3] overflow-hidden rounded-xl border border-border bg-gradient-to-br ${galleryGradients[i]} transition-all hover:border-primary/30`}
            >
              <div className="absolute inset-0 flex items-end p-4">
                <span className="rounded-full bg-background/60 px-3 py-1 text-xs font-medium text-foreground backdrop-blur-sm">
                  {cat}
                </span>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-8 text-center">
          <Link to="/sluzby">
            <Button
              variant="outline"
              size="lg"
              className="border-primary/50 text-primary hover:bg-primary/10"
            >
              {t.gallery.showMore}
            </Button>
          </Link>
        </div>
      </div>
    </section>
  );
}
