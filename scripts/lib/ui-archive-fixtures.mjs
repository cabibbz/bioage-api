import path from "node:path";
import { readFile, writeFile } from "node:fs/promises";
import JSZip from "jszip";

export const uiArchivePrefixes = ["ui-functional-a", "ui-functional-b", "ui-functional-c", "ui-functional-d"];

const deterministicZipDate = new Date("2026-01-01T00:00:00.000Z");

function csvFixture() {
  return Buffer.from(
    [
      "name,result,unit,loinc,observed_at",
      "ApoB,78,mg/dL,1884-6,2026-04-01T08:00:00.000Z",
      "C-Reactive Protein,1.1,mg/L,1988-5,2026-04-01T08:00:00.000Z",
    ].join("\n"),
  );
}

export function uiArchiveMetadata(prefix) {
  return {
    prefix,
    archiveFilename: `${prefix}.zip`,
    childCsvFilename: `${prefix}-labs.csv`,
    childTextFilename: `${prefix}-note.txt`,
    sourceSystem: `UI functional upload ${prefix.toUpperCase()}`,
  };
}

export async function buildUiArchiveBuffer(prefix) {
  const zip = new JSZip();
  zip.file(`labs/${prefix}-labs.csv`, csvFixture(), { date: deterministicZipDate });
  zip.file(
    `notes/${prefix}-note.txt`,
    `${prefix} follow-up note: ApoB trend remains the main target after omega-3 and training changes.`,
    { date: deterministicZipDate },
  );
  return zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    platform: "DOS",
  });
}

export async function loadUiArchiveFixtures(options = {}) {
  const archiveDir = options.archiveDir?.trim();
  const archives = [];

  for (const prefix of uiArchivePrefixes) {
    const metadata = uiArchiveMetadata(prefix);
    const buffer = archiveDir
      ? await readFile(path.join(archiveDir, metadata.archiveFilename))
      : await buildUiArchiveBuffer(prefix);

    archives.push({
      ...metadata,
      buffer,
    });
  }

  return archives;
}

export async function writeUiArchiveFixtures(directory) {
  for (const prefix of uiArchivePrefixes) {
    const metadata = uiArchiveMetadata(prefix);
    await writeFile(path.join(directory, metadata.archiveFilename), await buildUiArchiveBuffer(prefix));
  }
}
