import fs from "fs";
import vm from "vm";

const path = "frontend/src/data/translations.ts";
const source = fs.readFileSync(path, "utf8");
const match = source.match(/export const translations = (\{[\s\S]*?\n\});\s*\nexport type Translations/);
if (!match) throw new Error("parse failed");

const translations = vm.runInNewContext(`(${match[1]})`, {});

const blocks = {
  cs: {
    settingsWrite: {
      badge: "Nastavení",
      title: "Nastavení účetnictví",
      description: "Údaje vystavitele, výchozí měna a platební údaje pro nové doklady.",
      save: "Uložit nastavení",
      loading: "Načítání nastavení…",
      mutation: { success: "Nastavení bylo uloženo.", errorTitle: "Nastavení se nepodařilo uložit." },
      sections: { issuer: "Vystavitel", defaults: "Výchozí hodnoty", payment: "Platba a účet" },
      fields: {
        ownerEmail: "E-mail majitele",
        issuerName: "Název firmy",
        issuerAddress: "Adresa",
        issuerCity: "Město",
        issuerZip: "PSČ",
        issuerIco: "IČO",
        issuerDic: "DIČ",
        issuerDataBox: "Datová schránka",
        issuerEmail: "E-mail vystavitele",
        issuerPhone: "Telefon vystavitele",
        defaultCurrency: "Výchozí měna",
        defaultDueDays: "Výchozí splatnost (dny)",
        defaultNote: "Výchozí poznámka",
        paymentMethod: "Způsob platby",
        bankAccountNumber: "Číslo účtu",
        bankAccountPrefix: "Předčíslí",
        bankCode: "Kód banky",
        bankIban: "IBAN",
      },
    },
    attachmentWrite: {
      uploadTitle: "Nahrát přílohu",
      uploadDescription: "Soubor se uloží do inboxu nebo rovnou k dokladu.",
      uploadAction: "Nahrát soubor",
      uploadSuccess: "Příloha byla nahrána.",
      linkTitle: "Přiřadit přílohu",
      linkDescription: "Propojte soubor s dokladem nebo výdajem.",
      linkAction: "Přiřadit",
      linkSuccess: "Příloha byla přiřazena.",
      downloadAction: "Stáhnout soubor",
      fields: { file: "Soubor", note: "Poznámka", invoiceId: "ID dokladu", expenseId: "ID výdaje" },
    },
    bankWrite: {
      applyAction: "Přiřadit platbu",
      applyConfirmTitle: "Potvrdit párování platby",
      applyConfirmDescription: "Platba se zapíše k navázanému dokladu nebo výdaji.",
      applyConfirmAction: "Přiřadit",
      applySuccess: "Platba byla přiřazena.",
      applyDisabledHint: "Tento návrh párování nelze přiřadit.",
    },
    exportsWrite: {
      badge: "Exporty",
      title: "Exporty dat",
      description: "Stáhněte přehled vydaných dokladů a výdajů.",
      outgoingCsv: "Vydané doklady (CSV)",
      outgoingXlsx: "Vydané doklady (Excel)",
      expensesCsv: "Výdaje (CSV)",
      expensesXlsx: "Výdaje (Excel)",
      downloadAction: "Stáhnout",
      downloadSuccess: "Export byl stažen.",
      downloadErrorTitle: "Export se nepodařil stáhnout.",
    },
  },
  ua: {
    settingsWrite: {
      badge: "Налаштування",
      title: "Налаштування бухгалтерії",
      description: "Дані постачальника послуг, валюта за замовчуванням і платіжні реквізити.",
      save: "Зберегти налаштування",
      loading: "Завантаження налаштувань…",
      mutation: { success: "Налаштування збережено.", errorTitle: "Не вдалося зберегти налаштування." },
      sections: { issuer: "Постачальник послуг", defaults: "Типові значення", payment: "Платіж і рахунок" },
      fields: {
        ownerEmail: "E-mail власника",
        issuerName: "Назва компанії",
        issuerAddress: "Адреса",
        issuerCity: "Місто",
        issuerZip: "Поштовий індекс",
        issuerIco: "IČO",
        issuerDic: "DIČ",
        issuerDataBox: "Datová schránka",
        issuerEmail: "E-mail постачальника",
        issuerPhone: "Телефон постачальника",
        defaultCurrency: "Валюта за замовчуванням",
        defaultDueDays: "Термін оплати (дні)",
        defaultNote: "Типова примітка",
        paymentMethod: "Спосіб оплати",
        bankAccountNumber: "Номер рахунку",
        bankAccountPrefix: "Префікс",
        bankCode: "Код банку",
        bankIban: "IBAN",
      },
    },
    attachmentWrite: {
      uploadTitle: "Завантажити додаток",
      uploadDescription: "Файл буде збережено в inbox або одразу до документа.",
      uploadAction: "Завантажити файл",
      uploadSuccess: "Додаток завантажено.",
      linkTitle: "Призначити додаток",
      linkDescription: "Пов’яжіть файл із документом або витратою.",
      linkAction: "Призначити",
      linkSuccess: "Додаток призначено.",
      downloadAction: "Завантажити файл",
      fields: { file: "Файл", note: "Примітка", invoiceId: "ID документа", expenseId: "ID витрати" },
    },
    bankWrite: {
      applyAction: "Призначити платіж",
      applyConfirmTitle: "Підтвердити зіставлення платежу",
      applyConfirmDescription: "Платіж буде записано до пов’язаного документа або витрати.",
      applyConfirmAction: "Призначити",
      applySuccess: "Платіж призначено.",
      applyDisabledHint: "Цю пропозицію зіставлення не можна застосувати.",
    },
    exportsWrite: {
      badge: "Експорт",
      title: "Експорт даних",
      description: "Завантажте огляд виданих документів і витрат.",
      outgoingCsv: "Видані документи (CSV)",
      outgoingXlsx: "Видані документи (Excel)",
      expensesCsv: "Витрати (CSV)",
      expensesXlsx: "Витрати (Excel)",
      downloadAction: "Завантажити",
      downloadSuccess: "Експорт завантажено.",
      downloadErrorTitle: "Не вдалося завантажити експорт.",
    },
  },
  ru: {
    settingsWrite: {
      badge: "Настройки",
      title: "Настройки бухгалтерии",
      description: "Данные поставщика услуг, валюта по умолчанию и платёжные реквизиты.",
      save: "Сохранить настройки",
      loading: "Загрузка настроек…",
      mutation: { success: "Настройки сохранены.", errorTitle: "Не удалось сохранить настройки." },
      sections: { issuer: "Поставщик услуг", defaults: "Значения по умолчанию", payment: "Платёж и счёт" },
      fields: {
        ownerEmail: "E-mail владельца",
        issuerName: "Название компании",
        issuerAddress: "Адрес",
        issuerCity: "Город",
        issuerZip: "Почтовый индекс",
        issuerIco: "IČO",
        issuerDic: "DIČ",
        issuerDataBox: "Datová schránka",
        issuerEmail: "E-mail поставщика",
        issuerPhone: "Телефон поставщика",
        defaultCurrency: "Валюта по умолчанию",
        defaultDueDays: "Срок оплаты (дни)",
        defaultNote: "Примечание по умолчанию",
        paymentMethod: "Способ оплаты",
        bankAccountNumber: "Номер счёта",
        bankAccountPrefix: "Префикс",
        bankCode: "Код банка",
        bankIban: "IBAN",
      },
    },
    attachmentWrite: {
      uploadTitle: "Загрузить вложение",
      uploadDescription: "Файл будет сохранён в inbox или сразу к документу.",
      uploadAction: "Загрузить файл",
      uploadSuccess: "Вложение загружено.",
      linkTitle: "Назначить вложение",
      linkDescription: "Свяжите файл с документом или расходом.",
      linkAction: "Назначить",
      linkSuccess: "Вложение назначено.",
      downloadAction: "Скачать файл",
      fields: { file: "Файл", note: "Примечание", invoiceId: "ID документа", expenseId: "ID расхода" },
    },
    bankWrite: {
      applyAction: "Назначить платёж",
      applyConfirmTitle: "Подтвердить сопоставление платежа",
      applyConfirmDescription: "Платёж будет записан к связанному документу или расходу.",
      applyConfirmAction: "Назначить",
      applySuccess: "Платёж назначен.",
      applyDisabledHint: "Это предложение сопоставления нельзя применить.",
    },
    exportsWrite: {
      badge: "Экспорт",
      title: "Экспорт данных",
      description: "Скачайте обзор выставленных документов и расходов.",
      outgoingCsv: "Выставленные документы (CSV)",
      outgoingXlsx: "Выставленные документы (Excel)",
      expensesCsv: "Расходы (CSV)",
      expensesXlsx: "Расходы (Excel)",
      downloadAction: "Скачать",
      downloadSuccess: "Экспорт скачан.",
      downloadErrorTitle: "Не удалось скачать экспорт.",
    },
  },
  en: {
    settingsWrite: {
      badge: "Settings",
      title: "Accounting settings",
      description: "Issuer details, default currency, and payment details for new documents.",
      save: "Save settings",
      loading: "Loading settings…",
      mutation: { success: "Settings were saved.", errorTitle: "Could not save settings." },
      sections: { issuer: "Issuer", defaults: "Defaults", payment: "Payment and account" },
      fields: {
        ownerEmail: "Owner email",
        issuerName: "Company name",
        issuerAddress: "Address",
        issuerCity: "City",
        issuerZip: "Postal code",
        issuerIco: "Company ID",
        issuerDic: "Tax ID",
        issuerDataBox: "Data box",
        issuerEmail: "Issuer email",
        issuerPhone: "Issuer phone",
        defaultCurrency: "Default currency",
        defaultDueDays: "Default due days",
        defaultNote: "Default note",
        paymentMethod: "Payment method",
        bankAccountNumber: "Account number",
        bankAccountPrefix: "Account prefix",
        bankCode: "Bank code",
        bankIban: "IBAN",
      },
    },
    attachmentWrite: {
      uploadTitle: "Upload attachment",
      uploadDescription: "The file is saved to the inbox or directly to a document.",
      uploadAction: "Upload file",
      uploadSuccess: "Attachment uploaded.",
      linkTitle: "Assign attachment",
      linkDescription: "Link the file to a document or expense.",
      linkAction: "Assign",
      linkSuccess: "Attachment assigned.",
      downloadAction: "Download file",
      fields: { file: "File", note: "Note", invoiceId: "Document ID", expenseId: "Expense ID" },
    },
    bankWrite: {
      applyAction: "Assign payment",
      applyConfirmTitle: "Confirm payment matching",
      applyConfirmDescription: "The payment will be recorded against the linked document or expense.",
      applyConfirmAction: "Assign",
      applySuccess: "Payment assigned.",
      applyDisabledHint: "This matching suggestion cannot be applied.",
    },
    exportsWrite: {
      badge: "Exports",
      title: "Data exports",
      description: "Download summaries of issued documents and expenses.",
      outgoingCsv: "Issued documents (CSV)",
      outgoingXlsx: "Issued documents (Excel)",
      expensesCsv: "Expenses (CSV)",
      expensesXlsx: "Expenses (Excel)",
      downloadAction: "Download",
      downloadSuccess: "Export downloaded.",
      downloadErrorTitle: "Could not download export.",
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
console.log("Merged 23C i18n blocks");
