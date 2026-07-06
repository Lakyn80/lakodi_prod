import fs from "fs";

const filePath = "frontend/src/data/translations.ts";
let source = fs.readFileSync(filePath, "utf8").replace(/\r\n/g, "\n");

function insertAfterLineContaining(marker, insertBlock) {
  const idx = source.indexOf(marker);
  if (idx === -1) {
    throw new Error(`Marker not found: ${marker}`);
  }
  const lineEnd = source.indexOf("\n", idx);
  const insertAt = lineEnd + 1;
  source = source.slice(0, insertAt) + insertBlock + source.slice(insertAt);
}

const registryInserts = [
  {
    marker: 'documentDetail: { label: "Деталі документа"',
    block: `        subjects: { label: "Одержувачі", description: "Реєстр клієнтів для повторного використання в документах з ARES lookup." },\n        subjectDetail: { label: "Деталі одержувача", description: "Деталі збереженого одержувача для повторного використання в документах." },\n`,
  },
  {
    marker: 'documentDetail: { label: "Детали документа"',
    block: `        subjects: { label: "Получатели", description: "Реестр клиентов для повторного использования в документах с ARES lookup." },\n        subjectDetail: { label: "Детали получателя", description: "Детали сохранённого получателя для повторного использования в документах." },\n`,
  },
  {
    marker: 'documentDetail: { label: "Document detail"',
    block: `        subjects: { label: "Customers", description: "Customer registry for reuse in documents including ARES lookup." },\n        subjectDetail: { label: "Customer detail", description: "Saved customer detail for reuse in documents." },\n`,
  },
];

for (const { marker, block } of registryInserts) {
  insertAfterLineContaining(marker, block);
}

function insertVoiceLabels(marker, block) {
  const idx = source.indexOf(marker);
  if (idx === -1) throw new Error(`Voice marker not found: ${marker}`);
  const insertAt = idx + marker.length;
  source = source.slice(0, insertAt) + block + source.slice(insertAt);
}

insertVoiceLabels(
  '          documentDetail: "Деталі документа",\n',
  '          subjects: "Одержувачі",\n          subjectDetail: "Деталі одержувача",\n',
);
insertVoiceLabels(
  '          documentDetail: "Детали документа",\n',
  '          subjects: "Получатели",\n          subjectDetail: "Детали получателя",\n',
);
insertVoiceLabels(
  '          documentDetail: "Document detail",\n',
  '          subjects: "Customers",\n          subjectDetail: "Customer detail",\n',
);

function insertVoiceAliases(marker, block) {
  const idx = source.indexOf(marker);
  if (idx === -1) throw new Error(`Alias marker not found: ${marker}`);
  const insertAt = idx + marker.length;
  source = source.slice(0, insertAt) + block + source.slice(insertAt);
}

insertVoiceAliases(
  '          documentDetail: ["деталі документа", "деталі рахунку"],\n',
  '          subjects: ["одержувачі", "клієнти", "subjects registry"],\n          subjectDetail: ["деталі одержувача", "subject detail"],\n',
);
insertVoiceAliases(
  '          documentDetail: ["детали документа", "детали счета"],\n',
  '          subjects: ["получатели", "клиенты", "subjects registry"],\n          subjectDetail: ["детали получателя", "subject detail"],\n',
);
insertVoiceAliases(
  '          documentDetail: ["document detail", "invoice detail"],\n',
  '          subjects: ["customers", "subjects", "subject registry"],\n          subjectDetail: ["customer detail", "subject detail"],\n',
);

fs.writeFileSync(filePath, source);
console.log("Inserted moduleRegistry/voice subjects keys for ua/ru/en");
