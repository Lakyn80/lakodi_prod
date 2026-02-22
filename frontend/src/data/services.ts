type LanguageKey = "cs" | "ua" | "ru" | "en";
type LocalizedText = Record<LanguageKey, string>;
type LocalizedLines = Record<LanguageKey, string[]>;

const localized = (cs: string, ua: string, ru: string, en: string): LocalizedText => ({
  cs,
  ua,
  ru,
  en,
});

const localizedLines = (
  cs: string[],
  ua: string[],
  ru: string[],
  en: string[]
): LocalizedLines => ({
  cs,
  ua,
  ru,
  en,
});

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
    title: localized("Převodovky", "Коробки передач", "Коробки передач", "Gearboxes"),
    shortDesc: localized(
      "Generální opravy a repasy automatických i manuálních převodovek všech značek.",
      "Капітальний ремонт автоматичних та механічних коробок передач усіх марок.",
      "Капитальный ремонт автоматических и механических коробок передач всех марок.",
      "Complete overhauls and rebuilds of automatic and manual gearboxes for all brands."
    ),
    intro: localized(
      "Specializujeme se na kompletní opravy převodovek včetně diagnostiky, repasu i generálních oprav.",
      "Спеціалізуємося на комплексному ремонті коробок передач: діагностика, частковий ремонт і капітальний ремонт.",
      "Специализируемся на комплексном ремонте коробок передач: диагностика, частичный ремонт и капитальный ремонт.",
      "We specialize in full gearbox repairs including diagnostics, rebuilds and complete overhauls."
    ),
    pricingNote: localized(
      "Uvedené ceny jsou orientační bez ceny dílů specifických pro konkrétní vozidlo.",
      "Вказані ціни орієнтовні та не включають вартість деталей для конкретного авто.",
      "Указанные цены ориентировочные и не включают стоимость деталей для конкретного авто.",
      "Prices are indicative and do not include parts specific to your vehicle."
    ),
    tags: ["GO", "Repas", "Automat", "Manuál"],
    items: [
      {
        id: "go-prevodovky",
        title: localized(
          "Generální oprava (GO) převodovky",
          "Капітальний ремонт коробки передач",
          "Капитальный ремонт коробки передач",
          "Complete gearbox overhaul"
        ),
        description: localizedLines(
          [
            "Kompletní rozebrání převodovky, kontrola všech mechanických i elektronických částí a výměna opotřebených dílů.",
            "Součástí je kontrola ozubených kol, ložisek, synchronů, mechatroniky (u automatů), těsnění a olejového systému.",
            "Vhodné při prokluzování, cukání, hlučnosti nebo úplné nefunkčnosti převodovky.",
          ],
          [
            "Повне розбирання коробки передач, перевірка всіх механічних і електронних вузлів та заміна зношених деталей.",
            "Включає перевірку шестерень, підшипників, синхронізаторів, мехатроніки (для автоматів), ущільнень і масляної системи.",
            "Рекомендується при пробуксовці, ривках, шумі або повній несправності коробки.",
          ],
          [
            "Полная разборка коробки передач, проверка всех механических и электронных узлов и замена изношенных деталей.",
            "Включает проверку шестерен, подшипников, синхронизаторов, мехатроники (для автоматов), уплотнений и масляной системы.",
            "Рекомендуется при пробуксовке, рывках, шуме или полной неисправности коробки.",
          ],
          [
            "Complete gearbox disassembly, inspection of all mechanical and electronic components, and replacement of worn parts.",
            "Includes inspection of gears, bearings, synchronizers, mechatronics (for automatics), seals and lubrication system.",
            "Recommended for slipping, jerking, noise, or complete gearbox failure.",
          ]
        ),
        priceRange: localized(
          "Orientačně 35 000 až 95 000 Kč",
          "Орієнтовно 35 000 - 95 000 Kč",
          "Ориентировочно 35 000 - 95 000 Kč",
          "Approx. CZK 35,000-95,000"
        ),
        gallery: [
          "/services/prevodovky/repas-automat-01.webp",
          "/services/prevodovky/repas-automat-02.webp",
          "/services/prevodovky/repas-automat-03.webp",
        ],
      },
      {
        id: "repas-prevodovky",
        title: localized(
          "Repas převodovky",
          "Частковий ремонт коробки передач",
          "Частичный ремонт коробки передач",
          "Gearbox rebuild"
        ),
        description: localizedLines(
          [
            "Částečná oprava zaměřená na konkrétní závadu.",
            "Výměna poškozených dílů bez kompletní demontáže všech částí.",
            "Cenově úspornější varianta oproti generální opravě.",
          ],
          [
            "Частковий ремонт, спрямований на конкретну несправність.",
            "Заміна пошкоджених деталей без повного розбирання всіх вузлів.",
            "Економніший варіант у порівнянні з капітальним ремонтом.",
          ],
          [
            "Частичный ремонт, ориентированный на конкретную неисправность.",
            "Замена поврежденных деталей без полной разборки всех узлов.",
            "Более экономичный вариант по сравнению с капитальным ремонтом.",
          ],
          [
            "Partial repair focused on a specific fault.",
            "Replacement of damaged parts without full disassembly of all components.",
            "A more cost-effective option than a complete overhaul.",
          ]
        ),
        priceRange: localized(
          "Orientačně 15 000 až 45 000 Kč",
          "Орієнтовно 15 000 - 45 000 Kč",
          "Ориентировочно 15 000 - 45 000 Kč",
          "Approx. CZK 15,000-45,000"
        ),
        gallery: [
          "/services/prevodovky/repas-automat-01.webp",
          "/services/prevodovky/repas-automat-02.webp",
          "/services/prevodovky/repas-automat-03.webp",
          "/services/prevodovky/repas-automat-04.webp",
        ],
      },
      {
        id: "automaticke-prevodovky",
        title: localized(
          "Automatické převodovky",
          "Автоматичні коробки передач",
          "Автоматические коробки передач",
          "Automatic gearboxes"
        ),
        description: localizedLines(
          [
            "Diagnostika a opravy mechatroniky.",
            "Výměna oleje, opravy hydroměniče, řešení prokluzu a chybových hlášení.",
          ],
          [
            "Діагностика та ремонт мехатроніки.",
            "Заміна оливи, ремонт гідротрансформатора, усунення пробуксовок і помилок.",
          ],
          [
            "Диагностика и ремонт мехатроники.",
            "Замена масла, ремонт гидротрансформатора, устранение пробуксовок и ошибок.",
          ],
          [
            "Mechatronics diagnostics and repairs.",
            "Fluid service, torque converter repair, and troubleshooting of slipping and fault codes.",
          ]
        ),
        priceRange: localized(
          "Orientačně 4 000 až 65 000 Kč",
          "Орієнтовно 4 000 - 65 000 Kč",
          "Ориентировочно 4 000 - 65 000 Kč",
          "Approx. CZK 4,000-65,000"
        ),
        gallery: [
          "/services/prevodovky/repas-automat-01.webp",
          "/services/prevodovky/repas-automat-02.webp",
          "/services/prevodovky/repas-automat-03.webp",
          "/services/prevodovky/repas-automat-04.webp",
        ],
      },
      {
        id: "manualni-prevodovky",
        title: localized(
          "Manuální převodovky",
          "Механічні коробки передач",
          "Механические коробки передач",
          "Manual gearboxes"
        ),
        description: localizedLines(
          [
            "Výměna synchronů, ložisek a spojkových mechanismů.",
            "Řešení hlučnosti a problémů se špatným řazením.",
          ],
          [
            "Заміна синхронізаторів, підшипників і елементів зчеплення.",
            "Усунення шуму та проблем із перемиканням передач.",
          ],
          [
            "Замена синхронизаторов, подшипников и элементов сцепления.",
            "Устранение шума и проблем с переключением передач.",
          ],
          [
            "Replacement of synchronizers, bearings and clutch-related components.",
            "Fixing noise and poor shifting performance.",
          ]
        ),
        priceRange: localized(
          "Orientačně 6 000 až 35 000 Kč",
          "Орієнтовно 6 000 - 35 000 Kč",
          "Ориентировочно 6 000 - 35 000 Kč",
          "Approx. CZK 6,000-35,000"
        ),
        gallery: ["/placeholder.svg", "/placeholder.svg", "/placeholder.svg"],
      },
    ],
  },
  {
    id: "motory",
    slug: "motory",
    iconName: "Gauge",
    title: localized("Motory", "Двигуни", "Двигатели", "Engines"),
    shortDesc: localized(
      "Generální opravy a repasy motorů – benzín, diesel, hybrid.",
      "Капітальний ремонт двигунів – бензин, дизель, гібрид.",
      "Капитальный ремонт двигателей - бензин, дизель, гибрид.",
      "Complete engine overhauls and rebuilds - petrol, diesel, hybrid."
    ),
    intro: localized(
      "Provádíme diagnostiku a opravy motorů od dílčích repasí až po kompletní generální opravy.",
      "Проводимо діагностику та ремонт двигунів від часткового ремонту до повного капітального ремонту.",
      "Выполняем диагностику и ремонт двигателей: от частичных работ до полного капитального ремонта.",
      "We provide engine diagnostics and repairs from partial rebuilds to complete overhauls."
    ),
    pricingNote: localized(
      "Orientační ceny se liší podle typu motoru, rozsahu poškození a dostupnosti dílů.",
      "Орієнтовні ціни залежать від типу двигуна, масштабу пошкодження та доступності запчастин.",
      "Ориентировочные цены зависят от типа двигателя, объема повреждений и доступности запчастей.",
      "Indicative prices vary by engine type, damage scope and parts availability."
    ),
    tags: ["GO", "Repas", "Benzín", "Diesel"],
    items: [
      {
        id: "go-motoru",
        title: localized(
          "Generální oprava (GO) motoru",
          "Капітальний ремонт двигуна",
          "Капитальный ремонт двигателя",
          "Complete engine overhaul"
        ),
        description: localizedLines(
          [
            "Kompletní rozebrání motoru, kontrola bloku a hlavy válců, výměna pístních kroužků, ložisek klikové hřídele, ventilů a těsnění.",
            "Zahrnuje výbrus válců, broušení kliky a kompletní seřízení.",
            "Určeno při vysoké spotřebě oleje, ztrátě výkonu nebo zadření motoru.",
          ],
          [
            "Повне розбирання двигуна, перевірка блоку та головки, заміна поршневих кілець, вкладишів, клапанів і ущільнень.",
            "Включає розточування циліндрів, шліфування колінвала та повне налаштування.",
            "Рекомендовано при великій витраті оливи, втраті потужності або заклинюванні двигуна.",
          ],
          [
            "Полная разборка двигателя, проверка блока и головки, замена поршневых колец, вкладышей, клапанов и уплотнений.",
            "Включает расточку цилиндров, шлифовку коленвала и полную настройку.",
            "Рекомендуется при высоком расходе масла, потере мощности или заклинивании двигателя.",
          ],
          [
            "Complete engine teardown, inspection of block and cylinder head, replacement of piston rings, crankshaft bearings, valves and seals.",
            "Includes cylinder honing/boring, crankshaft grinding and full adjustment.",
            "Recommended for high oil consumption, power loss, or seized engine.",
          ]
        ),
        priceRange: localized(
          "Orientačně 45 000 až 140 000 Kč",
          "Орієнтовно 45 000 - 140 000 Kč",
          "Ориентировочно 45 000 - 140 000 Kč",
          "Approx. CZK 45,000-140,000"
        ),
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
        title: localized("Repas motoru", "Частковий ремонт двигуна", "Частичный ремонт двигателя", "Engine rebuild"),
        description: localizedLines(
          [
            "Oprava konkrétní části motoru bez kompletní generální opravy.",
            "Nejčastěji hlava válců, rozvody nebo turbo.",
          ],
          [
            "Ремонт конкретної частини двигуна без повного капремонту.",
            "Найчастіше: головка блока, ГРМ або турбіна.",
          ],
          [
            "Ремонт конкретной части двигателя без полного капремонта.",
            "Чаще всего: головка блока, ГРМ или турбина.",
          ],
          [
            "Repair of a specific engine section without a full overhaul.",
            "Most often cylinder head, timing system, or turbo.",
          ]
        ),
        priceRange: localized(
          "Orientačně 12 000 až 60 000 Kč",
          "Орієнтовно 12 000 - 60 000 Kč",
          "Ориентировочно 12 000 - 60 000 Kč",
          "Approx. CZK 12,000-60,000"
        ),
        gallery: ["/services/motory/repas-motoru-01.webp", "/services/motory/repas-motoru-02.webp"],
      },
      {
        id: "benzinove-motory",
        title: localized("Benzínové motory", "Бензинові двигуни", "Бензиновые двигатели", "Petrol engines"),
        description: localizedLines(
          [
            "Diagnostika vstřikování, zapalování a rozvodů.",
            "Řešení ztráty výkonu, nestabilního chodu a zvýšené spotřeby.",
          ],
          [
            "Діагностика системи впорскування, запалювання та ГРМ.",
            "Усунення втрати потужності, нестабільної роботи та підвищеної витрати.",
          ],
          [
            "Диагностика системы впрыска, зажигания и ГРМ.",
            "Устранение потери мощности, нестабильной работы и повышенного расхода.",
          ],
          [
            "Diagnostics of injection, ignition and timing systems.",
            "Fixing power loss, unstable running and increased fuel consumption.",
          ]
        ),
        priceRange: localized(
          "Orientačně 2 000 až 35 000 Kč",
          "Орієнтовно 2 000 - 35 000 Kč",
          "Ориентировочно 2 000 - 35 000 Kč",
          "Approx. CZK 2,000-35,000"
        ),
        gallery: ["/placeholder.svg", "/placeholder.svg", "/placeholder.svg"],
      },
      {
        id: "dieselove-motory",
        title: localized("Dieselové motory", "Дизельні двигуни", "Дизельные двигатели", "Diesel engines"),
        description: localizedLines(
          [
            "Opravy vstřikovačů, čerpadel a turbodmychadel.",
            "Servis DPF filtrů a systémů EGR.",
          ],
          [
            "Ремонт форсунок, паливних насосів і турбокомпресорів.",
            "Обслуговування DPF-фільтрів і систем EGR.",
          ],
          [
            "Ремонт форсунок, топливных насосов и турбокомпрессоров.",
            "Обслуживание DPF-фильтров и систем EGR.",
          ],
          [
            "Repairs of injectors, pumps and turbochargers.",
            "Service of DPF filters and EGR systems.",
          ]
        ),
        priceRange: localized(
          "Orientačně 3 500 až 50 000 Kč",
          "Орієнтовно 3 500 - 50 000 Kč",
          "Ориентировочно 3 500 - 50 000 Kč",
          "Approx. CZK 3,500-50,000"
        ),
        gallery: ["/services/motory/repas-motoru-01.webp", "/services/motory/repas-motoru-02.webp"],
      },
    ],
  },
  {
    id: "autoelektrika",
    slug: "autoelektrika-diagnostika",
    iconName: "Zap",
    title: localized(
      "Autoelektrika a diagnostika",
      "Автоелектрика та діагностика",
      "Автоэлектрика и диагностика",
      "Auto electrics and diagnostics"
    ),
    shortDesc: localized(
      "Profesionální diagnostika všech značek, opravy autoelektriky a online diagnostika.",
      "Професійна діагностика всіх марок, ремонт автоелектрики та онлайн діагностика.",
      "Профессиональная диагностика всех марок, ремонт автоэлектрики и онлайн-диагностика.",
      "Professional diagnostics for all brands, auto electrical repairs and online diagnostics."
    ),
    intro: localized(
      "Řešíme elektronické závady od základní diagnostiky po složité zásahy do elektroinstalace.",
      "Усуваємо електронні несправності від базової діагностики до складного ремонту електропроводки.",
      "Устраняем электронные неисправности от базовой диагностики до сложного ремонта проводки.",
      "We resolve electronic faults from basic diagnostics to complex wiring repairs."
    ),
    pricingNote: localized(
      "Cena se odvíjí od rozsahu měření a náročnosti konkrétní opravy.",
      "Ціна залежить від обсягу перевірки та складності ремонту.",
      "Цена зависит от объема проверки и сложности ремонта.",
      "Pricing depends on diagnostic scope and repair complexity."
    ),
    tags: ["Diagnostika", "Elektrika", "Online"],
    items: [
      {
        id: "diagnostika",
        title: localized("Diagnostika", "Діагностика", "Диагностика", "Diagnostics"),
        description: localizedLines(
          [
            "Moderní diagnostické zařízení pro všechny značky vozidel.",
            "Čtení a mazání chybových kódů, testování řídicích jednotek.",
          ],
          [
            "Сучасне діагностичне обладнання для всіх марок авто.",
            "Зчитування й видалення кодів помилок, тест блоків керування.",
          ],
          [
            "Современное диагностическое оборудование для всех марок авто.",
            "Считывание и удаление кодов ошибок, тест блоков управления.",
          ],
          [
            "Modern diagnostic equipment for all vehicle brands.",
            "Reading and clearing fault codes, control unit testing.",
          ]
        ),
        priceRange: localized(
          "Orientačně 800 až 2 500 Kč",
          "Орієнтовно 800 - 2 500 Kč",
          "Ориентировочно 800 - 2 500 Kč",
          "Approx. CZK 800-2,500"
        ),
        gallery: ["/placeholder.svg", "/placeholder.svg", "/placeholder.svg"],
      },
      {
        id: "autoelektrika",
        title: localized("Autoelektrika", "Автоелектрика", "Автоэлектрика", "Auto electrics"),
        description: localizedLines(
          ["Opravy kabeláže, alternátorů, startérů, světel, baterií a dalších elektrických systémů."],
          ["Ремонт проводки, генераторів, стартерів, освітлення, акумуляторів та інших електросистем."],
          ["Ремонт проводки, генераторов, стартеров, освещения, аккумуляторов и других электросистем."],
          ["Repairs of wiring, alternators, starters, lights, batteries and other electrical systems."]
        ),
        priceRange: localized(
          "Orientačně 1 200 až 25 000 Kč",
          "Орієнтовно 1 200 - 25 000 Kč",
          "Ориентировочно 1 200 - 25 000 Kč",
          "Approx. CZK 1,200-25,000"
        ),
        gallery: ["/placeholder.svg", "/placeholder.svg", "/placeholder.svg"],
      },
      {
        id: "online-diagnostika",
        title: localized("Online diagnostika", "Онлайн діагностика", "Онлайн-диагностика", "Online diagnostics"),
        description: localizedLines(
          ["Aktualizace softwaru a řešení elektronických problémů pomocí přímého připojení k výrobcům."],
          ["Оновлення ПЗ та вирішення електронних проблем через пряме підключення до виробників."],
          ["Обновление ПО и решение электронных проблем через прямое подключение к производителям."],
          ["Software updates and electronic issue resolution via direct manufacturer connection."]
        ),
        priceRange: localized(
          "Orientačně 1 500 až 7 000 Kč",
          "Орієнтовно 1 500 - 7 000 Kč",
          "Ориентировочно 1 500 - 7 000 Kč",
          "Approx. CZK 1,500-7,000"
        ),
        gallery: ["/placeholder.svg", "/placeholder.svg", "/placeholder.svg"],
      },
    ],
  },
  {
    id: "kodovani",
    slug: "kodovani",
    iconName: "KeyRound",
    title: localized("Kódování", "Кодування", "Кодирование", "Coding"),
    shortDesc: localized(
      "Kódování klíčů a řídicích jednotek pro všechny typy vozidel.",
      "Кодування ключів та блоків керування для всіх типів автомобілів.",
      "Кодирование ключей и блоков управления для всех типов автомобилей.",
      "Key and control unit coding for all vehicle types."
    ),
    intro: localized(
      "Zajišťujeme programování klíčů i kódování řídicích jednotek po výměně nebo opravě dílů.",
      "Виконуємо програмування ключів і кодування блоків керування після заміни або ремонту вузлів.",
      "Выполняем программирование ключей и кодирование блоков управления после замены или ремонта узлов.",
      "We provide key programming and control unit coding after part replacement or repair."
    ),
    pricingNote: localized(
      "Cena závisí na značce vozidla, typu jednotky a zabezpečení.",
      "Ціна залежить від марки авто, типу блока та рівня захисту.",
      "Цена зависит от марки авто, типа блока и уровня защиты.",
      "Pricing depends on vehicle brand, unit type and security level."
    ),
    tags: ["Klíče", "Řídicí jednotky"],
    items: [
      {
        id: "kodovani-klicu",
        title: localized("Kódování klíčů", "Кодування ключів", "Кодирование ключей", "Key coding"),
        description: localizedLines(
          ["Programování nových klíčů a dálkových ovladačů, párování s vozidlem."],
          ["Програмування нових ключів і брелоків, прив'язка до автомобіля."],
          ["Программирование новых ключей и брелоков, привязка к автомобилю."],
          ["Programming new keys and remotes, pairing with the vehicle."]
        ),
        priceRange: localized(
          "Orientačně 2 000 až 9 000 Kč",
          "Орієнтовно 2 000 - 9 000 Kč",
          "Ориентировочно 2 000 - 9 000 Kč",
          "Approx. CZK 2,000-9,000"
        ),
        gallery: ["/placeholder.svg", "/placeholder.svg", "/placeholder.svg"],
      },
      {
        id: "ridici-jednotky",
        title: localized(
          "Řídicí jednotky",
          "Блоки керування",
          "Блоки управления",
          "Control units"
        ),
        description: localizedLines(
          ["Kódování a přizpůsobení řídicích jednotek po výměně dílu nebo opravě."],
          ["Кодування та адаптація блоків керування після заміни деталей або ремонту."],
          ["Кодирование и адаптация блоков управления после замены деталей или ремонта."],
          ["Coding and adaptation of control units after part replacement or repair."]
        ),
        priceRange: localized(
          "Orientačně 2 500 až 15 000 Kč",
          "Орієнтовно 2 500 - 15 000 Kč",
          "Ориентировочно 2 500 - 15 000 Kč",
          "Approx. CZK 2,500-15,000"
        ),
        gallery: ["/placeholder.svg", "/placeholder.svg", "/placeholder.svg"],
      },
    ],
  },
  {
    id: "podvozky",
    slug: "podvozky",
    iconName: "Disc",
    title: localized("Podvozky", "Підвіска", "Подвеска", "Suspension"),
    shortDesc: localized(
      "Opravy a údržba podvozků, výměna tlumičů, ramen a dalších dílů.",
      "Ремонт і обслуговування підвіски, заміна амортизаторів, важелів та інших деталей.",
      "Ремонт и обслуживание подвески, замена амортизаторов, рычагов и других деталей.",
      "Suspension repairs and maintenance, including shocks, control arms and other components."
    ),
    intro: localized(
      "Kontrolujeme a opravujeme podvozek tak, aby auto bylo bezpečné a stabilní při každé jízdě.",
      "Перевіряємо й ремонтуємо підвіску, щоб авто було безпечним і стабільним у русі.",
      "Проверяем и ремонтируем подвеску, чтобы авто было безопасным и стабильным в движении.",
      "We inspect and repair suspension to keep your car safe and stable on every drive."
    ),
    pricingNote: localized(
      "Přesná cena se stanoví po kontrole vůlí a stavu jednotlivých dílů.",
      "Точна ціна визначається після перевірки люфтів і стану деталей.",
      "Точная цена определяется после проверки люфтов и состояния деталей.",
      "Exact pricing is determined after checking play and component condition."
    ),
    tags: ["Opravy", "Tlumiče", "Ramena"],
    items: [
      {
        id: "opravy-podvozku",
        title: localized("Opravy podvozku", "Ремонт підвіски", "Ремонт подвески", "Suspension repairs"),
        description: localizedLines(
          ["Kompletní kontrola a oprava náprav, čepů, silentbloků a stabilizačních prvků."],
          ["Повна перевірка та ремонт осей, шарнірів, сайлентблоків і стабілізаторів."],
          ["Полная проверка и ремонт осей, шарниров, сайлентблоков и стабилизаторов."],
          ["Complete inspection and repair of axles, joints, bushings and stabilizer parts."]
        ),
        priceRange: localized(
          "Orientačně 2 000 až 30 000 Kč",
          "Орієнтовно 2 000 - 30 000 Kč",
          "Ориентировочно 2 000 - 30 000 Kč",
          "Approx. CZK 2,000-30,000"
        ),
        gallery: ["/placeholder.svg", "/placeholder.svg", "/placeholder.svg"],
      },
      {
        id: "tlumice",
        title: localized("Tlumiče", "Амортизатори", "Амортизаторы", "Shock absorbers"),
        description: localizedLines(
          ["Výměna tlumičů a pružin pro bezpečnou a stabilní jízdu."],
          ["Заміна амортизаторів і пружин для безпечної та стабільної їзди."],
          ["Замена амортизаторов и пружин для безопасной и стабильной езды."],
          ["Replacement of shocks and springs for safe and stable driving."]
        ),
        priceRange: localized(
          "Orientačně 4 000 až 20 000 Kč",
          "Орієнтовно 4 000 - 20 000 Kč",
          "Ориентировочно 4 000 - 20 000 Kč",
          "Approx. CZK 4,000-20,000"
        ),
        gallery: ["/placeholder.svg", "/placeholder.svg", "/placeholder.svg"],
      },
      {
        id: "ramena",
        title: localized("Ramena", "Важелі", "Рычаги", "Control arms"),
        description: localizedLines(
          ["Výměna ramen náprav a dalších mechanických částí podvozku."],
          ["Заміна важелів підвіски та інших механічних елементів."],
          ["Замена рычагов подвески и других механических элементов."],
          ["Replacement of control arms and other mechanical suspension components."]
        ),
        priceRange: localized(
          "Orientačně 3 500 až 18 000 Kč",
          "Орієнтовно 3 500 - 18 000 Kč",
          "Ориентировочно 3 500 - 18 000 Kč",
          "Approx. CZK 3,500-18,000"
        ),
        gallery: ["/placeholder.svg", "/placeholder.svg", "/placeholder.svg"],
      },
    ],
  },
  {
    id: "geometrie",
    slug: "geometrie",
    iconName: "Target",
    title: localized("3D Geometrie", "3D Розвал-сходження", "3D Развал-схождение", "3D Wheel Alignment"),
    shortDesc: localized(
      "Přesné nastavení geometrie kol na moderním 3D zařízení.",
      "Точне налаштування геометрії коліс на сучасному 3D обладнанні.",
      "Точная настройка геометрии колес на современном 3D оборудовании.",
      "Precise wheel alignment adjustment using modern 3D equipment."
    ),
    intro: localized(
      "Přesné 3D měření geometrie zlepšuje stabilitu vozu a prodlužuje životnost pneumatik.",
      "Точне 3D-вимірювання геометрії покращує стабільність авто та подовжує ресурс шин.",
      "Точное 3D-измерение геометрии улучшает устойчивость авто и продлевает срок службы шин.",
      "Accurate 3D alignment measurement improves vehicle stability and extends tire life."
    ),
    pricingNote: localized(
      "Cena závisí na typu nápravy a rozsahu nutného seřízení.",
      "Ціна залежить від типу осі та обсягу потрібного регулювання.",
      "Цена зависит от типа оси и объема необходимой регулировки.",
      "Pricing depends on axle type and required adjustment scope."
    ),
    tags: ["3D", "Geometrie"],
    items: [
      {
        id: "3d-nastaveni-geometrie-kol",
        title: localized(
          "3D nastavení geometrie kol",
          "3D налаштування геометрії коліс",
          "3D настройка геометрии колес",
          "3D wheel alignment setup"
        ),
        description: localizedLines(
          [
            "Přesné měření a nastavení sbíhavosti, odklonu a záklonu kol pomocí moderní 3D technologie.",
            "Zajišťuje rovnoměrné opotřebení pneumatik a stabilní jízdní vlastnosti.",
          ],
          [
            "Точне вимірювання та налаштування сходження, розвалу й кастера за допомогою сучасної 3D-технології.",
            "Забезпечує рівномірний знос шин і стабільну керованість.",
          ],
          [
            "Точное измерение и настройка схождения, развала и кастера с помощью современной 3D-технологии.",
            "Обеспечивает равномерный износ шин и стабильную управляемость.",
          ],
          [
            "Precise measurement and adjustment of toe, camber and caster using modern 3D technology.",
            "Ensures even tire wear and stable driving behavior.",
          ]
        ),
        priceRange: localized(
          "Orientačně 1 200 až 2 500 Kč",
          "Орієнтовно 1 200 - 2 500 Kč",
          "Ориентировочно 1 200 - 2 500 Kč",
          "Approx. CZK 1,200-2,500"
        ),
        gallery: ["/placeholder.svg", "/placeholder.svg", "/placeholder.svg"],
      },
    ],
  },
  {
    id: "klimatizace",
    slug: "klimatizace",
    iconName: "Snowflake",
    title: localized("Klimatizace", "Кондиціонери", "Кондиционеры", "Air Conditioning"),
    shortDesc: localized(
      "Kompletní servis autoklimatizací – plnění, čištění, opravy.",
      "Повний сервіс автокондиціонерів - заправка, чистка, ремонт.",
      "Полный сервис автокондиционеров - заправка, чистка, ремонт.",
      "Complete car A/C service - refill, cleaning and repairs."
    ),
    intro: localized(
      "Servis klimatizace od běžného plnění až po opravy kompresorů a těsnění celého systému.",
      "Обслуговування кондиціонера від стандартної заправки до ремонту компресорів і герметизації системи.",
      "Обслуживание кондиционера от стандартной заправки до ремонта компрессоров и герметизации системы.",
      "A/C service from routine refrigerant refill to compressor repair and full system sealing."
    ),
    pricingNote: localized(
      "Orientační ceny se liší podle typu chladiva a rozsahu nutné opravy.",
      "Орієнтовні ціни залежать від типу холодоагенту та обсягу ремонту.",
      "Ориентировочные цены зависят от типа хладагента и объема ремонта.",
      "Indicative prices depend on refrigerant type and repair scope."
    ),
    tags: ["Plnění", "Servis", "Opravy"],
    items: [
      {
        id: "plneni-klimatizace",
        title: localized("Plnění klimatizace", "Заправка кондиціонера", "Заправка кондиционера", "A/C refill"),
        description: localizedLines(
          ["Doplnění chladiva a kontrola tlaku systému."],
          ["Заправка холодоагентом і перевірка тиску в системі."],
          ["Заправка хладагентом и проверка давления в системе."],
          ["Refrigerant refill and system pressure check."]
        ),
        priceRange: localized(
          "Orientačně 1 200 až 2 500 Kč",
          "Орієнтовно 1 200 - 2 500 Kč",
          "Ориентировочно 1 200 - 2 500 Kč",
          "Approx. CZK 1,200-2,500"
        ),
        gallery: ["/placeholder.svg", "/placeholder.svg", "/placeholder.svg"],
      },
      {
        id: "servis-klimatizace",
        title: localized("Servis klimatizace", "Сервіс кондиціонера", "Сервис кондиционера", "A/C service"),
        description: localizedLines(
          ["Čištění, dezinfekce a kontrola těsnosti systému."],
          ["Чистка, дезінфекція та перевірка герметичності системи."],
          ["Чистка, дезинфекция и проверка герметичности системы."],
          ["Cleaning, disinfection and leak-tightness check."]
        ),
        priceRange: localized(
          "Orientačně 1 500 až 4 500 Kč",
          "Орієнтовно 1 500 - 4 500 Kč",
          "Ориентировочно 1 500 - 4 500 Kč",
          "Approx. CZK 1,500-4,500"
        ),
        gallery: ["/placeholder.svg", "/placeholder.svg", "/placeholder.svg"],
      },
      {
        id: "opravy-klimatizace",
        title: localized("Opravy klimatizace", "Ремонт кондиціонера", "Ремонт кондиционера", "A/C repairs"),
        description: localizedLines(
          ["Opravy kompresorů, výměníků, ventilů a dalších součástí klimatizačního systému."],
          ["Ремонт компресорів, радіаторів, клапанів та інших елементів системи кондиціювання."],
          ["Ремонт компрессоров, радиаторов, клапанов и других элементов системы кондиционирования."],
          ["Repair of compressors, condensers, valves and other A/C system components."]
        ),
        priceRange: localized(
          "Orientačně 3 000 až 25 000 Kč",
          "Орієнтовно 3 000 - 25 000 Kč",
          "Ориентировочно 3 000 - 25 000 Kč",
          "Approx. CZK 3,000-25,000"
        ),
        gallery: ["/placeholder.svg", "/placeholder.svg", "/placeholder.svg"],
      },
    ],
  },
  {
    id: "karoserie",
    slug: "karoserie-lakovani",
    iconName: "Paintbrush",
    title: localized(
      "Karosářské a lakýrnické práce",
      "Кузовні та малярні роботи",
      "Кузовные и малярные работы",
      "Body and Paint Work"
    ),
    shortDesc: localized(
      "Opravy karoserií, rovnání, svařování, lakování a leštění.",
      "Ремонт кузова, рихтування, зварювання, фарбування та полірування.",
      "Ремонт кузова, рихтовка, сварка, покраска и полировка.",
      "Body repairs, straightening, welding, painting and polishing."
    ),
    intro: localized(
      "Provádíme opravy po nehodách i estetické zásahy včetně lakování a profesionálního leštění.",
      "Виконуємо ремонт після ДТП та естетичні роботи, включно з фарбуванням і професійним поліруванням.",
      "Выполняем ремонт после ДТП и эстетические работы, включая покраску и профессиональную полировку.",
      "We handle accident repairs and cosmetic work including painting and professional polishing."
    ),
    pricingNote: localized(
      "Konečná cena závisí na velikosti poškození a použité lakovací technologii.",
      "Кінцева ціна залежить від масштабу пошкодження та обраної технології фарбування.",
      "Итоговая цена зависит от масштаба повреждений и выбранной технологии покраски.",
      "Final pricing depends on damage extent and selected paint technology."
    ),
    tags: ["Karoserie", "Lakování", "Leštění"],
    items: [
      {
        id: "karoserie",
        title: localized("Karoserie", "Кузов", "Кузов", "Bodywork"),
        description: localizedLines(
          ["Opravy po nehodách, rovnání deformovaných částí, svařování a výměna dílů."],
          ["Ремонт після ДТП, рихтування деформованих частин, зварювання та заміна деталей."],
          ["Ремонт после ДТП, рихтовка деформированных частей, сварка и замена деталей."],
          ["Post-accident repairs, straightening deformed parts, welding and part replacement."]
        ),
        priceRange: localized(
          "Orientačně 4 000 až 80 000 Kč",
          "Орієнтовно 4 000 - 80 000 Kč",
          "Ориентировочно 4 000 - 80 000 Kč",
          "Approx. CZK 4,000-80,000"
        ),
        gallery: [
          "/services/karoserie-lakovani/renovace-mercedes-01.webp",
          "/services/karoserie-lakovani/renovace-mercedes-02.webp",
          "/services/karoserie-lakovani/renovace-mercedes-03.webp",
          "/services/karoserie-lakovani/renovace-mercedes-04.webp",
        ],
      },
      {
        id: "lakovani",
        title: localized("Lakování", "Фарбування", "Покраска", "Painting"),
        description: localizedLines(
          ["Lokální i celkové lakování vozidla, opravy škrábanců a poškození laku."],
          ["Локальне або повне фарбування авто, усунення подряпин і пошкоджень покриття."],
          ["Локальная или полная покраска авто, устранение царапин и повреждений покрытия."],
          ["Spot or full vehicle painting, scratch and paint damage repairs."]
        ),
        priceRange: localized(
          "Orientačně 2 500 až 70 000 Kč",
          "Орієнтовно 2 500 - 70 000 Kč",
          "Ориентировочно 2 500 - 70 000 Kč",
          "Approx. CZK 2,500-70,000"
        ),
        gallery: [
          "/services/karoserie-lakovani/renovace-mercedes-05.webp",
          "/services/karoserie-lakovani/renovace-mercedes-06.webp",
          "/services/karoserie-lakovani/renovace-mercedes-07.webp",
          "/services/karoserie-lakovani/renovace-mercedes-08.webp",
        ],
      },
      {
        id: "lesteni",
        title: localized("Leštění", "Полірування", "Полировка", "Polishing"),
        description: localizedLines(
          ["Profesionální leštění laku pro obnovení lesku a odstranění drobných vad."],
          ["Професійне полірування для відновлення блиску та усунення дрібних дефектів."],
          ["Профессиональная полировка для восстановления блеска и удаления мелких дефектов."],
          ["Professional paint polishing to restore gloss and remove minor defects."]
        ),
        priceRange: localized(
          "Orientačně 1 500 až 8 000 Kč",
          "Орієнтовно 1 500 - 8 000 Kč",
          "Ориентировочно 1 500 - 8 000 Kč",
          "Approx. CZK 1,500-8,000"
        ),
        gallery: [
          "/services/karoserie-lakovani/renovace-mercedes-09.webp",
          "/services/karoserie-lakovani/renovace-mercedes-10.webp",
          "/services/karoserie-lakovani/renovace-mercedes-11.webp",
          "/services/karoserie-lakovani/renovace-mercedes-12.webp",
        ],
      },
    ],
  },
  {
    id: "renovace-veteranu",
    slug: "renovace-veteranu",
    iconName: "Paintbrush",
    title: localized("Renovace veteránů", "Реставрація ретро-авто", "Реставрация классических авто", "Classic Car Restoration"),
    shortDesc: localized(
      "Kompletní renovace veteránů od karoserie po finální detaily.",
      "Повна реставрація ретро-авто від кузова до фінальних деталей.",
      "Полная реставрация классических авто от кузова до финальных деталей.",
      "Complete classic car restoration from bodywork to final detailing."
    ),
    intro: localized(
      "Provádíme renovace historických vozů včetně karosářských, lakýrnických a detailních dokončovacích prací.",
      "Виконуємо реставрацію історичних авто: кузовні, малярні та фінішні роботи.",
      "Выполняем реставрацию исторических авто: кузовные, малярные и финишные работы.",
      "We restore classic vehicles including bodywork, paintwork and detailed finishing."
    ),
    pricingNote: localized(
      "Cena renovace veteránu je vždy individuální podle stavu vozu a rozsahu požadovaných prací.",
      "Вартість реставрації визначається індивідуально залежно від стану авто та обсягу робіт.",
      "Стоимость реставрации определяется индивидуально в зависимости от состояния авто и объема работ.",
      "Restoration pricing is always individual based on vehicle condition and required scope."
    ),
    tags: ["Veterán", "Renovace", "Lakování"],
    items: [
      {
        id: "renovace-veteranu-komplet",
        title: localized(
          "Kompletní renovace veteránu",
          "Комплексна реставрація ретро-авто",
          "Комплексная реставрация классического авто",
          "Complete classic car restoration"
        ),
        description: localizedLines(
          [
            "Demontáž, oprava karoserie, lakování a finální montáž vozu.",
            "Důraz na původní vzhled, kvalitu zpracování a dlouhou životnost renovace.",
          ],
          [
            "Демонтаж, ремонт кузова, фарбування та фінальне складання авто.",
            "Акцент на оригінальний вигляд, якість виконання та довговічність реставрації.",
          ],
          [
            "Демонтаж, ремонт кузова, покраска и финальная сборка авто.",
            "Акцент на оригинальный внешний вид, качество исполнения и долговечность реставрации.",
          ],
          [
            "Disassembly, body restoration, painting and final reassembly.",
            "Focused on authentic appearance, high workmanship and long-term durability.",
          ]
        ),
        priceRange: localized(
          "Individuální kalkulace",
          "Індивідуальний розрахунок",
          "Индивидуальный расчет",
          "Individual quotation"
        ),
        gallery: ["/placeholder.svg", "/placeholder.svg", "/placeholder.svg"],
      },
    ],
  },
];

export function getServiceBySlug(slug: string) {
  return services.find((service) => service.slug === slug);
}
