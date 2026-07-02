$ErrorActionPreference = "Stop"

$script = @'
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const translationsPath = path.resolve("frontend/src/data/translations.ts");
const source = fs.readFileSync(translationsPath, "utf8");
const match = source.match(/export const translations = (\{[\s\S]*?\n\});\s*\nexport type Translations/);

if (!match) {
  throw new Error(`Could not parse translations from ${translationsPath}`);
}

const translations = vm.runInNewContext(`(${match[1]})`, {});
const locales = ["cs", "ua", "ru", "en"];
const base = translations.cs?.accountingNew;

if (!base) {
  throw new Error("Missing translations.cs.accountingNew");
}

const missing = [];

function walk(baseNode, compareNode, currentPath, locale) {
  if (Array.isArray(baseNode)) {
    if (!Array.isArray(compareNode)) {
      missing.push(`${locale}: ${currentPath} (expected array)`);
      return;
    }

    if (compareNode.length !== baseNode.length) {
      missing.push(`${locale}: ${currentPath} (expected array length ${baseNode.length}, got ${compareNode.length})`);
    }

    baseNode.forEach((item, index) => {
      walk(item, compareNode[index], `${currentPath}[${index}]`, locale);
    });
    return;
  }

  if (baseNode && typeof baseNode === "object") {
    if (!compareNode || typeof compareNode !== "object" || Array.isArray(compareNode)) {
      missing.push(`${locale}: ${currentPath} (expected object)`);
      return;
    }

    for (const key of Object.keys(baseNode)) {
      const nextPath = currentPath ? `${currentPath}.${key}` : key;
      walk(baseNode[key], compareNode[key], nextPath, locale);
    }
    return;
  }

  if (compareNode === undefined) {
    missing.push(`${locale}: ${currentPath}`);
  }
}

for (const locale of locales.slice(1)) {
  const compareRoot = translations[locale]?.accountingNew;
  if (!compareRoot) {
    missing.push(`${locale}: accountingNew`);
    continue;
  }
  walk(base, compareRoot, "accountingNew", locale);
}

if (missing.length > 0) {
  console.error("Missing accounting i18n keys:");
  for (const item of missing) {
    console.error(`- ${item}`);
  }
  process.exit(1);
}

console.log("Accounting i18n keys are complete for locales: cs, ua, ru, en");
'@

$script | node -
