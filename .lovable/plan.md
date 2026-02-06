

# Lakodi autoslužby – Autoservisní web
**Praha – Uhříněves | CZ + UA | Prémiový automotive design**

---

## Vizuální styl
- **Tmavý automotive design**: Carbon Black pozadí (#0B0F14), Graphite sekundární (#121821), Deep Slate karty (#171F2A)
- **Žluté CTA**: Racing Yellow (#FFD400) s hover efektem (#E6BE00) – velká, výrazná tlačítka
- **Metalické akcenty**: Steel border (#263243), Silver (#C7CED8) pro ikonky a linky
- **Typografie**: moderní technická (Inter/Manrope), velké nadpisy, čistý kontrast
- **Fotky**: zatím cinematic gradienty a placeholdery, vlastní fotky se doplní později

---

## Fáze 1: Layout + Homepage

### Globální layout
- **Sticky header**: Logo „Lakodi autoslužby" + „Praha – Uhříněves" vlevo, navigace (Domů, Služby, Converter, Kontakt) + přepínač CZ|UA + mini CTA (WhatsApp, Telefon) vpravo
- **Mobile**: hamburger menu + sticky bottom bar (WhatsApp + Zavolat)
- **Footer**: adresa, telefon, WhatsApp, otevírací doba (placeholder), mini navigace, copyright, SEO textový blok
- **Přepínač jazyka CZ | UA**: uloží volbu do localStorage, platí na všech stránkách

### Homepage sekce
1. **Hero** (fullscreen): cinematic pozadí s tmavým overlayem, headline „Lakodi autoslužby", subheadline „Praha – Uhříněves", popis specializací, 3 CTA tlačítka (Objednat termín, WhatsApp, Zavolat), trust chips (Rychlá diagnostika, GO/repas, 3D geometrie, Klimatizace)
2. **Služby grid**: karty služeb (8 kategorií) s ikonkami, krátkým popisem, štítky, tlačítky Detail + WhatsApp
3. **Jak probíhá první kontakt**: 3 kroky (Chat/WhatsApp → Popis problému + fotka → Domluva termínu)
4. **Fotogalerie**: masonry grid s lightboxem, kategorie chipy, CTA „Zobrazit více"
5. **Rezervační formulář**: jméno, telefon, značka, model, problém, termín – odeslání e-mailem + nabídka „Poslat i na WhatsApp"
6. **Kontakt teaser**: adresa, telefon, WhatsApp, mini mapa, CTA „Trasa v Google Maps"

---

## Fáze 2: Stránky služeb

### /sluzby – Seznam služeb
- Nadpis + úvodní text
- Filtry/štítky (Převodovky, Motory, Diagnostika, Geometrie, Klimatizace, Karoserie, Kódování, Podvozky)
- Karty služeb s fotkou, popisem, tlačítky „Detail" a „WhatsApp dotaz"

### /sluzby/[slug] – Detail služby
- Hero image s overlayem + název služby
- Popis (2–3 odstavce), „Co umíme" bullet list, Časté dotazy (3–6)
- Galerie fotek
- Sticky CTA panel (Zavolat, WhatsApp, Objednat termín)
- Mini formulář „Rychlá poptávka"

### Data služeb
- Strukturovaný JSON se všemi 8 kategoriemi a podslužbami (slug, popis, tagy, galerie)
- Všechny texty v češtině, bez lorem ipsum

---

## Fáze 3: Kontakt + Image Converter

### /kontakt
- Nadpis, adresa Praha – Uhříněves
- Velká tlačítka Telefon + WhatsApp
- Google Maps embed + „Otevřít v Google Maps"
- Otevírací doba (placeholder)

### /converter – Image Converter
- Landing hero: „Image Converter – WebP + zmenšení + ZIP"
- Tool karta: drag & drop upload, slider kvalita, max rozměry, tlačítko Convert, progress, výsledky, Download ZIP
- Klientská konverze (Canvas API, bez backendu)
- CTA propojení na autoservis

---

## Fáze 4: Chat widget + E-mail backend

### Chat widget (vpravo dole na každé stránce)
- Tmavý minimalistický design se žlutými akcenty
- Postupné otázky: značka → model → problém → fotka (volitelná)
- Souhrn + CTA „Odeslat na WhatsApp" (předvyplněná zpráva)
- Bez účtů, bez přihlašování

### E-mail odesílání formulářů
- Supabase edge function + Resend API pro odesílání poptávek e-mailem
- Validace vstupů (zod)
- Po odeslání: potvrzení + možnost „Poslat i na WhatsApp"

---

## Fáze 5: Vícejazyčnost (UA) + SEO

### Ukrajinská verze
- URL prefix `/ua/...` pro všechny stránky
- Kompletní překlady: navigace, CTA, formuláře, chatbot, texty služeb, SEO
- Přepínač jazyka v headeru (CZ | UA)

### SEO optimalizace
- Meta title + description pro každou stránku (CZ + UA)
- Open Graph tagy (název, popis, preview image)
- JSON-LD schema (LocalBusiness/AutoRepair) – adresa, telefon, služby
- Optimalizace pro klíčové fráze: „autoservis Uhříněves", „repas převodovky Praha" atd.
- Lazy-load galerie, optimalizované obrázky

---

## Technická poznámka
- Projekt běží na **React + Vite + Tailwind** (Lovable nepodporuje Next.js)
- Routing: React Router s podporou `/ua/` prefixu
- SEO meta tagy: react-helmet-async
- Backend: Lovable Cloud (Supabase) pro edge functions (e-mail odesílání)
- Kontaktní údaje: zatím placeholder, nahradíte reálnými čísly později

