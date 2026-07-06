import fs from "fs";

const filePath = "frontend/src/data/translations.ts";
let source = fs.readFileSync(filePath, "utf8").replace(/\r\n/g, "\n");

const writeBlocks = `
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

const localeAnchors = [
  {
    anchor: `          itemUnitPrice: "Cena za jednotku",
        },
      },
      expenses: {
        badge: "Výdaje",`,
  },
  {
    anchor: `          itemUnitPrice: "Ціна за одиницю",
        },
      },
      expenses: {
        badge: "Витрати",`,
  },
  {
    anchor: `          itemUnitPrice: "Цена за единицу",
        },
      },
      expenses: {
        badge: "Расходы",`,
  },
  {
    anchor: `          itemUnitPrice: "Unit price",
        },
      },
      expenses: {
        badge: "Expenses",`,
  },
];

for (const { anchor } of localeAnchors) {
  if (!source.includes(anchor)) {
    throw new Error(`Missing write-block anchor:\n${anchor}`);
  }
  source = source.replace(anchor, `${anchor.split("      expenses:")[0]}${writeBlocks}      expenses:${anchor.split("      expenses:")[1]}`);
}

const replacements = [
  [
    `        attachmentInboxDescription: "Bez aktivní admin session se nezařazené přílohy nenačtou.",
      },
      errors: {`,
    `        attachmentInboxDescription: "Bez aktivní admin session se nezařazené přílohy nenačtou.",
        subjectsTitle: "Pro načtení odběratelů je nutné přihlášení",
        subjectsDescription: "Bez aktivní admin session se seznam odběratelů nenačte.",
        subjectDetailTitle: "Pro detail odběratele je nutné přihlášení",
        subjectDetailDescription: "Bez aktivní admin session se detail odběratele nenačte.",
      },
      errors: {`,
  ],
  [
    `        supplierDetailTitle: "Read-only detail dodavatele se nepodařilo načíst",
        bankTransactionsTitle:`,
    `        supplierDetailTitle: "Read-only detail dodavatele se nepodařilo načíst",
        subjectsTitle: "Seznam odběratelů se nepodařilo načíst",
        subjectDetailTitle: "Detail odběratele se nepodařilo načíst",
        bankTransactionsTitle:`,
  ],
  [
    `        dashboardAudit: "Žádné auditní události se zatím nepodařilo načíst nebo backend vrátil prázdný seznam.",
      },
      dashboard: {`,
    `        dashboardAudit: "Žádné auditní události se zatím nepodařilo načíst nebo backend vrátil prázdný seznam.",
        subjects: "Zatím nejsou uloženi žádní odběratelé. Spusťte backfill ze starých faktur nebo vytvořte nového odběratele.",
      },
      dashboard: {`,
  ],
];

for (const [from, to] of replacements) {
  if (!source.includes(from)) throw new Error(`Missing patch anchor: ${from.slice(0, 60)}`);
  source = source.replace(from, to);
}

fs.writeFileSync(filePath, source);
console.log("Applied accounting 23B i18n write blocks for all locales");
