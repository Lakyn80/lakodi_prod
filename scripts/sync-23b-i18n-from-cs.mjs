import fs from "fs";
import vm from "vm";

const filePath = "frontend/src/data/translations.ts";
let source = fs.readFileSync(filePath, "utf8").replace(/\r\n/g, "\n");
const match = source.match(/export const translations = (\{[\s\S]*?\n\});\s*\nexport type Translations/);
if (!match) throw new Error("parse failed");

const translations = vm.runInNewContext(`(${match[1]})`, {});
const keys = ["aresWrite", "subjectWrite", "supplierWrite", "expenseWrite", "subjects", "subjectDetail"];

function serializeBlocks(root) {
  return keys
    .map((key) => {
      const json = JSON.stringify(root[key], null, 2);
      return json
        .split("\n")
        .map((line, index) => (index === 0 ? `      ${key}: ${line}` : `      ${line}`))
        .join("\n");
    })
    .join(",\n");
}

const anchors = {
  ua: `          itemUnitPrice: "Ціна за одиницю",
        },
      },
      expenses: {`,
  ru: `          itemUnitPrice: "Цена за единицу",
        },
      },
      expenses: {`,
  en: `          itemUnitPrice: "Unit price",
        },
      },
      expenses: {`,
};

for (const locale of ["ua", "ru", "en"]) {
  for (const key of keys) {
    translations[locale].accountingNew[key] = structuredClone(translations.cs.accountingNew[key]);
  }

  const anchor = anchors[locale];
  if (!source.includes(anchor)) {
    throw new Error(`Missing anchor for ${locale}`);
  }

  const insert = `${serializeBlocks(translations[locale].accountingNew)},\n      expenses: {`;
  source = source.replace(anchor, insert);
}

fs.writeFileSync(filePath, source);
console.log("Synced ua/ru/en 23B blocks from cs");
