import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const frontendRoot = path.resolve(__dirname, "..");
const targetRoot = path.resolve(frontendRoot, "public", "services");

const mappings = [
  {
    sourceDir: "go_motoru_landrover_2017",
    targetDir: "motory",
    prefix: "go-motoru",
  },
  {
    sourceDir: "repas_turbo",
    targetDir: "motory",
    prefix: "repas-motoru",
  },
  {
    sourceDir: "repas_automat_b6",
    targetDir: "prevodovky",
    prefix: "repas-automat",
  },
  {
    sourceDir: "renovace_mercedes_coupe",
    targetDir: "karoserie-lakovani",
    prefix: "renovace-mercedes",
  },
];

const supportedExt = new Set([".jpg", ".jpeg", ".png", ".webp", ".avif", ".tif", ".tiff"]);

async function resolveSourceRoot() {
  const candidates = ["img_dílna", "img_dilna"].map((name) =>
    path.resolve(frontendRoot, "..", name)
  );

  for (const candidate of candidates) {
    try {
      const stat = await fs.stat(candidate);
      if (stat.isDirectory()) return candidate;
    } catch {
      // ignore missing candidate
    }
  }

  throw new Error(
    `Source folder not found. Expected one of: ${candidates.join(", ")}`
  );
}

const sortByName = (a, b) =>
  a.name.localeCompare(b.name, "cs", { numeric: true, sensitivity: "base" });

async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

async function removeOldGeneratedFiles(targetDir, prefix) {
  let files = [];
  try {
    files = await fs.readdir(targetDir, { withFileTypes: true });
  } catch {
    return;
  }

  const toDelete = files
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((name) => name.startsWith(`${prefix}-`) && /\.(jpe?g|png|webp|avif|tiff?)$/i.test(name));

  await Promise.all(toDelete.map((name) => fs.unlink(path.join(targetDir, name))));
}

async function convertCategory(sourceRoot, { sourceDir, targetDir, prefix }) {
  const sourcePath = path.join(sourceRoot, sourceDir);
  const targetPath = path.join(targetRoot, targetDir);

  await ensureDir(targetPath);
  await removeOldGeneratedFiles(targetPath, prefix);

  let entries = [];
  try {
    entries = await fs.readdir(sourcePath, { withFileTypes: true });
  } catch {
    console.warn(`[media:sync] source folder missing: ${sourcePath}`);
    return [];
  }

  const images = entries
    .filter((entry) => entry.isFile())
    .filter((entry) => supportedExt.has(path.extname(entry.name).toLowerCase()))
    .sort(sortByName);

  const outputPaths = [];
  for (let i = 0; i < images.length; i += 1) {
    const entry = images[i];
    const inputPath = path.join(sourcePath, entry.name);
    const fileName = `${prefix}-${String(i + 1).padStart(2, "0")}.webp`;
    const outputPath = path.join(targetPath, fileName);

    await sharp(inputPath)
      .rotate()
      .webp({ quality: 72, effort: 6, smartSubsample: true })
      .toFile(outputPath);

    outputPaths.push(`/services/${targetDir}/${fileName}`);
  }

  return outputPaths;
}

async function run() {
  const sourceRoot = await resolveSourceRoot();
  await ensureDir(targetRoot);

  const summary = [];
  for (const mapping of mappings) {
    const generated = await convertCategory(sourceRoot, mapping);
    summary.push({ mapping, generatedCount: generated.length });
  }

  for (const item of summary) {
    const label = `${item.mapping.sourceDir} -> ${item.mapping.targetDir}/${item.mapping.prefix}`;
    console.log(`[media:sync] ${label}: ${item.generatedCount} webp`);
  }
}

run().catch((error) => {
  console.error("[media:sync] failed", error);
  process.exit(1);
});
