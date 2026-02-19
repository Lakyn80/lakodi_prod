type LocalizedText = { cs: string; ua: string };
type LocalizedLines = { cs: string[]; ua: string[] };

const localized = (text: string): LocalizedText => ({ cs: text, ua: text });
const localizedLines = (...lines: string[]): LocalizedLines => ({ cs: lines, ua: lines });

export interface ServiceItem {
  id: string;
  title: LocalizedText;
  description: LocalizedLines;
  priceRange: LocalizedText;
  gallery: string[];
}

export interface Service {
  id: string;
  slug: string;
  iconName: string;
  title: LocalizedText;
  shortDesc: LocalizedText;
  intro: LocalizedText;
  pricingNote: LocalizedText;
  tags: string[];
  items: ServiceItem[];
}

export const services: Service[] = [
  {
    id: "prevodovky",
    slug: "prevodovky",
    iconName: "Settings2",
    title: { cs: "Převodovky", ua: "Коробки передач" },
    shortDesc: {
      cs: "Generální opravy a repasy automatických i manuálních převodovek všech značek.",
      ua: "Капітальний ремонт автоматичних та механічних коробок передач усіх марок.",
    },
    intro: localized(
      "Specializujeme se na kompletní opravy převodovek včetně diagnostiky, repasu i generálních oprav."
    ),
    pricingNote: localized(
      "Uvedené ceny jsou orientační bez ceny dílů specifických pro konkrétní vozidlo."
    ),
    tags: ["GO", "Repas", "Automat", "Manuál"],
    items: [
      {
        id: "go-prevodovky",
        title: localized("Generální oprava (GO) převodovky"),
        description: localizedLines(
          "Kompletní rozebrání převodovky, kontrola všech mechanických i elektronických částí a výměna opotřebených dílů.",
          "Součástí je kontrola ozubených kol, ložisek, synchronů, mechatroniky (u automatů), těsnění a olejového systému.",
          "Vhodné při prokluzování, cukání, hlučnosti nebo úplné nefunkčnosti převodovky."
        ),
        priceRange: localized("Orientačně 35 000 až 95 000 Kč"),
        gallery: [
          "/services/prevodovky/repas-automat-01.webp",
          "/services/prevodovky/repas-automat-02.webp",
          "/services/prevodovky/repas-automat-03.webp",
        ],
      },
      {
        id: "repas-prevodovky",
        title: localized("Repas převodovky"),
        description: localizedLines(
          "Částečná oprava zaměřená na konkrétní závadu.",
          "Výměna poškozených dílů bez kompletní demontáže všech částí.",
          "Cenově úspornější varianta oproti generální opravě."
        ),
        priceRange: localized("Orientačně 15 000 až 45 000 Kč"),
        gallery: [
          "/services/prevodovky/repas-automat-01.webp",
          "/services/prevodovky/repas-automat-02.webp",
          "/services/prevodovky/repas-automat-03.webp",
          "/services/prevodovky/repas-automat-04.webp",
        ],
      },
      {
        id: "automaticke-prevodovky",
        title: localized("Automatické převodovky"),
        description: localizedLines(
          "Diagnostika a opravy mechatroniky.",
          "Výměna oleje, opravy hydroměniče, řešení prokluzu a chybových hlášení."
        ),
        priceRange: localized("Orientačně 4 000 až 65 000 Kč"),
        gallery: [
          "/services/prevodovky/repas-automat-01.webp",
          "/services/prevodovky/repas-automat-02.webp",
          "/services/prevodovky/repas-automat-03.webp",
          "/services/prevodovky/repas-automat-04.webp",
        ],
      },
      {
        id: "manualni-prevodovky",
        title: localized("Manuální převodovky"),
        description: localizedLines(
          "Výměna synchronů, ložisek a spojkových mechanismů.",
          "Řešení hlučnosti a problémů se špatným řazením."
        ),
        priceRange: localized("Orientačně 6 000 až 35 000 Kč"),
        gallery: ["/placeholder.svg", "/placeholder.svg", "/placeholder.svg"],
      },
    ],
  },
  {
    id: "motory",
    slug: "motory",
    iconName: "Gauge",
    title: { cs: "Motory", ua: "Двигуни" },
    shortDesc: {
      cs: "Generální opravy a repasy motorů – benzín, diesel, hybrid.",
      ua: "Капітальний ремонт двигунів – бензин, дизель, гібрид.",
    },
    intro: localized(
      "Provádíme diagnostiku a opravy motorů od dílčích repasí až po kompletní generální opravy."
    ),
    pricingNote: localized(
      "Orientační ceny se liší podle typu motoru, rozsahu poškození a dostupnosti dílů."
    ),
    tags: ["GO", "Repas", "Benzín", "Diesel"],
    items: [
      {
        id: "go-motoru",
        title: localized("Generální oprava (GO) motoru"),
        description: localizedLines(
          "Kompletní rozebrání motoru, kontrola bloku a hlavy válců, výměna pístních kroužků, ložisek klikové hřídele, ventilů a těsnění.",
          "Zahrnuje výbrus válců, broušení kliky a kompletní seřízení.",
          "Určeno při vysoké spotřebě oleje, ztrátě výkonu nebo zadření motoru."
        ),
        priceRange: localized("Orientačně 45 000 až 140 000 Kč"),
        gallery: [
          "/services/motory/go-motoru-01.webp",
          "/services/motory/go-motoru-02.webp",
          "/services/motory/go-motoru-03.webp",
          "/services/motory/go-motoru-04.webp",
          "/services/motory/go-motoru-05.webp",
          "/services/motory/go-motoru-06.webp",
          "/services/motory/go-motoru-07.webp",
          "/services/motory/go-motoru-08.webp",
          "/services/motory/go-motoru-09.webp",
          "/services/motory/go-motoru-10.webp",
          "/services/motory/go-motoru-11.webp",
          "/services/motory/go-motoru-12.webp",
          "/services/motory/go-motoru-13.webp",
          "/services/motory/go-motoru-14.webp",
          "/services/motory/go-motoru-15.webp",
        ],
      },
      {
        id: "repas-motoru",
        title: localized("Repas motoru"),
        description: localizedLines(
          "Oprava konkrétní části motoru bez kompletní generální opravy.",
          "Nejčastěji hlava válců, rozvody nebo turbo."
        ),
        priceRange: localized("Orientačně 12 000 až 60 000 Kč"),
        gallery: ["/services/motory/repas-motoru-01.webp", "/services/motory/repas-motoru-02.webp"],
      },
      {
        id: "benzinove-motory",
        title: localized("Benzínové motory"),
        description: localizedLines(
          "Diagnostika vstřikování, zapalování a rozvodů.",
          "Řešení ztráty výkonu, nestabilního chodu a zvýšené spotřeby."
        ),
        priceRange: localized("Orientačně 2 000 až 35 000 Kč"),
        gallery: ["/placeholder.svg", "/placeholder.svg", "/placeholder.svg"],
      },
      {
        id: "dieselove-motory",
        title: localized("Dieselové motory"),
        description: localizedLines(
          "Opravy vstřikovačů, čerpadel a turbodmychadel.",
          "Servis DPF filtrů a systémů EGR."
        ),
        priceRange: localized("Orientačně 3 500 až 50 000 Kč"),
        gallery: ["/services/motory/repas-motoru-01.webp", "/services/motory/repas-motoru-02.webp"],
      },
    ],
  },
  {
    id: "autoelektrika",
    slug: "autoelektrika-diagnostika",
    iconName: "Zap",
    title: { cs: "Autoelektrika a diagnostika", ua: "Автоелектрика та діагностика" },
    shortDesc: {
      cs: "Profesionální diagnostika všech značek, opravy autoelektriky a online diagnostika.",
      ua: "Професійна діагностика всіх марок, ремонт автоелектрики та онлайн діагностика.",
    },
    intro: localized(
      "Řešíme elektronické závady od základní diagnostiky po složité zásahy do elektroinstalace."
    ),
    pricingNote: localized("Cena se odvíjí od rozsahu měření a náročnosti konkrétní opravy."),
    tags: ["Diagnostika", "Elektrika", "Online"],
    items: [
      {
        id: "diagnostika",
        title: localized("Diagnostika"),
        description: localizedLines(
          "Moderní diagnostické zařízení pro všechny značky vozidel.",
          "Čtení a mazání chybových kódů, testování řídicích jednotek."
        ),
        priceRange: localized("Orientačně 800 až 2 500 Kč"),
        gallery: ["/placeholder.svg", "/placeholder.svg", "/placeholder.svg"],
      },
      {
        id: "autoelektrika",
        title: localized("Autoelektrika"),
        description: localizedLines(
          "Opravy kabeláže, alternátorů, startérů, světel, baterií a dalších elektrických systémů."
        ),
        priceRange: localized("Orientačně 1 200 až 25 000 Kč"),
        gallery: ["/placeholder.svg", "/placeholder.svg", "/placeholder.svg"],
      },
      {
        id: "online-diagnostika",
        title: localized("Online diagnostika"),
        description: localizedLines(
          "Aktualizace softwaru a řešení elektronických problémů pomocí přímého připojení k výrobcům."
        ),
        priceRange: localized("Orientačně 1 500 až 7 000 Kč"),
        gallery: ["/placeholder.svg", "/placeholder.svg", "/placeholder.svg"],
      },
    ],
  },
  {
    id: "kodovani",
    slug: "kodovani",
    iconName: "KeyRound",
    title: { cs: "Kódování", ua: "Кодування" },
    shortDesc: {
      cs: "Kódování klíčů a řídicích jednotek pro všechny typy vozidel.",
      ua: "Кодування ключів та блоків керування для всіх типів автомобілів.",
    },
    intro: localized(
      "Zajišťujeme programování klíčů i kódování řídicích jednotek po výměně nebo opravě dílů."
    ),
    pricingNote: localized("Cena závisí na značce vozidla, typu jednotky a zabezpečení."),
    tags: ["Klíče", "Řídicí jednotky"],
    items: [
      {
        id: "kodovani-klicu",
        title: localized("Kódování klíčů"),
        description: localizedLines(
          "Programování nových klíčů a dálkových ovladačů, párování s vozidlem."
        ),
        priceRange: localized("Orientačně 2 000 až 9 000 Kč"),
        gallery: ["/placeholder.svg", "/placeholder.svg", "/placeholder.svg"],
      },
      {
        id: "ridici-jednotky",
        title: localized("Řídicí jednotky"),
        description: localizedLines(
          "Kódování a přizpůsobení řídicích jednotek po výměně dílu nebo opravě."
        ),
        priceRange: localized("Orientačně 2 500 až 15 000 Kč"),
        gallery: ["/placeholder.svg", "/placeholder.svg", "/placeholder.svg"],
      },
    ],
  },
  {
    id: "podvozky",
    slug: "podvozky",
    iconName: "Disc",
    title: { cs: "Podvozky", ua: "Підвіска" },
    shortDesc: {
      cs: "Opravy a údržba podvozků, výměna tlumičů, ramen a dalších dílů.",
      ua: "Ремонт та обслуговування підвіски, заміна амортизаторів та інших деталей.",
    },
    intro: localized(
      "Kontrolujeme a opravujeme podvozek tak, aby auto bylo bezpečné a stabilní při každé jízdě."
    ),
    pricingNote: localized("Přesná cena se stanoví po kontrole vůlí a stavu jednotlivých dílů."),
    tags: ["Opravy", "Tlumiče", "Ramena"],
    items: [
      {
        id: "opravy-podvozku",
        title: localized("Opravy podvozku"),
        description: localizedLines(
          "Kompletní kontrola a oprava náprav, čepů, silentbloků a stabilizačních prvků."
        ),
        priceRange: localized("Orientačně 2 000 až 30 000 Kč"),
        gallery: ["/placeholder.svg", "/placeholder.svg", "/placeholder.svg"],
      },
      {
        id: "tlumice",
        title: localized("Tlumiče"),
        description: localizedLines(
          "Výměna tlumičů a pružin pro bezpečnou a stabilní jízdu."
        ),
        priceRange: localized("Orientačně 4 000 až 20 000 Kč"),
        gallery: ["/placeholder.svg", "/placeholder.svg", "/placeholder.svg"],
      },
      {
        id: "ramena",
        title: localized("Ramena"),
        description: localizedLines(
          "Výměna ramen náprav a dalších mechanických částí podvozku."
        ),
        priceRange: localized("Orientačně 3 500 až 18 000 Kč"),
        gallery: ["/placeholder.svg", "/placeholder.svg", "/placeholder.svg"],
      },
    ],
  },
  {
    id: "geometrie",
    slug: "geometrie",
    iconName: "Target",
    title: { cs: "3D Geometrie", ua: "3D Розвал-сходження" },
    shortDesc: {
      cs: "Přesné nastavení geometrie kol na moderním 3D zařízení.",
      ua: "Точне налаштування геометрії коліс на сучасному 3D обладнанні.",
    },
    intro: localized(
      "Přesné 3D měření geometrie zlepšuje stabilitu vozu a prodlužuje životnost pneumatik."
    ),
    pricingNote: localized("Cena závisí na typu nápravy a rozsahu nutného seřízení."),
    tags: ["3D", "Geometrie"],
    items: [
      {
        id: "3d-nastaveni-geometrie-kol",
        title: localized("3D nastavení geometrie kol"),
        description: localizedLines(
          "Přesné měření a nastavení sbíhavosti, odklonu a záklonu kol pomocí moderní 3D technologie.",
          "Zajišťuje rovnoměrné opotřebení pneumatik a stabilní jízdní vlastnosti."
        ),
        priceRange: localized("Orientačně 1 200 až 2 500 Kč"),
        gallery: ["/placeholder.svg", "/placeholder.svg", "/placeholder.svg"],
      },
    ],
  },
  {
    id: "klimatizace",
    slug: "klimatizace",
    iconName: "Snowflake",
    title: { cs: "Klimatizace", ua: "Кондиціонери" },
    shortDesc: {
      cs: "Kompletní servis autoklimatizací – plnění, čištění, opravy.",
      ua: "Повний сервіс автокондиціонерів – заправка, чистка, ремонт.",
    },
    intro: localized(
      "Servis klimatizace od běžného plnění až po opravy kompresorů a těsnění celého systému."
    ),
    pricingNote: localized(
      "Orientační ceny se liší podle typu chladiva a rozsahu nutné opravy."
    ),
    tags: ["Plnění", "Servis", "Opravy"],
    items: [
      {
        id: "plneni-klimatizace",
        title: localized("Plnění klimatizace"),
        description: localizedLines(
          "Doplnění chladiva a kontrola tlaku systému."
        ),
        priceRange: localized("Orientačně 1 200 až 2 500 Kč"),
        gallery: ["/placeholder.svg", "/placeholder.svg", "/placeholder.svg"],
      },
      {
        id: "servis-klimatizace",
        title: localized("Servis klimatizace"),
        description: localizedLines(
          "Čištění, dezinfekce a kontrola těsnosti systému."
        ),
        priceRange: localized("Orientačně 1 500 až 4 500 Kč"),
        gallery: ["/placeholder.svg", "/placeholder.svg", "/placeholder.svg"],
      },
      {
        id: "opravy-klimatizace",
        title: localized("Opravy klimatizace"),
        description: localizedLines(
          "Opravy kompresorů, výměníků, ventilů a dalších součástí klimatizačního systému."
        ),
        priceRange: localized("Orientačně 3 000 až 25 000 Kč"),
        gallery: ["/placeholder.svg", "/placeholder.svg", "/placeholder.svg"],
      },
    ],
  },
  {
    id: "karoserie",
    slug: "karoserie-lakovani",
    iconName: "Paintbrush",
    title: { cs: "Karosářské a lakýrnické práce", ua: "Кузовні та малярні роботи" },
    shortDesc: {
      cs: "Opravy karoserií, rovnání, svařování, lakování a leštění.",
      ua: "Ремонт кузова, рихтування, зварювання, фарбування та полірування.",
    },
    intro: localized(
      "Provádíme opravy po nehodách i estetické zásahy včetně lakování a profesionálního leštění."
    ),
    pricingNote: localized(
      "Konečná cena závisí na velikosti poškození a použité lakovací technologii."
    ),
    tags: ["Karoserie", "Lakování", "Leštění"],
    items: [
      {
        id: "karoserie",
        title: localized("Karoserie"),
        description: localizedLines(
          "Opravy po nehodách, rovnání deformovaných částí, svařování a výměna dílů."
        ),
        priceRange: localized("Orientačně 4 000 až 80 000 Kč"),
        gallery: [
          "/services/karoserie-lakovani/renovace-mercedes-01.webp",
          "/services/karoserie-lakovani/renovace-mercedes-02.webp",
          "/services/karoserie-lakovani/renovace-mercedes-03.webp",
          "/services/karoserie-lakovani/renovace-mercedes-04.webp",
        ],
      },
      {
        id: "lakovani",
        title: localized("Lakování"),
        description: localizedLines(
          "Lokální i celkové lakování vozidla, opravy škrábanců a poškození laku."
        ),
        priceRange: localized("Orientačně 2 500 až 70 000 Kč"),
        gallery: [
          "/services/karoserie-lakovani/renovace-mercedes-05.webp",
          "/services/karoserie-lakovani/renovace-mercedes-06.webp",
          "/services/karoserie-lakovani/renovace-mercedes-07.webp",
          "/services/karoserie-lakovani/renovace-mercedes-08.webp",
        ],
      },
      {
        id: "lesteni",
        title: localized("Leštění"),
        description: localizedLines(
          "Profesionální leštění laku pro obnovení lesku a odstranění drobných vad."
        ),
        priceRange: localized("Orientačně 1 500 až 8 000 Kč"),
        gallery: [
          "/services/karoserie-lakovani/renovace-mercedes-09.webp",
          "/services/karoserie-lakovani/renovace-mercedes-10.webp",
          "/services/karoserie-lakovani/renovace-mercedes-11.webp",
          "/services/karoserie-lakovani/renovace-mercedes-12.webp",
        ],
      },
    ],
  },
];

export function getServiceBySlug(slug: string) {
  return services.find((service) => service.slug === slug);
}
