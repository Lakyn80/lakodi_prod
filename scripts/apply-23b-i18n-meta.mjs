import fs from "fs";

const filePath = "frontend/src/data/translations.ts";
let source = fs.readFileSync(filePath, "utf8").replace(/\r\n/g, "\n");

function patch(from, to, label) {
  if (!source.includes(from)) {
    throw new Error(`Missing ${label}: ${from.slice(0, 80)}`);
  }
  source = source.replace(from, to);
}

patch(
  `        documentDetail: {
          label: "Detail dokladu",
          description: "Read-only detail dokladu s položkami, platbami, relacemi a auditní stopou.",
        },
        expenses: {`,
  `        documentDetail: {
          label: "Detail dokladu",
          description: "Read-only detail dokladu s položkami, platbami, relacemi a auditní stopou.",
        },
        subjects: {
          label: "Odběratelé",
          description: "Registr klientů pro opakované použití v dokladech včetně ARES lookup.",
        },
        subjectDetail: {
          label: "Detail odběratele",
          description: "Detail uloženého odběratele pro opakované použití v dokladech.",
        },
        expenses: {`,
  "cs moduleRegistry",
);

patch(
  `          documentDetail: "Detail dokladu",
          expenses: "Výdaje",`,
  `          documentDetail: "Detail dokladu",
          subjects: "Odběratelé",
          subjectDetail: "Detail odběratele",
          expenses: "Výdaje",`,
  "cs voice labels",
);

patch(
  `          documentDetail: ["detail dokladu", "detail faktury"],
          expenses: ["výdaje", "přijaté doklady", "náklady"],`,
  `          documentDetail: ["detail dokladu", "detail faktury"],
          subjects: ["odběratelé", "klienti", "subjects registry"],
          subjectDetail: ["detail odběratele", "subject detail"],
          expenses: ["výdaje", "přijaté doklady", "náklady"],`,
  "cs voice aliases",
);

patch(
  `        attachmentInboxDescription: "Без активної admin-сесії незв'язані вкладення не завантажаться.",
      },
      errors: {
        dashboardTitle: "Не вдалося завантажити read-only бухгалтерський дашборд",`,
  `        attachmentInboxDescription: "Без активної admin-сесії незв'язані вкладення не завантажаться.",
        subjectsTitle: "Для завантаження одержувачів потрібен вхід",
        subjectsDescription: "Без активної admin-сесії список одержувачів не завантажиться.",
        subjectDetailTitle: "Для деталей одержувача потрібен вхід",
        subjectDetailDescription: "Без активної admin-сесії деталі одержувача не завантажаться.",
      },
      errors: {
        dashboardTitle: "Не вдалося завантажити read-only бухгалтерський дашборд",`,
  "ua auth",
);

patch(
  `        attachmentInboxTitle: "Не вдалося завантажити read-only inbox вкладень",
        supplementalTitle: "Частину додаткових read-only секцій не вдалося завантажити",`,
  `        attachmentInboxTitle: "Не вдалося завантажити read-only inbox вкладень",
        subjectsTitle: "Не вдалося завантажити список одержувачів",
        subjectDetailTitle: "Не вдалося завантажити деталі одержувача",
        supplementalTitle: "Частину додаткових read-only секцій не вдалося завантажити",`,
  "ua errors",
);

patch(
  `        dashboardAudit: "Audit-події поки не вдалося завантажити або бекенд повернув порожній список.",
      },
      dashboard: {
        badges: {
          parallelSection: "Паралельна секція",`,
  `        dashboardAudit: "Audit-події поки не вдалося завантажити або бекенд повернув порожній список.",
        subjects: "Поки немає збережених одержувачів. Запустіть backfill зі старих рахунків або створіть нового одержувача.",
      },
      dashboard: {
        badges: {
          parallelSection: "Паралельна секція",`,
  "ua empty",
);

patch(
  `        documentDetail: { label: "Деталі документа", description: "Read-only деталі документа з poziціями, platежami, зв'язками та audit-слідом." },
        expenses: { label: "Витрати", description: "Read-only огляд вхідних документів і їх поточних stanów opлati." },`,
  `        documentDetail: { label: "Деталі документа", description: "Read-only деталі документа з poziціями, platежami, зв'язками та audit-слідом." },
        subjects: { label: "Одержувачі", description: "Реєстр клієнтів для повторного використання в документах з ARES lookup." },
        subjectDetail: { label: "Деталі одержувача", description: "Деталі збереженого одержувача для повторного використання в документах." },
        expenses: { label: "Вitрати", description: "Read-only огляд вхідних документів і їх поточних stanów opлati." },`,
  "ua moduleRegistry",
);
