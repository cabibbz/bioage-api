import path from "node:path";
import { readFile } from "node:fs/promises";

const canonicalCatalogPath = path.join(process.cwd(), "src", "lib", "normalization", "canonical-catalog.json");

export const canonicalCatalog = JSON.parse(await readFile(canonicalCatalogPath, "utf8"));

function normalizeCatalogKey(value) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function getLookupKeys(item) {
  return [item.canonicalCode, item.title, ...item.aliases].map(normalizeCatalogKey).filter(Boolean);
}

const lookupKeyToCode = new Map();
for (const item of canonicalCatalog) {
  for (const lookupKey of getLookupKeys(item)) {
    const existingCode = lookupKeyToCode.get(lookupKey);
    if (existingCode && existingCode !== item.canonicalCode) {
      throw new Error(`Canonical lookup key "${lookupKey}" is ambiguous between ${existingCode} and ${item.canonicalCode}.`);
    }

    lookupKeyToCode.set(lookupKey, item.canonicalCode);
  }
}

export function resolveCanonicalCodeForName(value) {
  return lookupKeyToCode.get(normalizeCatalogKey(value));
}
