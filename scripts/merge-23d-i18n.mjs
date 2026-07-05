import fs from "fs";
import vm from "vm";

const path = "frontend/src/data/translations.ts";
const source = fs.readFileSync(path, "utf8");
const match = source.match(/export const translations = (\{[\s\S]*?\n\});\s*\nexport type Translations/);
if (!match) throw new Error("parse failed");

const translations = vm.runInNewContext(`(${match[1]})`, {});

const extendedBankWrite = {
  rejectAction: "Zamítnout návrh",
  rejectConfirmTitle: "Zamítnout návrh párování",
  rejectConfirmDescription: "Návrh se označí jako zamítnutý a nebude použit.",
  rejectSuccess: "Návrh párování byl zamítnut.",
  actionsColumn: "Akce",
  importTitle: "Import bankovních transakcí",
  importDescription: "Vložte JSON pole transakcí exportovaných z banky.",
  importJsonLabel: "JSON transakcí",
  importAction: "Importovat",
  importConfirmTitle: "Potvrdit import transakcí",
  importConfirmDescription: "Nové transakce se přidají k existujícím záznamům.",
  importSuccess: "Import dokončen: {imported} nových, {skipped} přeskočených.",
  importInvalidJson: "JSON není platné pole transakcí.",
  generateAction: "Vygenerovat návrhy",
  generateConfirmTitle: "Vygenerovat návrhy párování",
  generateConfirmDescription: "Systém znovu vyhledá shody podle VS a částky.",
  generateSuccess: "Návrhy párování byly vygenerovány.",
  ignoreAction: "Ignorovat transakci",
  ignoreConfirmTitle: "Ignorovat bankovní transakci",
  ignoreConfirmDescription: "Transakce se označí jako ignorovaná a nebude se párovat.",
  ignoreSuccess: "Transakce byla ignorována.",
};

const blocks = {
  cs: {
    bankWrite: extendedBankWrite,
    todoWrite: {
      generateAction: "Vygenerovat úkoly",
      generateConfirmTitle: "Vygenerovat úkoly z dokladů",
      generateConfirmDescription: "Vytvoří úkoly pro neuhrazené doklady po splatnosti.",
      generateSuccess: "Vygenerováno {generated} úkolů, {skipped} již existovalo.",
      completeAction: "Dokončit úkol",
      completeConfirmTitle: "Dokončit úkol",
      completeConfirmDescription: "Úkol se označí jako hotový.",
      completeSuccess: "Úkol byl dokončen.",
      cancelAction: "Zrušit úkol",
      cancelConfirmTitle: "Zrušit úkol",
      cancelConfirmDescription: "Úkol se označí jako zrušený.",
      cancelSuccess: "Úkol byl zrušen.",
    },
    reminderWrite: {
      sectionTitle: "Odeslat upomínku",
      sendTitle: "Upomínkový e-mail",
      sendDescription: "Odešle upomínku k navázanému dokladu.",
      sendAction: "Odeslat upomínku",
      sendConfirmTitle: "Potvrdit odeslání upomínky",
      sendConfirmDescription: "E-mail se odešle příjemci uvedenému níže.",
      sendSuccess: "Upomínka byla odeslána",
      fields: { toEmail: "Příjemce", subject: "Předmět", message: "Zpráva" },
    },
    emailWrite: {
      sendAction: "Odeslat doklad e-mailem",
      sendConfirmTitle: "Potvrdit odeslání dokladu",
      sendConfirmDescription: "Doklad se odešle na e-mail odběratele.",
      sendSuccess: "Doklad byl odeslán",
    },
    recurringWrite: {
      generateAction: "Vygenerovat doklad",
      generateConfirmTitle: "Vygenerovat doklad ze šablony",
      generateConfirmDescription: "Vytvoří nový doklad nebo výdaj podle šablony.",
      generateSuccess: "Doklad #{id} byl vygenerován.",
      pauseAction: "Pozastavit",
      pauseConfirmTitle: "Pozastavit šablonu",
      pauseConfirmDescription: "Automatické generování se dočasně zastaví.",
      pauseSuccess: "Šablona byla pozastavena.",
      activateAction: "Aktivovat",
      activateConfirmTitle: "Aktivovat šablonu",
      activateConfirmDescription: "Automatické generování bude znovu povoleno.",
      activateSuccess: "Šablona byla aktivována.",
      cancelAction: "Zrušit šablonu",
      cancelConfirmTitle: "Zrušit šablonu",
      cancelConfirmDescription: "Šablona se trvale deaktivuje.",
      cancelSuccess: "Šablona byla zrušena.",
    },
    auditPanel: {
      title: "Auditní události",
      description: "Poslední změny a operace v modulu Účetnictví.",
    },
    paymentMatching: {
      apiNote: "Návrhy párování spravujte v detailu bankovní transakce.",
      deferredDescription: "Otevřete detail transakce pro přiřazení nebo zamítnutí návrhů.",
    },
  },
  ua: {
    bankWrite: {
      ...extendedBankWrite,
      rejectAction: "Відхилити пропозицію",
      rejectConfirmTitle: "Відхилити пропозицію зіставлення",
      rejectConfirmDescription: "Пропозицію буде позначено як відхилену.",
      rejectSuccess: "Пропозицію зіставлення відхилено.",
      actionsColumn: "Дії",
      importTitle: "Імпорт банківських транзакцій",
      importDescription: "Вставте JSON-масив транзакцій з банку.",
      importJsonLabel: "JSON транзакцій",
      importAction: "Імпортувати",
      importConfirmTitle: "Підтвердити імпорт транзакцій",
      importConfirmDescription: "Нові транзакції буде додано до наявних записів.",
      importSuccess: "Імпорт завершено: {imported} нових, {skipped} пропущено.",
      importInvalidJson: "JSON не є дійсним масивом транзакцій.",
      generateAction: "Згенерувати пропозиції",
      generateConfirmTitle: "Згенерувати пропозиції зіставлення",
      generateConfirmDescription: "Система знову знайде збіги за VS і сумою.",
      generateSuccess: "Пропозиції зіставлення згенеровано.",
      ignoreAction: "Ігнорувати транзакцію",
      ignoreConfirmTitle: "Ігнорувати банківську транзакцію",
      ignoreConfirmDescription: "Транзакцію буде позначено як проігноровану.",
      ignoreSuccess: "Транзакцію проігноровано.",
      applyAction: "Призначити платіж",
      applyConfirmTitle: "Підтвердити зіставлення платежу",
      applyConfirmDescription: "Платіж буде записано до пов’язаного документа або витрати.",
      applyConfirmAction: "Призначити",
      applySuccess: "Платіж призначено.",
      applyDisabledHint: "Цю пропозицію зіставлення не можна застосувати.",
    },
    todoWrite: {
      generateAction: "Згенерувати завдання",
      generateConfirmTitle: "Згенерувати завдання з документів",
      generateConfirmDescription: "Створить завдання для прострочених неоплачених документів.",
      generateSuccess: "Згенеровано {generated} завдань, {skipped} уже існувало.",
      completeAction: "Завершити завдання",
      completeConfirmTitle: "Завершити завдання",
      completeConfirmDescription: "Завдання буде позначено як виконане.",
      completeSuccess: "Завдання завершено.",
      cancelAction: "Скасувати завдання",
      cancelConfirmTitle: "Скасувати завдання",
      cancelConfirmDescription: "Завдання буде позначено як скасоване.",
      cancelSuccess: "Завдання скасовано.",
    },
    reminderWrite: {
      sectionTitle: "Надіслати нагадування",
      sendTitle: "E-mail нагадування",
      sendDescription: "Надішле нагадування для пов’язаного документа.",
      sendAction: "Надіслати нагадування",
      sendConfirmTitle: "Підтвердити надсилання нагадування",
      sendConfirmDescription: "E-mail буде надіслано вказаному одержувачу.",
      sendSuccess: "Нагадування надіслано",
      fields: { toEmail: "Одержувач", subject: "Тема", message: "Повідомлення" },
    },
    emailWrite: {
      sendAction: "Надіслати документ e-mailом",
      sendConfirmTitle: "Підтвердити надсилання документа",
      sendConfirmDescription: "Документ буде надіслано клієнту.",
      sendSuccess: "Документ надіслано",
    },
    recurringWrite: {
      generateAction: "Згенерувати документ",
      generateConfirmTitle: "Згенерувати документ із шаблону",
      generateConfirmDescription: "Створить новий документ або витрату за шаблоном.",
      generateSuccess: "Документ #{id} згенеровано.",
      pauseAction: "Призупинити",
      pauseConfirmTitle: "Призупинити шаблон",
      pauseConfirmDescription: "Автоматичне генерування тимчасово зупиниться.",
      pauseSuccess: "Шаблон призупинено.",
      activateAction: "Активувати",
      activateConfirmTitle: "Активувати шаблон",
      activateConfirmDescription: "Автоматичне генерування знову буде увімкнено.",
      activateSuccess: "Шаблон активовано.",
      cancelAction: "Скасувати шаблон",
      cancelConfirmTitle: "Скасувати шаблон",
      cancelConfirmDescription: "Шаблон буде остаточно деактивовано.",
      cancelSuccess: "Шаблон скасовано.",
    },
    auditPanel: {
      title: "Audit-події",
      description: "Останні зміни та операції в модулі бухгалтерії.",
    },
    paymentMatching: {
      apiNote: "Пропозиції зіставлення керуйте в деталях банківської транзакції.",
      deferredDescription: "Відкрийте деталі транзакції, щоб призначити або відхилити пропозиції.",
    },
  },
  ru: {
    bankWrite: {
      ...extendedBankWrite,
      rejectAction: "Отклонить предложение",
      rejectConfirmTitle: "Отклонить предложение сопоставления",
      rejectConfirmDescription: "Предложение будет помечено как отклонённое.",
      rejectSuccess: "Предложение сопоставления отклонено.",
      actionsColumn: "Действия",
      importTitle: "Импорт банковских транзакций",
      importDescription: "Вставьте JSON-массив транзакций из банка.",
      importJsonLabel: "JSON транзакций",
      importAction: "Импортировать",
      importConfirmTitle: "Подтвердить импорт транзакций",
      importConfirmDescription: "Новые транзакции будут добавлены к существующим записям.",
      importSuccess: "Импорт завершён: {imported} новых, {skipped} пропущено.",
      importInvalidJson: "JSON не является допустимым массивом транзакций.",
      generateAction: "Сгенерировать предложения",
      generateConfirmTitle: "Сгенерировать предложения сопоставления",
      generateConfirmDescription: "Система снова найдёт совпадения по VS и сумме.",
      generateSuccess: "Предложения сопоставления сгенерированы.",
      ignoreAction: "Игнорировать транзакцию",
      ignoreConfirmTitle: "Игнорировать банковскую транзакцию",
      ignoreConfirmDescription: "Транзакция будет помечена как проигнорированная.",
      ignoreSuccess: "Транзакция проигнорирована.",
      applyAction: "Назначить платёж",
      applyConfirmTitle: "Подтвердить сопоставление платежа",
      applyConfirmDescription: "Платёж будет записан к связанному документу или расходу.",
      applyConfirmAction: "Назначить",
      applySuccess: "Платёж назначен.",
      applyDisabledHint: "Это предложение сопоставления нельзя применить.",
    },
    todoWrite: {
      generateAction: "Сгенерировать задачи",
      generateConfirmTitle: "Сгенерировать задачи из документов",
      generateConfirmDescription: "Создаст задачи для просроченных неоплаченных документов.",
      generateSuccess: "Сгенерировано {generated} задач, {skipped} уже существовало.",
      completeAction: "Завершить задачу",
      completeConfirmTitle: "Завершить задачу",
      completeConfirmDescription: "Задача будет помечена как выполненная.",
      completeSuccess: "Задача завершена.",
      cancelAction: "Отменить задачу",
      cancelConfirmTitle: "Отменить задачу",
      cancelConfirmDescription: "Задача будет помечена как отменённая.",
      cancelSuccess: "Задача отменена.",
    },
    reminderWrite: {
      sectionTitle: "Отправить напоминание",
      sendTitle: "E-mail напоминание",
      sendDescription: "Отправит напоминание по связанному документу.",
      sendAction: "Отправить напоминание",
      sendConfirmTitle: "Подтвердить отправку напоминания",
      sendConfirmDescription: "E-mail будет отправлен указанному получателю.",
      sendSuccess: "Напоминание отправлено",
      fields: { toEmail: "Получатель", subject: "Тема", message: "Сообщение" },
    },
    emailWrite: {
      sendAction: "Отправить документ по e-mail",
      sendConfirmTitle: "Подтвердить отправку документа",
      sendConfirmDescription: "Документ будет отправлен клиенту.",
      sendSuccess: "Документ отправлен",
    },
    recurringWrite: {
      generateAction: "Сгенерировать документ",
      generateConfirmTitle: "Сгенерировать документ из шаблона",
      generateConfirmDescription: "Создаст новый документ или расход по шаблону.",
      generateSuccess: "Документ #{id} сгенерирован.",
      pauseAction: "Приостановить",
      pauseConfirmTitle: "Приостановить шаблон",
      pauseConfirmDescription: "Автоматическая генерация временно остановится.",
      pauseSuccess: "Шаблон приостановлен.",
      activateAction: "Активировать",
      activateConfirmTitle: "Активировать шаблон",
      activateConfirmDescription: "Автоматическая генерация снова будет включена.",
      activateSuccess: "Шаблон активирован.",
      cancelAction: "Отменить шаблон",
      cancelConfirmTitle: "Отменить шаблон",
      cancelConfirmDescription: "Шаблон будет окончательно деактивирован.",
      cancelSuccess: "Шаблон отменён.",
    },
    auditPanel: {
      title: "Audit-события",
      description: "Последние изменения и операции в модуле бухгалтерии.",
    },
    paymentMatching: {
      apiNote: "Предложения сопоставления управляйте в деталях банковской транзакции.",
      deferredDescription: "Откройте детали транзакции, чтобы назначить или отклонить предложения.",
    },
  },
  en: {
    bankWrite: {
      ...extendedBankWrite,
      rejectAction: "Reject suggestion",
      rejectConfirmTitle: "Reject matching suggestion",
      rejectConfirmDescription: "The suggestion will be marked as rejected.",
      rejectSuccess: "Matching suggestion rejected.",
      actionsColumn: "Actions",
      importTitle: "Import bank transactions",
      importDescription: "Paste a JSON array of transactions exported from your bank.",
      importJsonLabel: "Transaction JSON",
      importAction: "Import",
      importConfirmTitle: "Confirm transaction import",
      importConfirmDescription: "New transactions will be added to existing records.",
      importSuccess: "Import finished: {imported} new, {skipped} skipped.",
      importInvalidJson: "JSON is not a valid transaction array.",
      generateAction: "Generate suggestions",
      generateConfirmTitle: "Generate matching suggestions",
      generateConfirmDescription: "The system will search again by variable symbol and amount.",
      generateSuccess: "Matching suggestions were generated.",
      ignoreAction: "Ignore transaction",
      ignoreConfirmTitle: "Ignore bank transaction",
      ignoreConfirmDescription: "The transaction will be marked as ignored.",
      ignoreSuccess: "Transaction ignored.",
      applyAction: "Assign payment",
      applyConfirmTitle: "Confirm payment matching",
      applyConfirmDescription: "The payment will be recorded against the linked document or expense.",
      applyConfirmAction: "Assign",
      applySuccess: "Payment assigned.",
      applyDisabledHint: "This matching suggestion cannot be applied.",
    },
    todoWrite: {
      generateAction: "Generate tasks",
      generateConfirmTitle: "Generate tasks from documents",
      generateConfirmDescription: "Creates tasks for overdue unpaid documents.",
      generateSuccess: "Generated {generated} tasks, {skipped} already existed.",
      completeAction: "Complete task",
      completeConfirmTitle: "Complete task",
      completeConfirmDescription: "The task will be marked as done.",
      completeSuccess: "Task completed.",
      cancelAction: "Cancel task",
      cancelConfirmTitle: "Cancel task",
      cancelConfirmDescription: "The task will be marked as cancelled.",
      cancelSuccess: "Task cancelled.",
    },
    reminderWrite: {
      sectionTitle: "Send reminder",
      sendTitle: "Reminder email",
      sendDescription: "Sends a reminder for the linked document.",
      sendAction: "Send reminder",
      sendConfirmTitle: "Confirm reminder send",
      sendConfirmDescription: "The email will be sent to the recipient below.",
      sendSuccess: "Reminder sent",
      fields: { toEmail: "Recipient", subject: "Subject", message: "Message" },
    },
    emailWrite: {
      sendAction: "Email document",
      sendConfirmTitle: "Confirm document send",
      sendConfirmDescription: "The document will be emailed to the customer.",
      sendSuccess: "Document sent",
    },
    recurringWrite: {
      generateAction: "Generate document",
      generateConfirmTitle: "Generate document from template",
      generateConfirmDescription: "Creates a new document or expense from the template.",
      generateSuccess: "Document #{id} was generated.",
      pauseAction: "Pause",
      pauseConfirmTitle: "Pause template",
      pauseConfirmDescription: "Automatic generation will stop temporarily.",
      pauseSuccess: "Template paused.",
      activateAction: "Activate",
      activateConfirmTitle: "Activate template",
      activateConfirmDescription: "Automatic generation will be enabled again.",
      activateSuccess: "Template activated.",
      cancelAction: "Cancel template",
      cancelConfirmTitle: "Cancel template",
      cancelConfirmDescription: "The template will be permanently deactivated.",
      cancelSuccess: "Template cancelled.",
    },
    auditPanel: {
      title: "Audit events",
      description: "Recent changes and operations in Accounting.",
    },
    paymentMatching: {
      apiNote: "Manage matching suggestions in the bank transaction detail.",
      deferredDescription: "Open a transaction detail to assign or reject suggestions.",
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
console.log("Merged 23D i18n blocks");
