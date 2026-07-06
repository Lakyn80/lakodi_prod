import fs from "fs";
import vm from "vm";

const path = "frontend/src/data/translations.ts";
const source = fs.readFileSync(path, "utf8");
const match = source.match(/export const translations = (\{[\s\S]*?\n\});\s*\nexport type Translations/);
if (!match) throw new Error("parse failed");

const translations = vm.runInNewContext(`(${match[1]})`, {});

const recurringFormCs = {
  createTitle: "Nová opakovaná šablona",
  editTitle: "Upravit opakovanou šablonu",
  description: "Nastavte pravidelné vystavování dokladů nebo výdajů.",
  createAction: "Nová šablona",
  editAction: "Upravit šablonu",
  saveAction: "Uložit šablonu",
  saving: "Ukládám…",
  loading: "Načítám šablonu…",
  itemsTitle: "Položky šablony",
  addItem: "Přidat položku",
  templateTypes: { invoice: "Vydaný doklad", expense: "Výdaj" },
  placeholders: { supplier: "Vyberte dodavatele" },
  fields: {
    templateType: "Typ šablony",
    name: "Název šablony",
    documentKind: "Druh dokladu",
    status: "Stav",
    recurrenceInterval: "Interval",
    recurrenceCount: "Počet intervalů",
    nextRunDate: "Další běh",
    currency: "Měna",
    businessMode: "Obchodní režim",
    taxMode: "Daňový režim",
    vatRate: "Sazba DPH",
    subject: "Odběratel",
    supplier: "Dodavatel",
    paymentMethod: "Způsob platby",
    bankAccountNumber: "Číslo účtu",
    bankCode: "Kód banky",
    bankIban: "IBAN",
    note: "Poznámka",
    itemDescription: "Popis",
    itemQuantity: "Množství",
    itemUnitPrice: "Jednotková cena",
  },
  validation: {
    title: "Formulář nelze uložit",
    nameRequired: "Název šablony je povinný.",
    nextRunDateRequired: "Datum dalšího běhu je povinné.",
    subjectRequired: "Vyberte odběratele.",
    supplierRequired: "Vyberte dodavatele.",
    paymentRequired: "Vyplňte platební údaje výdaje.",
    itemsRequired: "Přidejte alespoň jednu položku.",
    itemNumbers: "Množství musí být větší než nula.",
  },
};

const ragActionsCs = {
  read: "Zobrazit",
  create: "Vytvořit",
  update: "Upravit",
  delete: "Smazat",
  send: "Odeslat",
  export: "Exportovat",
  import: "Importovat",
  apply: "Přiřadit",
  generate: "Vygenerovat",
  upload: "Nahrát",
  link: "Přiřadit vazbu",
  archive: "Archivovat",
};

const blocks = {
  cs: {
    recurringForm: recurringFormCs,
    rag: {
      actions: ragActionsCs,
      entityTypes: { settings: "Nastavení účetnictví" },
      searchableFields: {
        issuerName: "Název vystavitele",
        defaultCurrency: "Výchozí měna",
        paymentMethod: "Způsob platby",
      },
    },
    moduleRegistry: {
      settings: {
        label: "Nastavení",
        description: "Údaje vystavitele, výchozí měna a platební údaje pro nové doklady.",
      },
    },
    voice: {
      labels: { settings: "Nastavení účetnictví" },
      aliases: { settings: ["nastavení účetnictví", "nastavení faktur", "issuer settings"] },
    },
  },
  ua: {
    recurringForm: {
      ...recurringFormCs,
      createTitle: "Новий повторюваний шаблон",
      editTitle: "Редагувати повторюваний шаблон",
      description: "Налаштуйте регулярне виставлення документів або витрат.",
      createAction: "Новий шаблон",
      editAction: "Редагувати шаблон",
      saveAction: "Зберегти шаблон",
      saving: "Зберігаю…",
      loading: "Завантаження шаблону…",
      itemsTitle: "Позиції шаблону",
      addItem: "Додати позицію",
      templateTypes: { invoice: "Виданий документ", expense: "Витрата" },
      placeholders: { supplier: "Оберіть постачальника" },
      fields: {
        templateType: "Тип шаблону",
        name: "Назва шаблону",
        documentKind: "Тип документа",
        status: "Стан",
        recurrenceInterval: "Інтервал",
        recurrenceCount: "Кількість інтервалів",
        nextRunDate: "Наступний запуск",
        currency: "Валюта",
        businessMode: "Бізнес-режим",
        taxMode: "Податковий режим",
        vatRate: "Ставка ПДВ",
        subject: "Одержувач",
        supplier: "Постачальник",
        paymentMethod: "Спосіб оплати",
        bankAccountNumber: "Номер рахунку",
        bankCode: "Код банку",
        bankIban: "IBAN",
        note: "Примітка",
        itemDescription: "Опис",
        itemQuantity: "Кількість",
        itemUnitPrice: "Ціна за одиницю",
      },
      validation: {
        title: "Форму не можна зберегти",
        nameRequired: "Назва шаблону обов'язкова.",
        nextRunDateRequired: "Дата наступного запуску обов'язкова.",
        subjectRequired: "Оберіть одержувача.",
        supplierRequired: "Оберіть постачальника.",
        paymentRequired: "Заповніть платіжні реквізити витрати.",
        itemsRequired: "Додайте принаймні одну позицію.",
        itemNumbers: "Кількість має бути більша за нуль.",
      },
    },
    rag: {
      actions: {
        read: "Переглянути",
        create: "Створити",
        update: "Редагувати",
        delete: "Видалити",
        send: "Надіслати",
        export: "Експортувати",
        import: "Імпортувати",
        apply: "Призначити",
        generate: "Згенерувати",
        upload: "Завантажити",
        link: "Прив'язати",
        archive: "Архівувати",
      },
      entityTypes: { settings: "Налаштування бухгалтерії" },
      searchableFields: {
        issuerName: "Назва постачальника послуг",
        defaultCurrency: "Валюта за замовчуванням",
        paymentMethod: "Спосіб оплати",
      },
    },
    moduleRegistry: {
      settings: {
        label: "Налаштування",
        description: "Дані постачальника послуг, валюта за замовчуванням і платіжні реквізити.",
      },
    },
    voice: {
      labels: { settings: "Налаштування бухгалтерії" },
      aliases: { settings: ["налаштування бухгалтерії", "налаштування рахунків", "issuer settings"] },
    },
  },
  ru: {
    recurringForm: {
      ...recurringFormCs,
      createTitle: "Новый повторяющийся шаблон",
      editTitle: "Редактировать шаблон",
      description: "Настройте регулярное выставление документов или расходов.",
      createAction: "Новый шаблон",
      editAction: "Редактировать шаблон",
      saveAction: "Сохранить шаблон",
      saving: "Сохраняю…",
      loading: "Загрузка шаблона…",
      itemsTitle: "Позиции шаблона",
      addItem: "Добавить позицию",
      templateTypes: { invoice: "Выставленный документ", expense: "Расход" },
      placeholders: { supplier: "Выберите поставщика" },
      fields: {
        templateType: "Тип шаблона",
        name: "Название шаблона",
        documentKind: "Тип документа",
        status: "Статус",
        recurrenceInterval: "Интервал",
        recurrenceCount: "Количество интервалов",
        nextRunDate: "Следующий запуск",
        currency: "Валюта",
        businessMode: "Бизнес-режим",
        taxMode: "Налоговый режим",
        vatRate: "Ставка НДС",
        subject: "Получатель",
        supplier: "Поставщик",
        paymentMethod: "Способ оплаты",
        bankAccountNumber: "Номер счёта",
        bankCode: "Код банка",
        bankIban: "IBAN",
        note: "Примечание",
        itemDescription: "Описание",
        itemQuantity: "Количество",
        itemUnitPrice: "Цена за единицу",
      },
      validation: {
        title: "Форму нельзя сохранить",
        nameRequired: "Название шаблона обязательно.",
        nextRunDateRequired: "Дата следующего запуска обязательна.",
        subjectRequired: "Выберите получателя.",
        supplierRequired: "Выберите поставщика.",
        paymentRequired: "Заполните платёжные реквизиты расхода.",
        itemsRequired: "Добавьте хотя бы одну позицию.",
        itemNumbers: "Количество должно быть больше нуля.",
      },
    },
    rag: {
      actions: {
        read: "Просмотреть",
        create: "Создать",
        update: "Редактировать",
        delete: "Удалить",
        send: "Отправить",
        export: "Экспортировать",
        import: "Импортировать",
        apply: "Назначить",
        generate: "Сгенерировать",
        upload: "Загрузить",
        link: "Связать",
        archive: "Архивировать",
      },
      entityTypes: { settings: "Настройки бухгалтерии" },
      searchableFields: {
        issuerName: "Название поставщика услуг",
        defaultCurrency: "Валюта по умолчанию",
        paymentMethod: "Способ оплаты",
      },
    },
    moduleRegistry: {
      settings: {
        label: "Настройки",
        description: "Данные поставщика услуг, валюта по умолчанию и платёжные реквизиты.",
      },
    },
    voice: {
      labels: { settings: "Настройки бухгалтерии" },
      aliases: { settings: ["настройки бухгалтерии", "настройки счетов", "issuer settings"] },
    },
  },
  en: {
    recurringForm: {
      ...recurringFormCs,
      createTitle: "New recurring template",
      editTitle: "Edit recurring template",
      description: "Configure recurring document or expense generation.",
      createAction: "New template",
      editAction: "Edit template",
      saveAction: "Save template",
      saving: "Saving…",
      loading: "Loading template…",
      itemsTitle: "Template items",
      addItem: "Add item",
      templateTypes: { invoice: "Issued document", expense: "Expense" },
      placeholders: { supplier: "Select supplier" },
      fields: {
        templateType: "Template type",
        name: "Template name",
        documentKind: "Document kind",
        status: "Status",
        recurrenceInterval: "Interval",
        recurrenceCount: "Interval count",
        nextRunDate: "Next run date",
        currency: "Currency",
        businessMode: "Business mode",
        taxMode: "Tax mode",
        vatRate: "VAT rate",
        subject: "Customer",
        supplier: "Supplier",
        paymentMethod: "Payment method",
        bankAccountNumber: "Account number",
        bankCode: "Bank code",
        bankIban: "IBAN",
        note: "Note",
        itemDescription: "Description",
        itemQuantity: "Quantity",
        itemUnitPrice: "Unit price",
      },
      validation: {
        title: "Form cannot be saved",
        nameRequired: "Template name is required.",
        nextRunDateRequired: "Next run date is required.",
        subjectRequired: "Select a customer.",
        supplierRequired: "Select a supplier.",
        paymentRequired: "Fill in expense payment details.",
        itemsRequired: "Add at least one item.",
        itemNumbers: "Quantity must be greater than zero.",
      },
    },
    rag: {
      actions: {
        read: "View",
        create: "Create",
        update: "Update",
        delete: "Delete",
        send: "Send",
        export: "Export",
        import: "Import",
        apply: "Apply",
        generate: "Generate",
        upload: "Upload",
        link: "Link",
        archive: "Archive",
      },
      entityTypes: { settings: "Accounting settings" },
      searchableFields: {
        issuerName: "Issuer name",
        defaultCurrency: "Default currency",
        paymentMethod: "Payment method",
      },
    },
    moduleRegistry: {
      settings: {
        label: "Settings",
        description: "Issuer details, default currency, and payment details for new documents.",
      },
    },
    voice: {
      labels: { settings: "Accounting settings" },
      aliases: { settings: ["accounting settings", "invoice settings", "issuer settings"] },
    },
  },
};

function mergeDeep(target, patch) {
  for (const [key, value] of Object.entries(patch)) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      if (!target[key] || typeof target[key] !== "object") target[key] = {};
      mergeDeep(target[key], value);
    } else {
      target[key] = value;
    }
  }
}

for (const locale of ["cs", "ua", "ru", "en"]) {
  mergeDeep(translations[locale].accountingNew, blocks[locale]);
}

function stringifyValue(value, indent) {
  if (typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) {
    if (value.length === 0) return "[]";
    return `[\n${value.map((item) => `${" ".repeat(indent + 2)}${stringifyValue(item, indent + 2)}`).join(",\n")}\n${" ".repeat(indent)}]`;
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value);
    if (entries.length === 0) return "{}";
    return `{\n${entries.map(([key, child]) => `${" ".repeat(indent + 2)}${key}: ${stringifyValue(child, indent + 2)}`).join(",\n")}\n${" ".repeat(indent)}}`;
  }
  return String(value);
}

let updated = source;
for (const locale of ["cs", "ua", "ru", "en"]) {
  const startMarker = `\n  ${locale}: {`;
  const startIndex = updated.indexOf(startMarker);
  if (startIndex === -1) throw new Error(`Locale block not found: ${locale}`);
  const accountingStart = updated.indexOf("accountingNew: {", startIndex);
  let depth = 0;
  let endIndex = -1;
  for (let i = accountingStart + "accountingNew: ".length; i < updated.length; i += 1) {
    if (updated[i] === "{") depth += 1;
    if (updated[i] === "}") {
      depth -= 1;
      if (depth === 0) {
        endIndex = i + 1;
        break;
      }
    }
  }
  const replacement = `accountingNew: ${stringifyValue(translations[locale].accountingNew, 4)}`;
  updated = updated.slice(0, accountingStart) + replacement + updated.slice(endIndex);
}

fs.writeFileSync(path, updated);
console.log("Merged 23E i18n blocks");
