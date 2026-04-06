import path from "node:path";
import { readFile } from "node:fs/promises";

const canonicalCatalogPath = path.join(process.cwd(), "src", "lib", "normalization", "canonical-catalog.json");

export const canonicalCatalog = JSON.parse(await readFile(canonicalCatalogPath, "utf8"));

function normalizeCatalogKey(value) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function resolveCanonicalCodeForName(value) {
  const normalizedName = normalizeCatalogKey(value);
  const match = canonicalCatalog.find((item) =>
    item.aliases.some((alias) => normalizeCatalogKey(alias) === normalizedName),
  );
  return match?.canonicalCode;
}
