export interface Service {
  id: string;
  slug: string;
  iconName: string;
  title: { cs: string; ua: string };
  shortDesc: { cs: string; ua: string };
  tags: string[];
}

export const services: Service[] = [
  {
    id: 'prevodovky',
    slug: 'prevodovky',
    iconName: 'Settings2',
    title: { cs: 'Převodovky', ua: 'Коробки передач' },
    shortDesc: {
      cs: 'Generální opravy a repasy automatických i manuálních převodovek všech značek.',
      ua: 'Капітальний ремонт автоматичних та механічних коробок передач усіх марок.',
    },
    tags: ['GO', 'Repas', 'Automat', 'Manuál'],
  },
  {
    id: 'motory',
    slug: 'motory',
    iconName: 'Gauge',
    title: { cs: 'Motory', ua: 'Двигуни' },
    shortDesc: {
      cs: 'Generální opravy a repasy motorů – benzín, diesel, hybrid.',
      ua: 'Капітальний ремонт двигунів – бензин, дизель, гібрид.',
    },
    tags: ['GO', 'Repas', 'Benzín', 'Diesel'],
  },
  {
    id: 'autoelektrika',
    slug: 'autoelektrika-diagnostika',
    iconName: 'Zap',
    title: { cs: 'Autoelektrika a diagnostika', ua: 'Автоелектрика та діагностика' },
    shortDesc: {
      cs: 'Profesionální diagnostika všech značek, opravy autoelektriky a online diagnostika.',
      ua: 'Професійна діагностика всіх марок, ремонт автоелектрики та онлайн діагностика.',
    },
    tags: ['Diagnostika', 'Elektrika', 'Online'],
  },
  {
    id: 'kodovani',
    slug: 'kodovani',
    iconName: 'KeyRound',
    title: { cs: 'Kódování', ua: 'Кодування' },
    shortDesc: {
      cs: 'Kódování klíčů a řídicích jednotek pro všechny typy vozidel.',
      ua: 'Кодування ключів та блоків керування для всіх типів автомобілів.',
    },
    tags: ['Klíče', 'Řídicí jednotky'],
  },
  {
    id: 'podvozky',
    slug: 'podvozky',
    iconName: 'Disc',
    title: { cs: 'Podvozky', ua: 'Підвіска' },
    shortDesc: {
      cs: 'Opravy a údržba podvozků, výměna tlumičů, ramen a dalších dílů.',
      ua: 'Ремонт та обслуговування підвіски, заміна амортизаторів та інших деталей.',
    },
    tags: ['Opravy', 'Tlumiče', 'Ramena'],
  },
  {
    id: 'geometrie',
    slug: 'geometrie',
    iconName: 'Target',
    title: { cs: '3D Geometrie', ua: '3D Розвал-сходження' },
    shortDesc: {
      cs: 'Přesné nastavení geometrie kol na moderním 3D zařízení.',
      ua: 'Точне налаштування геометрії коліс на сучасному 3D обладнанні.',
    },
    tags: ['3D', 'Geometrie'],
  },
  {
    id: 'klimatizace',
    slug: 'klimatizace',
    iconName: 'Snowflake',
    title: { cs: 'Klimatizace', ua: 'Кондиціонери' },
    shortDesc: {
      cs: 'Kompletní servis autoklimatizací – plnění, čištění, opravy.',
      ua: 'Повний сервіс автокондиціонерів – заправка, чистка, ремонт.',
    },
    tags: ['Plnění', 'Servis', 'Opravy'],
  },
  {
    id: 'karoserie',
    slug: 'karoserie-lakovani',
    iconName: 'Paintbrush',
    title: { cs: 'Karosářské a lakýrnické práce', ua: 'Кузовні та малярні роботи' },
    shortDesc: {
      cs: 'Opravy karoserií, rovnání, svařování, lakování a leštění.',
      ua: 'Ремонт кузова, рихтування, зварювання, фарбування та полірування.',
    },
    tags: ['Karoserie', 'Lakování', 'Leštění'],
  },
];
