import fs from "fs";
import path from "path";

const filePath = path.resolve("frontend/src/data/translations.ts");
let source = fs.readFileSync(filePath, "utf8");

function insertAfter(anchor, insert) {
  const index = source.indexOf(anchor);
  if (index === -1) {
    throw new Error(`Anchor not found: ${anchor.slice(0, 80)}...`);
  }
  source = source.slice(0, index + anchor.length) + insert + source.slice(index + anchor.length);
}

const csWriteBlocks = `
      aresWrite: {
        searchByName: "Vyhledání firmy podle názvu",
        searchPlaceholder: "Zadejte část názvu firmy",
        searchAction: "Vyhledat",
        searchLoading: "Vyhledávám…",
        searchMinLength: "Zadejte alespoň 2 znaky názvu firmy.",
        searchEmpty: "V ARES nebyla nalezena žádná firma.",
        searchMultiple: "Nalezeno {count} firem — vyberte správnou.",
        searchSingleApplied: "Firma byla převzata ze zdroje {source}.",
        searchFailed: "Vyhledání v ARES selhalo.",
        ico: "IČO",
        icoPlaceholder: "Např. 09695982",
        icoRequired: "Nejdřív zadejte IČO firmy.",
        lookupAction: "Načíst z ARES",
        lookupLoading: "Načítám…",
        lookupFailed: "Údaje z ARES se nepodařilo načíst.",
        loadedFromSource: "Firma byla načtena ze zdroje {source}.",
        appliedFromSource: "Údaje byly převzaty ze zdroje {source}.",
        dic: "DIČ",
        dicPlaceholder: "Např. CZ09695982",
        name: "Jméno / firma",
        namePlaceholder: "Název firmy",
        email: "E-mail",
        emailPlaceholder: "fakturace@firma.cz",
        phone: "Telefon",
        phonePlaceholder: "+420 123 456 789",
        address: "Adresa",
        addressPlaceholder: "Ulice, PSČ, město, stát",
        sourceLabel: "Zdroj",
      },
      subjectWrite: {
        badgeFunctional: "Funkční write vrstva",
        loading: "Načítání formuláře odběratele…",
        loadFailed: "Formulář odběratele se nepodařilo načíst.",
        createTitle: "Nový odběratel",
        editTitle: "Upravit odběratele",
        description: "Uložení odběratele umožní opakované použití v dokladech bez duplicitního zadávání.",
        backToDetail: "Zpět na detail odběratele",
        save: "Uložit odběratele",
        update: "Uložit změny",
        actions: { createSubject: "Nový odběratel", editSubject: "Upravit odběratele" },
        duplicate: {
          title: "Odběratel s tímto IČO už existuje",
          description: "Firma {name} je už v registru.",
          useExisting: "Použít existujícího odběratele",
        },
        mutation: { createSuccess: "Odběratel byl uložen.", updateSuccess: "Odběratel byl aktualizován." },
        validation: {
          title: "Formulář obsahuje chyby",
          requiredFields: "Vyplňte název, e-mail a adresu.",
          duplicateIco: "Odběratel s tímto IČO už existuje — použijte existující záznam.",
        },
        fields: { note: "Poznámka", country: "Země", dataBox: "Datová schránka" },
      },
      supplierWrite: {
        badgeFunctional: "Funkční write vrstva",
        loading: "Načítání formuláře dodavatele…",
        createTitle: "Nový dodavatel",
        editTitle: "Upravit dodavatele",
        description: "Uloženého dodavatele lze znovu použít ve výdajích.",
        backToDetail: "Zpět na detail dodavatele",
        save: "Uložit dodavatele",
        update: "Uložit změny",
        actions: { createSupplier: "Nový dodavatel", editSupplier: "Upravit dodavatele" },
        duplicate: {
          title: "Dodavatel s tímto IČO už existuje",
          description: "Firma {name} je už v registru.",
          useExisting: "Použít existujícího dodavatele",
        },
        mutation: { createSuccess: "Dodavatel byl uložen.", updateSuccess: "Dodavatel byl aktualizován." },
        validation: {
          title: "Formulář obsahuje chyby",
          requiredFields: "Vyplňte název, e-mail a adresu.",
          duplicateIco: "Dodavatel s tímto IČO už existuje.",
        },
        fields: { note: "Poznámka", country: "Země", dataBox: "Datová schránka" },
      },
      expenseWrite: {
        badgeFunctional: "Funkční write vrstva",
        loading: "Načítání formuláře výdaje…",
        createTitle: "Nový výdaj",
        editTitle: "Upravit výdaj",
        description: "Vytvoření nebo úprava přijatého dokladu / výdaje.",
        backToDetail: "Zpět na detail výdaje",
        save: "Uložit výdaj",
        update: "Uložit změny",
        addItem: "Přidat položku",
        actions: { createExpense: "Nový výdaj", editExpense: "Upravit výdaj" },
        mutation: { createSuccess: "Výdaj byl uložen.", updateSuccess: "Výdaj byl aktualizován." },
        payment: {
          title: "Přidat platbu výdaje",
          description: "Platba přepočítá stav úhrady výdaje.",
          submit: "Přidat platbu",
          confirmTitle: "Potvrdit platbu výdaje",
          confirmDescription: "Tato akce změní stav úhrady výdaje.",
          confirmAction: "Potvrdit platbu",
          success: "Platba byla přidána.",
          disabledHint: "Platbu nelze přidat pro tento stav výdaje.",
          fields: { amount: "Částka", paidAt: "Datum úhrady", method: "Způsob platby", note: "Poznámka" },
        },
        validation: {
          title: "Formulář obsahuje chyby",
          requiredDates: "Vyplňte všechna data.",
          supplierRequired: "Vyberte dodavatele nebo vyplňte snapshot dodavatele.",
          itemsRequired: "Výdaj musí obsahovat alespoň jednu položku.",
          itemNumbers: "Množství musí být větší než nula.",
        },
        fields: {
          expenseNumber: "Číslo výdaje",
          issueDate: "Datum vystavení",
          receivedDate: "Datum přijetí",
          dueDate: "Datum splatnosti",
          taxableSupplyDate: "Datum zdanění",
          paymentMethod: "Způsob platby",
          bankAccountNumber: "Číslo účtu",
          bankAccountPrefix: "Předčíslí",
          bankCode: "Kód banky",
          bankIban: "IBAN",
          currency: "Měna",
          vatRate: "Sazba DPH",
          status: "Stav",
          note: "Poznámka",
          supplier: "Dodavatel",
          supplierNone: "Bez dodavatele — ruční snapshot",
          itemDescription: "Popis",
          itemQuantity: "Množství",
          itemUnitPrice: "Cena za jednotku",
        },
      },
      subjects: {
        badge: "Odběratelé",
        title: "Registr odběratelů",
        description: "Uložení klientů pro opakované použití v dokladech včetně ARES lookup.",
        searchPlaceholder: "Hledat podle názvu, e-mailu, IČO nebo DIČ",
        searchLabel: "Hledat odběratele",
        shownCount: "{count} zobrazených odběratelů",
        table: {
          subject: "Odběratel",
          ico: "IČO",
          dic: "DIČ",
          contact: "Kontakt",
          country: "Země",
          detail: "Detail odběratele",
        },
      },
      subjectDetail: {
        notFoundTitle: "Odběratel nebyl nalezen",
        notFoundDescription: "Požadovaný odběratel nebyl nalezen.",
        description: "Detail uloženého odběratele pro opakované použití v dokladech.",
      },
`;

const localeWriteBlocks = {
  cs: csWriteBlocks,
  ua: csWriteBlocks,
  ru: csWriteBlocks,
  en: csWriteBlocks,
};

const localeAnchors = {
  cs: `          itemUnitPrice: "Cena za jednotku",
        },
      },
      expenses: {
        badge: "Výdaje",`,
  ua: `          itemUnitPrice: "Ціна за одиницю",
        },
      },
      expenses: {
        badge: "Витрати",`,
  ru: `          itemUnitPrice: "Цена за единицу",
        },
      },
      expenses: {
        badge: "Расходы",`,
  en: `          itemUnitPrice: "Unit price",
        },
      },
      expenses: {
        badge: "Expenses",`,
};

for (const locale of ["cs", "ua", "ru", "en"]) {
  const anchor = localeAnchors[locale];
  const replacement = anchor.replace(
    "      expenses: {",
    `${localeWriteBlocks[locale]}
      expenses: {`,
  );
  source = source.replace(anchor, replacement);
}

const authInsert = `
        subjectsTitle: "Pro načtení odběratelů je nutné přihlášení",
        subjectsDescription: "Bez aktivní admin session se seznam odběratelů nenačte.",
        subjectDetailTitle: "Pro detail odběratele je nutné přihlášení",
        subjectDetailDescription: "Bez aktivní admin session se detail odběratele nenačte.",`;

source = source.replace(
  `        attachmentInboxDescription: "Bez aktivní admin session se nezařazené přílohy nenačtou.",
      },
      errors: {`,
  `        attachmentInboxDescription: "Bez aktivní admin session se nezařazené přílohy nenačtou.",${authInsert}
      },
      errors: {`,
);

source = source.replace(
  `        supplierDetailTitle: "Read-only detail dodavatele se nepodařilo načíst",
        bankTransactionsTitle:`,
  `        supplierDetailTitle: "Read-only detail dodavatele se nepodařilo načíst",
        subjectsTitle: "Seznam odběratelů se nepodařilo načíst",
        subjectDetailTitle: "Detail odběratele se nepodařilo načíst",
        bankTransactionsTitle:`,
);

source = source.replace(
  `        dashboardAudit: "Audit události se zatím nepodařilo načíst nebo backend vrátil prázdný seznam.",
      },
      dashboard: {`,
  `        dashboardAudit: "Žádné auditní události se zatím nepodařilo načíst nebo backend vrátil prázdný seznam.",
        subjects: "Zatím nejsou uloženi žádní odběratelé. Spusťte backfill ze starých faktur nebo vytvořte nového odběratele.",
      },
      dashboard: {`,
);

source = source.replace(
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
);

source = source.replace(
  `          documentDetail: "Detail dokladu",
          expenses: "Výdaje",`,
  `          documentDetail: "Detail dokladu",
          subjects: "Odběratelé",
          subjectDetail: "Detail odběratele",
          expenses: "Výdaje",`,
);

source = source.replace(
  `          documentDetail: ["detail dokladu", "detail faktury"],
          expenses: ["výdaje", "přijaté doklady", "náklady"],`,
  `          documentDetail: ["detail dokladu", "detail faktury"],
          subjects: ["odběratelé", "klienti", "subjects registry"],
          subjectDetail: ["detail odběratele", "subject detail"],
          expenses: ["výdaje", "přijaté doklady", "náklady"],`,
);

// UA auth/errors/empty/moduleRegistry/voice patches
source = source.replace(
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
);

source = source.replace(
  `        attachmentInboxTitle: "Не вдалося завантажити read-only inbox вкладень",
        supplementalTitle: "Частину додаткових read-only секцій не вдалося завантажити",`,
  `        attachmentInboxTitle: "Не вдалося завантажити read-only inbox вкладень",
        subjectsTitle: "Не вдалося завантажити список одержувачів",
        subjectDetailTitle: "Не вдалося завантажити деталі одержувача",
        supplementalTitle: "Частину додаткових read-only секцій не вдалося завантажити",`,
);

source = source.replace(
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
);

source = source.replace(
  `        documentDetail: { label: "Деталі документа", description: "Read-only деталі документа з позиціями, платежами, зв'язками та audit-слідом." },
        expenses: { label: "Витрати", description: "Read-only огляд вхідних документів і їх поточних станів оплати." },`,
  `        documentDetail: { label: "Деталі документа", description: "Read-only деталі документа з позиціями, платежами, зв'язками та audit-слідом." },
        subjects: { label: "Одержувачі", description: "Реєстр клієнтів для повторного використання в документах з ARES lookup." },
        subjectDetail: { label: "Деталі одержувача", description: "Деталі збереженого одержувача для повторного використання в документах." },
        expenses: { label: "Витрати", description: "Read-only огляд вхідних документів і їх поточних станів оплати." },`,
);

source = source.replace(
  `          documentDetail: "Деталі документа",
          expenses: "Витрати",`,
  `          documentDetail: "Деталі документа",
          subjects: "Одержувачі",
          subjectDetail: "Деталі одержувача",
          expenses: "Витрати",`,
);

source = source.replace(
  `          documentDetail: ["деталі документа", "деталі рахунку"],
          expenses: ["витрати", "вхідні документи", "затрати"],`,
  `          documentDetail: ["деталі документа", "деталі рахунку"],
          subjects: ["одержувачі", "клієнти", "subjects registry"],
          subjectDetail: ["деталі одержувача", "subject detail"],
          expenses: ["витрати", "вхідні документи", "затрати"],`,
);

// RU patches
source = source.replace(
  `        attachmentInboxDescription: "Без активной admin-сессии несвязанные вложения не загрузятся.",
      },
      errors: {
        dashboardTitle: "Не удалось загрузить read-only бухгалтерский дашборд",`,
  `        attachmentInboxDescription: "Без активной admin-сессии несвязанные вложения не загрузятся.",
        subjectsTitle: "Для загрузки получателей требуется вход",
        subjectsDescription: "Без активной admin-сессии список получателей не загрузится.",
        subjectDetailTitle: "Для деталей получателя требуется вход",
        subjectDetailDescription: "Без активной admin-сессии детали получателя не загрузятся.",
      },
      errors: {
        dashboardTitle: "Не удалось загрузить read-only бухгалтерский дашборд",`,
);

source = source.replace(
  `        attachmentInboxTitle: "Не удалось загрузить read-only inbox вложений",
        supplementalTitle: "Часть дополнительных read-only секций не удалось загрузить",`,
  `        attachmentInboxTitle: "Не удалось загрузить read-only inbox вложений",
        subjectsTitle: "Не удалось загрузить список получателей",
        subjectDetailTitle: "Не удалось загрузить детали получателя",
        supplementalTitle: "Часть дополнительных read-only секций не удалось загрузить",`,
);

source = source.replace(
  `        dashboardAudit: "Audit-события пока не удалось загрузить или бэкенд вернул пустой список.",
      },
      dashboard: {
        badges: {
          parallelSection: "Параллельная секция",`,
  `        dashboardAudit: "Audit-события пока не удалось загрузить или бэкенд вернул пустой список.",
        subjects: "Пока нет сохранённых получателей. Запустите backfill из старых счетов или создайте нового получателя.",
      },
      dashboard: {
        badges: {
          parallelSection: "Параллельная секция",`,
);

source = source.replace(
  `        documentDetail: { label: "Детали документа", description: "Read-only детали документа с позициями, платежами, связями и audit trail." },
        expenses: { label: "Расходы", description: "Read-only обзор входящих документов и их текущих состояний оплаты." },`,
  `        documentDetail: { label: "Детали документа", description: "Read-only детали документа с позициями, платежами, связями и audit trail." },
        subjects: { label: "Получатели", description: "Реестр клиентов для повторного использования в документах с ARES lookup." },
        subjectDetail: { label: "Детали получателя", description: "Детали сохранённого получателя для повторного использования в документах." },
        expenses: { label: "Расходы", description: "Read-only обзор входящих документов и их текущих состояний оплаты." },`,
);

source = source.replace(
  `          documentDetail: "Детали документа",
          expenses: "Расходы",`,
  `          documentDetail: "Детали документа",
          subjects: "Получатели",
          subjectDetail: "Детали получателя",
          expenses: "Расходы",`,
);

source = source.replace(
  `          documentDetail: ["детали документа", "детали счета"],
          expenses: ["расходы", "входящие документы", "затраты"],`,
  `          documentDetail: ["детали документа", "детали счета"],
          subjects: ["получатели", "клиенты", "subjects registry"],
          subjectDetail: ["детали получателя", "subject detail"],
          expenses: ["расходы", "входящие документы", "затраты"],`,
);

// EN patches
source = source.replace(
  `        attachmentInboxDescription: "Without an active admin session unassigned attachments will not load.",
      },
      errors: {
        dashboardTitle: "The read-only accounting dashboard could not be loaded",`,
  `        attachmentInboxDescription: "Without an active admin session unassigned attachments will not load.",
        subjectsTitle: "Login required to load customers",
        subjectsDescription: "Without an active admin session the customer list will not load.",
        subjectDetailTitle: "Login required for customer detail",
        subjectDetailDescription: "Without an active admin session the customer detail will not load.",
      },
      errors: {
        dashboardTitle: "The read-only accounting dashboard could not be loaded",`,
);

source = source.replace(
  `        attachmentInboxTitle: "The read-only attachment inbox could not be loaded",
        supplementalTitle: "Some supplemental read-only sections could not be loaded",`,
  `        attachmentInboxTitle: "The read-only attachment inbox could not be loaded",
        subjectsTitle: "The customer list could not be loaded",
        subjectDetailTitle: "The customer detail could not be loaded",
        supplementalTitle: "Some supplemental read-only sections could not be loaded",`,
);

source = source.replace(
  `        dashboardAudit: "Audit events could not be loaded yet or the backend returned an empty list.",
      },
      dashboard: {
        badges: {
          parallelSection: "Parallel section",`,
  `        dashboardAudit: "Audit events could not be loaded yet or the backend returned an empty list.",
        subjects: "No saved customers yet. Run backfill from legacy invoices or create a new customer.",
      },
      dashboard: {
        badges: {
          parallelSection: "Parallel section",`,
);

source = source.replace(
  `        documentDetail: { label: "Document detail", description: "Read-only document detail with items, payments, relations and audit trail." },
        expenses: { label: "Expenses", description: "Read-only overview of received documents and their current payment states." },`,
  `        documentDetail: { label: "Document detail", description: "Read-only document detail with items, payments, relations and audit trail." },
        subjects: { label: "Customers", description: "Customer registry for reuse in documents including ARES lookup." },
        subjectDetail: { label: "Customer detail", description: "Saved customer detail for reuse in documents." },
        expenses: { label: "Expenses", description: "Read-only overview of received documents and their current payment states." },`,
);

source = source.replace(
  `          documentDetail: "Document detail",
          expenses: "Expenses",`,
  `          documentDetail: "Document detail",
          subjects: "Customers",
          subjectDetail: "Customer detail",
          expenses: "Expenses",`,
);

source = source.replace(
  `          documentDetail: ["document detail", "invoice detail"],
          expenses: ["expenses", "received documents", "costs"],`,
  `          documentDetail: ["document detail", "invoice detail"],
          subjects: ["customers", "subjects", "subject registry"],
          subjectDetail: ["customer detail", "subject detail"],
          expenses: ["expenses", "received documents", "costs"],`,
);

fs.writeFileSync(filePath, source);
console.log("Inserted accounting 23B i18n blocks");
