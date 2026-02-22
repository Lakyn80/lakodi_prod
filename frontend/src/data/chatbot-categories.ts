export interface CategoryQuestion {
  key: string;
  label: { cs: string; ua: string; ru: string; en: string };
}

export interface ChatCategory {
  id: string;
  title: { cs: string; ua: string; ru: string; en: string };
  description: { cs: string; ua: string; ru: string; en: string };
  questions: CategoryQuestion[];
}

export const CHAT_CATEGORIES: ChatCategory[] = [
  {
    id: "motor",
    title: { cs: "Motor", ua: "Двигун", ru: "Двигатель", en: "Engine" },
    description: {
      cs: "Značka, model, rok výroby, typ motoru a popis problému (např. únik oleje, hluk).",
      ua: "Марка, модель, рік, тип двигуна та опис проблеми.",
      ru: "Марка, модель, год, тип двигателя и описание проблемы.",
      en: "Brand, model, year, engine type and issue description.",
    },
    questions: [
      { key: "značka", label: { cs: "Značka auta", ua: "Марка авто", ru: "Марка авто", en: "Car brand" } },
      { key: "model", label: { cs: "Model", ua: "Модель", ru: "Модель", en: "Model" } },
      { key: "rok", label: { cs: "Rok výroby", ua: "Рік випуску", ru: "Год выпуска", en: "Year" } },
      {
        key: "popis_problemu",
        label: { cs: "Popis problému", ua: "Опис проблеми", ru: "Описание проблемы", en: "Issue description" },
      },
    ],
  },
  {
    id: "prevodovka",
    title: { cs: "Převodovka", ua: "Коробка передач", ru: "Коробка передач", en: "Gearbox" },
    description: {
      cs: "Typ převodovky (automat/manuál), značka auta a příznaky (cukání, prokluzování).",
      ua: "Тип коробки (авто/механіка), марка авто та симптоми.",
      ru: "Тип коробки (автомат/механика), марка авто и симптомы.",
      en: "Gearbox type (automatic/manual), car brand and symptoms.",
    },
    questions: [
      { key: "značka", label: { cs: "Značka auta", ua: "Марка авто", ru: "Марка авто", en: "Car brand" } },
      { key: "model", label: { cs: "Model", ua: "Модель", ru: "Модель", en: "Model" } },
      {
        key: "typ",
        label: {
          cs: "Typ převodovky (automat/manuál)",
          ua: "Тип коробки (авто/механіка)",
          ru: "Тип коробки (автомат/механика)",
          en: "Gearbox type (automatic/manual)",
        },
      },
      {
        key: "příznaky",
        label: { cs: "Příznaky / co se děje", ua: "Симптоми", ru: "Симптомы", en: "Symptoms" },
      },
    ],
  },
  {
    id: "klima",
    title: { cs: "Klimatizace", ua: "Кондиціонер", ru: "Кондиционер", en: "Air conditioning" },
    description: {
      cs: "Kdy přestala foukat, zda je slyšet hluk, zda dříve fungovala.",
      ua: "Коли перестала працювати, чи чути шум.",
      ru: "Когда перестала работать, есть ли шум.",
      en: "When it stopped working, whether there is noise, and if it worked before.",
    },
    questions: [
      {
        key: "značka",
        label: { cs: "Značka a model", ua: "Марка та модель", ru: "Марка и модель", en: "Brand and model" },
      },
      {
        key: "příznaky",
        label: {
          cs: "Co se děje (nefouká, teče, hluk)",
          ua: "Що відбувається",
          ru: "Что происходит",
          en: "What is happening (no cooling, leak, noise)",
        },
      },
    ],
  },
  {
    id: "diagnostika",
    title: { cs: "Diagnostika", ua: "Діагностика", ru: "Диагностика", en: "Diagnostics" },
    description: {
      cs: "Co kontrolovat – kontrolka, chyba, nestabilní chod?",
      ua: "Що перевірити – індикатор, помилка?",
      ru: "Что проверить - индикатор, ошибка?",
      en: "What should we check - warning light, fault, unstable running?",
    },
    questions: [
      {
        key: "značka",
        label: { cs: "Značka a model", ua: "Марка та модель", ru: "Марка и модель", en: "Brand and model" },
      },
      {
        key: "kontrolka",
        label: {
          cs: "Která kontrolka / chybový kód",
          ua: "Який індикатор / код",
          ru: "Какой индикатор / код ошибки",
          en: "Which warning light / fault code",
        },
      },
      { key: "symptomy", label: { cs: "Symptomy", ua: "Симптоми", ru: "Симптомы", en: "Symptoms" } },
    ],
  },
  {
    id: "brzdy",
    title: { cs: "Brzdy", ua: "Гальма", ru: "Тормоза", en: "Brakes" },
    description: {
      cs: "Typ problému – brzdová destička, kotouč, vadí brzdění, pískání.",
      ua: "Тип проблеми – колодки, диски, звуки.",
      ru: "Тип проблемы - колодки, диски, посторонние звуки.",
      en: "Type of issue - brake pads, discs, poor braking, squeaking.",
    },
    questions: [
      {
        key: "značka",
        label: { cs: "Značka a model", ua: "Марка та модель", ru: "Марка и модель", en: "Brand and model" },
      },
      {
        key: "typ",
        label: {
          cs: "Co je potřeba (výměna, kontrola, pískání)",
          ua: "Що потрібно",
          ru: "Что требуется",
          en: "What do you need (replacement, check, squeaking)",
        },
      },
    ],
  },
  {
    id: "elektro",
    title: {
      cs: "Elektro / Autoelektrika",
      ua: "Електро / Автоелектрика",
      ru: "Электро / Автоэлектрика",
      en: "Electrical / Auto electrics",
    },
    description: {
      cs: "Problém se startováním, světly, nabíjením, chybovými kódy.",
      ua: "Проблема зі стартом, світлом, зарядкою.",
      ru: "Проблема со стартом, светом, зарядкой.",
      en: "Issues with starting, lights, charging or fault codes.",
    },
    questions: [
      {
        key: "značka",
        label: { cs: "Značka a model", ua: "Марка та модель", ru: "Марка и модель", en: "Brand and model" },
      },
      {
        key: "problém",
        label: {
          cs: "Popis elektrického problému",
          ua: "Опис електричної проблеми",
          ru: "Описание электрической проблемы",
          en: "Electrical issue description",
        },
      },
    ],
  },
  {
    id: "karoserie-lak",
    title: {
      cs: "Karoserie / Lak",
      ua: "Кузов / Лак",
      ru: "Кузов / Краска",
      en: "Body / Paint",
    },
    description: {
      cs: "Rozsah poškození – škrábanec, promáčklina, lakování, leštění.",
      ua: "Масштаб пошкодження – подряпини, фарбування.",
      ru: "Масштаб повреждения - царапины, покраска.",
      en: "Damage scope - scratch, dent, paintwork, polishing.",
    },
    questions: [
      {
        key: "značka",
        label: { cs: "Značka a model", ua: "Марка та модель", ru: "Марка и модель", en: "Brand and model" },
      },
      {
        key: "co",
        label: {
          cs: "Co je potřeba (lakování, rovnání, leštění)",
          ua: "Що потрібно",
          ru: "Что требуется",
          en: "What is needed (painting, straightening, polishing)",
        },
      },
      {
        key: "popis",
        label: { cs: "Popis poškození", ua: "Опис пошкодження", ru: "Описание повреждения", en: "Damage description" },
      },
    ],
  },
  {
    id: "pneuservis",
    title: { cs: "Pneuservis", ua: "Шиномонтаж", ru: "Шиномонтаж", en: "Tire service" },
    description: {
      cs: "Výměna pneumatik, přezutí, skladování, opravy defektů.",
      ua: "Заміна шин, зберігання, ремонт.",
      ru: "Замена шин, хранение, ремонт.",
      en: "Tire change, seasonal swap, storage and puncture repair.",
    },
    questions: [
      {
        key: "počet_kol",
        label: {
          cs: "Počet kol (4 / 5)",
          ua: "Кількість коліс",
          ru: "Количество колес",
          en: "Number of wheels (4 / 5)",
        },
      },
      {
        key: "typ",
        label: {
          cs: "Co potřebujete (přezutí, skladování)",
          ua: "Що потрібно",
          ru: "Что требуется",
          en: "What do you need (swap, storage)",
        },
      },
    ],
  },
  {
    id: "geometrie",
    title: { cs: "Geometrie", ua: "Розвал-сходження", ru: "Развал-схождение", en: "Wheel alignment" },
    description: {
      cs: "3D geometrie kol – sjíždění gum, tažení volantu.",
      ua: "3D геометрія – знос шин, тягне кермо.",
      ru: "3D геометрия - износ шин, увод руля.",
      en: "3D alignment - uneven tire wear, steering pull.",
    },
    questions: [
      {
        key: "značka",
        label: { cs: "Značka a model", ua: "Марка та модель", ru: "Марка и модель", en: "Brand and model" },
      },
      {
        key: "problém",
        label: { cs: "Problém (sjíždění gum, tažení)", ua: "Проблема", ru: "Проблема", en: "Issue" },
      },
    ],
  },
  {
    id: "jine",
    title: { cs: "Jiné", ua: "Інше", ru: "Другое", en: "Other" },
    description: {
      cs: "Popište stručně, co potřebujete.",
      ua: "Опишіть, що потрібно.",
      ru: "Кратко опишите, что нужно.",
      en: "Briefly describe what you need.",
    },
    questions: [
      {
        key: "značka",
        label: {
          cs: "Značka a model (volitelně)",
          ua: "Марка та модель",
          ru: "Марка и модель",
          en: "Brand and model (optional)",
        },
      },
      {
        key: "popis",
        label: { cs: "Popis požadavku", ua: "Опис запиту", ru: "Описание запроса", en: "Request description" },
      },
    ],
  },
];
