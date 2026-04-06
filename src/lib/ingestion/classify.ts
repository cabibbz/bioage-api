import path from "node:path";
import {
  SourceDocumentClassification,
  StoredArchiveEntry,
} from "@/src/lib/persistence/store-types";

function normalizeExtension(filename: string) {
  return path.extname(filename).toLowerCase();
}

function normalizeMimeType(mimeType: string | undefined) {
  return (mimeType ?? "").toLowerCase();
}

function previewText(buffer: Buffer) {
  return buffer.toString("utf8", 0, Math.min(buffer.length, 4096)).trim();
}

function classifyJson(text: string): SourceDocumentClassification {
  try {
    const parsed = JSON.parse(text) as { resourceType?: unknown };
    if (parsed.resourceType === "Bundle") {
      return "fhir_bundle";
    }

    if (typeof parsed.resourceType === "string") {
      return "fhir_resource";
    }

    return "json_payload";
  } catch {
    return "json_payload";
  }
}

export function classifySourceDocument(input: {
  filename: string;
  mimeType?: string;
  bytes: Buffer;
}): SourceDocumentClassification {
  const extension = normalizeExtension(input.filename);
  const mimeType = normalizeMimeType(input.mimeType);
  const text = previewText(input.bytes);

  if (extension === ".zip" || mimeType.includes("zip")) {
    return "zip_archive";
  }

  if (extension === ".pdf" || mimeType === "application/pdf") {
    return "pdf_report";
  }

  if (
    mimeType.startsWith("image/") ||
    [".png", ".jpg", ".jpeg", ".gif", ".webp", ".heic"].includes(extension)
  ) {
    return "image_report";
  }

  if (extension === ".json" || mimeType.includes("json")) {
    return classifyJson(text);
  }

  if (extension === ".xml" || mimeType.includes("xml")) {
    if (text.includes("ClinicalDocument")) {
      return "ccda_xml";
    }

    return "unknown";
  }

  if (extension === ".html" || extension === ".htm" || mimeType.includes("html")) {
    return "html_export";
  }

  if ([".csv", ".xls", ".xlsx"].includes(extension)) {
    return "spreadsheet";
  }

  if (extension === ".txt") {
    return "text_note";
  }

  return "unknown";
}

export function inferMimeTypeFromFilename(filename: string): string {
  switch (normalizeExtension(filename)) {
    case ".zip":
      return "application/zip";
    case ".pdf":
      return "application/pdf";
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".json":
      return "application/json";
    case ".xml":
      return "application/xml";
    case ".html":
    case ".htm":
      return "text/html";
    case ".csv":
      return "text/csv";
    case ".txt":
      return "text/plain";
    case ".xls":
      return "application/vnd.ms-excel";
    case ".xlsx":
      return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    default:
      return "application/octet-stream";
  }
}

export function classifyArchiveEntry(
  pathname: string,
  isDirectory: boolean,
  bytes?: Buffer,
): StoredArchiveEntry {
  if (isDirectory) {
    return {
      path: pathname,
      isDirectory: true,
      classification: "unknown",
    };
  }

  const classification = classifySourceDocument({
    filename: pathname,
    mimeType: inferMimeTypeFromFilename(pathname),
    bytes: bytes ?? Buffer.alloc(0),
  });

  return {
    path: pathname,
    isDirectory: false,
    classification,
  };
}
