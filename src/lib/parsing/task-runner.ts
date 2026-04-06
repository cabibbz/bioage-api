import path from "node:path";
import parserContractJson from "@/src/lib/parsing/parser-contract.json";
import { randomUUID } from "node:crypto";
import {
  ParseTaskMetadataItem,
  ParseTaskParser,
  SourceDocumentStatus,
  StoredParseTask,
  StoredSourceDocument,
} from "@/src/lib/persistence/store-types";

type ParseContext = {
  document: StoredSourceDocument;
  bytes?: Buffer;
};

type ParseTaskDraft = Omit<
  StoredParseTask,
  | "id"
  | "patientId"
  | "sourceDocumentId"
  | "sourceDocumentFilename"
  | "sourceDocumentClassification"
  | "createdAt"
  | "updatedAt"
>;

type GenericRecord = Record<string, unknown>;

type ParserContract = {
  parsers: Record<ParseTaskParser, { mode: StoredParseTask["mode"] }>;
  classifications: Record<
    StoredSourceDocument["classification"],
    {
      parser?: ParseTaskParser;
      extensionParsers?: Record<string, ParseTaskParser>;
      defaultParser?: ParseTaskParser;
    }
  >;
};

const parserContract = parserContractJson as ParserContract;
const reviewOnlyParsers = new Set<ParseTaskParser>(
  Object.entries(parserContract.parsers)
    .filter(([, definition]) => definition.mode === "review")
    .map(([parser]) => parser as ParseTaskParser),
);

function buildBaseTask(context: ParseContext, parser: ParseTaskParser, now: string): StoredParseTask {
  return {
    id: randomUUID(),
    patientId: context.document.patientId,
    sourceDocumentId: context.document.id,
    sourceDocumentFilename: context.document.originalFilename,
    sourceDocumentClassification: context.document.classification,
    mode: reviewOnlyParsers.has(parser) ? "review" : "deterministic",
    parser,
    status: "queued",
    summary: "",
    detail: "",
    candidateCount: 0,
    metadata: [],
    candidates: [],
    createdAt: now,
    updatedAt: now,
  };
}

function extensionOf(filename: string) {
  return path.extname(filename).toLowerCase();
}

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function stripMarkup(value: string) {
  return normalizeWhitespace(value.replace(/<[^>]+>/g, " "));
}

function previewUtf8(bytes: Buffer | undefined) {
  return (bytes ?? Buffer.alloc(0)).toString("utf8");
}

function pushMetadata(target: ParseTaskMetadataItem[], label: string, value: string | number | boolean | undefined) {
  if (value === undefined || value === null || value === "") {
    return;
  }

  target.push({
    label,
    value: String(value),
  });
}

function buildReviewTask(context: ParseContext, parser: ParseTaskParser): ParseTaskDraft {
  const filename = context.document.originalFilename;

  if (parser === "pdf_review") {
    return {
      mode: "review",
      parser,
      status: "needs_review",
      summary: `${filename} stored for PDF review.`,
      detail:
        "The file was preserved and queued for review instead of guessing from page images. Add multimodal parsing later with schema-constrained extraction.",
      candidateCount: 0,
      metadata: [
        { label: "Reason", value: "PDF parsing is deferred to review or multimodal extraction." },
        { label: "Bytes", value: String(context.document.byteSize) },
      ],
      candidates: [],
    };
  }

  if (parser === "image_review") {
    return {
      mode: "review",
      parser,
      status: "needs_review",
      summary: `${filename} stored for image review.`,
      detail:
        "Scanned images stay provenance-first. The system should review or multimodally parse them later rather than fabricate structured output now.",
      candidateCount: 0,
      metadata: [
        { label: "Reason", value: "Image parsing is deferred to review or multimodal extraction." },
        { label: "Bytes", value: String(context.document.byteSize) },
      ],
      candidates: [],
    };
  }

  if (parser === "html_review") {
    return {
      mode: "review",
      parser,
      status: "needs_review",
      summary: `${filename} stored for HTML review.`,
      detail:
        "HTML exports vary too much between vendors to trust a generic parser yet. Preserve the source and route it through review or a vendor-specific parser later.",
      candidateCount: 0,
      metadata: [
        { label: "Reason", value: "HTML exports are vendor-specific and review-first in v1." },
        { label: "Bytes", value: String(context.document.byteSize) },
      ],
      candidates: [],
    };
  }

  if (parser === "spreadsheet_review") {
    return {
      mode: "review",
      parser,
      status: "needs_review",
      summary: `${filename} stored for spreadsheet review.`,
      detail:
        "Binary spreadsheet formats such as XLS/XLSX are accepted, preserved, and marked for review. CSV remains the deterministic path in v1.",
      candidateCount: 0,
      metadata: [
        { label: "Reason", value: "Binary spreadsheet parsing is deferred until a dedicated parser is added." },
        { label: "Bytes", value: String(context.document.byteSize) },
      ],
      candidates: [],
    };
  }

  return {
    mode: "review",
    parser,
    status: "needs_review",
    summary: `${filename} stored for manual review.`,
    detail:
      "The source file was preserved, but the current parser set does not know how to safely summarize it yet. Review or add a format-specific parser before promoting any values.",
    candidateCount: 0,
    metadata: [
      { label: "Reason", value: "No safe deterministic parser is registered for this classification." },
      { label: "Bytes", value: String(context.document.byteSize) },
    ],
    candidates: [],
  };
}

function selectParser(document: StoredSourceDocument): ParseTaskParser {
  const contract = parserContract.classifications[document.classification];

  if (!contract) {
    throw new Error(`No parser contract exists for classification ${document.classification}.`);
  }

  const extension = extensionOf(document.originalFilename);
  if (contract.extensionParsers?.[extension]) {
    return contract.extensionParsers[extension];
  }

  if (contract.parser) {
    return contract.parser;
  }

  if (contract.defaultParser) {
    return contract.defaultParser;
  }

  throw new Error(`Parser contract for classification ${document.classification} is incomplete.`);
}

function parseMaybeNumber(value: string | undefined) {
  if (!value) {
    return undefined;
  }

  const cleaned = value.replace(/,/g, "").trim();
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) {
    return undefined;
  }

  return Number(cleaned);
}

function buildValueLabel(value: { numericValue?: number; textValue?: string; unit?: string }) {
  if (value.numericValue !== undefined) {
    return `${value.numericValue}${value.unit ? ` ${value.unit}` : ""}`;
  }

  return value.textValue ?? "No result value";
}

function extractObservationCandidate(resource: GenericRecord, sourcePath: string) {
  const code = typeof resource.code === "object" && resource.code ? (resource.code as GenericRecord) : undefined;
  const coding = Array.isArray(code?.coding) ? (code?.coding as GenericRecord[]) : [];
  const loincCoding = coding.find(
    (entry) => typeof entry.system === "string" && entry.system.includes("loinc"),
  );
  const displayName =
    (typeof code?.text === "string" && code.text) ||
    (typeof loincCoding?.display === "string" && loincCoding.display) ||
    (typeof coding[0]?.display === "string" && coding[0].display) ||
    (typeof coding[0]?.code === "string" && coding[0].code) ||
    "Observation";

  const valueQuantity =
    typeof resource.valueQuantity === "object" && resource.valueQuantity
      ? (resource.valueQuantity as GenericRecord)
      : undefined;
  const valueCodeableConcept =
    typeof resource.valueCodeableConcept === "object" && resource.valueCodeableConcept
      ? (resource.valueCodeableConcept as GenericRecord)
      : undefined;
  const valueString = typeof resource.valueString === "string" ? resource.valueString : undefined;
  const valueInteger = typeof resource.valueInteger === "number" ? resource.valueInteger : undefined;
  const valueBoolean = typeof resource.valueBoolean === "boolean" ? resource.valueBoolean : undefined;
  const dataAbsentReason =
    typeof resource.dataAbsentReason === "object" && resource.dataAbsentReason
      ? (resource.dataAbsentReason as GenericRecord)
      : undefined;

  const numericValue =
    typeof valueQuantity?.value === "number"
      ? valueQuantity.value
      : valueInteger !== undefined
        ? valueInteger
        : undefined;
  const textValue =
    (typeof valueString === "string" && valueString) ||
    (typeof valueCodeableConcept?.text === "string" && valueCodeableConcept.text) ||
    (Array.isArray(valueCodeableConcept?.coding) &&
    typeof (valueCodeableConcept.coding as GenericRecord[])[0]?.display === "string"
      ? ((valueCodeableConcept.coding as GenericRecord[])[0].display as string)
      : undefined) ||
    (valueBoolean !== undefined ? String(valueBoolean) : undefined) ||
    (typeof dataAbsentReason?.text === "string" && dataAbsentReason.text) ||
    (Array.isArray(dataAbsentReason?.coding) &&
    typeof (dataAbsentReason.coding as GenericRecord[])[0]?.display === "string"
      ? ((dataAbsentReason.coding as GenericRecord[])[0].display as string)
      : undefined);

  const unit =
    (typeof valueQuantity?.unit === "string" && valueQuantity.unit) ||
    (typeof valueQuantity?.code === "string" && valueQuantity.code) ||
    undefined;
  const referenceRange =
    Array.isArray(resource.referenceRange) && resource.referenceRange.length > 0
      ? normalizeWhitespace(
          resource.referenceRange
            .map((entry) => {
              const range = entry as GenericRecord;
              if (typeof range.text === "string") {
                return range.text;
              }

              const low =
                typeof range.low === "object" && range.low
                  ? `${(range.low as GenericRecord).value ?? ""} ${(range.low as GenericRecord).unit ?? ""}`.trim()
                  : "";
              const high =
                typeof range.high === "object" && range.high
                  ? `${(range.high as GenericRecord).value ?? ""} ${(range.high as GenericRecord).unit ?? ""}`.trim()
                  : "";
              return [low, high].filter(Boolean).join(" - ");
            })
            .filter(Boolean)
            .join("; "),
        )
      : undefined;

  return {
    id: randomUUID(),
    sourcePath,
    displayName,
    valueLabel: buildValueLabel({
      numericValue,
      textValue,
      unit,
    }),
    numericValue,
    textValue,
    unit,
    loincCode: typeof loincCoding?.code === "string" ? loincCoding.code : undefined,
    observedAt:
      (typeof resource.effectiveDateTime === "string" && resource.effectiveDateTime) ||
      (typeof resource.issued === "string" && resource.issued) ||
      undefined,
    referenceRange,
  };
}

function parseFhirBundle(context: ParseContext): ParseTaskDraft {
  const raw = previewUtf8(context.bytes);
  const parsed = JSON.parse(raw) as GenericRecord;
  const entries = Array.isArray(parsed.entry) ? (parsed.entry as GenericRecord[]) : [];
  const observations = entries
    .map((entry, index) => {
      const resource = typeof entry.resource === "object" && entry.resource ? (entry.resource as GenericRecord) : null;
      return resource && resource.resourceType === "Observation"
        ? extractObservationCandidate(resource, `entry[${index}].resource`)
        : null;
    })
    .filter((candidate): candidate is NonNullable<typeof candidate> => candidate !== null)
    .slice(0, 24);
  const diagnosticReportCount = entries.filter((entry) => {
    const resource = typeof entry.resource === "object" && entry.resource ? (entry.resource as GenericRecord) : null;
    return resource?.resourceType === "DiagnosticReport";
  }).length;
  const composition = entries[0]?.resource;
  const compositionTitle =
    typeof composition === "object" &&
    composition &&
    (composition as GenericRecord).resourceType === "Composition" &&
    typeof (composition as GenericRecord).title === "string"
      ? ((composition as GenericRecord).title as string)
      : undefined;

  const metadata: ParseTaskMetadataItem[] = [];
  pushMetadata(metadata, "Bundle type", typeof parsed.type === "string" ? parsed.type : "unknown");
  pushMetadata(metadata, "Entry count", entries.length);
  pushMetadata(metadata, "Observation resources", observations.length);
  pushMetadata(metadata, "Diagnostic reports", diagnosticReportCount);
  pushMetadata(metadata, "Composition title", compositionTitle);

  return {
    mode: "deterministic",
    parser: "fhir_bundle",
    status: "completed",
    summary: `${context.document.originalFilename} parsed as FHIR bundle with ${entries.length} entries and ${observations.length} observation candidates.`,
    detail:
      compositionTitle && typeof parsed.type === "string" && parsed.type === "document"
        ? `Document bundle detected. Composition title: ${compositionTitle}.`
        : "FHIR bundle summary extracted without promoting any values into canonical measurements.",
    candidateCount: observations.length,
    metadata,
    candidates: observations,
  };
}

function parseFhirResource(context: ParseContext): ParseTaskDraft {
  const raw = previewUtf8(context.bytes);
  const parsed = JSON.parse(raw) as GenericRecord;
  const resourceType = typeof parsed.resourceType === "string" ? parsed.resourceType : "Unknown";
  const metadata: ParseTaskMetadataItem[] = [];
  const candidates =
    resourceType === "Observation" ? [extractObservationCandidate(parsed, "$")] : [];

  if (resourceType === "DiagnosticReport") {
    pushMetadata(metadata, "Report status", typeof parsed.status === "string" ? parsed.status : undefined);
    pushMetadata(
      metadata,
      "Presented forms",
      Array.isArray(parsed.presentedForm) ? parsed.presentedForm.length : 0,
    );
    pushMetadata(metadata, "Result refs", Array.isArray(parsed.result) ? parsed.result.length : 0);
  }

  if (resourceType === "DocumentReference") {
    pushMetadata(metadata, "Document status", typeof parsed.status === "string" ? parsed.status : undefined);
    pushMetadata(metadata, "Content attachments", Array.isArray(parsed.content) ? parsed.content.length : 0);
  }

  if (resourceType === "Observation") {
    pushMetadata(metadata, "Observation status", typeof parsed.status === "string" ? parsed.status : undefined);
  }

  pushMetadata(metadata, "Resource type", resourceType);

  return {
    mode: "deterministic",
    parser: "fhir_resource",
    status: "completed",
    summary: `${context.document.originalFilename} parsed as FHIR ${resourceType}.`,
    detail:
      candidates.length > 0
        ? "A single observation candidate was extracted from the resource."
        : "Resource metadata was summarized without guessing additional measurements.",
    candidateCount: candidates.length,
    metadata,
    candidates,
  };
}

const measurementNameKeys = ["name", "title", "display_name", "displayname", "biomarker", "marker", "analyte", "test"];
const measurementValueKeys = ["value", "result", "reading", "measurement"];
const measurementUnitKeys = ["unit", "units", "display_units", "displayunits"];
const measurementTimeKeys = ["observed_at", "observedat", "effective_at", "effectiveat", "timestamp", "date"];
const measurementLoincKeys = ["loinc", "loinc_code", "loinccode"];
const measurementRangeKeys = ["reference_range", "referencerange", "normal_range", "normalrange"];

function normalizeKey(key: string) {
  return key.toLowerCase().replace(/[^a-z0-9]+/g, "_");
}

function findKey(record: GenericRecord, candidates: string[]) {
  const entries = Object.entries(record);
  return entries.find(([key]) => candidates.includes(normalizeKey(key)));
}

function buildGenericJsonCandidate(record: GenericRecord, sourcePath: string) {
  const nameEntry = findKey(record, measurementNameKeys);
  const valueEntry = findKey(record, measurementValueKeys);

  if (!nameEntry || !valueEntry) {
    return null;
  }

  const nameValue = nameEntry[1];
  const rawName =
    typeof nameValue === "string"
      ? nameValue
      : typeof nameValue === "number"
        ? String(nameValue)
        : undefined;

  if (!rawName) {
    return null;
  }

  const unitEntry = findKey(record, measurementUnitKeys);
  const loincEntry = findKey(record, measurementLoincKeys);
  const timeEntry = findKey(record, measurementTimeKeys);
  const rangeEntry = findKey(record, measurementRangeKeys);

  const rawValue = valueEntry[1];
  const numericValue =
    typeof rawValue === "number" ? rawValue : typeof rawValue === "string" ? parseMaybeNumber(rawValue) : undefined;
  const textValue =
    typeof rawValue === "string"
      ? rawValue
      : typeof rawValue === "boolean"
        ? String(rawValue)
        : numericValue === undefined && rawValue !== undefined
          ? JSON.stringify(rawValue)
          : undefined;
  const unit = typeof unitEntry?.[1] === "string" ? unitEntry[1] : undefined;

  return {
    id: randomUUID(),
    sourcePath,
    displayName: rawName,
    valueLabel: buildValueLabel({
      numericValue,
      textValue,
      unit,
    }),
    numericValue,
    textValue,
    unit,
    loincCode: typeof loincEntry?.[1] === "string" ? loincEntry[1] : undefined,
    observedAt: typeof timeEntry?.[1] === "string" ? timeEntry[1] : undefined,
    referenceRange:
      typeof rangeEntry?.[1] === "string" ? rangeEntry[1] : rangeEntry?.[1] !== undefined ? String(rangeEntry[1]) : undefined,
  };
}

function collectGenericJsonCandidates(
  value: unknown,
  sourcePath: string,
  output: NonNullable<StoredParseTask["candidates"]>,
  seenPaths: Set<string>,
  depth = 0,
) {
  if (depth > 5 || output.length >= 24) {
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((entry, index) => collectGenericJsonCandidates(entry, `${sourcePath}[${index}]`, output, seenPaths, depth + 1));
    return;
  }

  if (!value || typeof value !== "object") {
    return;
  }

  const record = value as GenericRecord;
  const candidate = buildGenericJsonCandidate(record, sourcePath);
  if (candidate && !seenPaths.has(candidate.sourcePath)) {
    output.push(candidate);
    seenPaths.add(candidate.sourcePath);
  }

  Object.entries(record).forEach(([key, child]) => {
    collectGenericJsonCandidates(child, `${sourcePath}.${key}`, output, seenPaths, depth + 1);
  });
}

function parseGenericJson(context: ParseContext): ParseTaskDraft {
  const raw = previewUtf8(context.bytes);
  const parsed = JSON.parse(raw) as GenericRecord;
  const topLevelKeys = Object.keys(parsed);
  const candidates: StoredParseTask["candidates"] = [];
  collectGenericJsonCandidates(parsed, "$", candidates, new Set<string>());

  const metadata: ParseTaskMetadataItem[] = [];
  pushMetadata(metadata, "Top-level keys", topLevelKeys.slice(0, 8).join(", "));
  pushMetadata(metadata, "Candidate rows", candidates.length);

  return {
    mode: "deterministic",
    parser: "generic_json",
    status: "completed",
    summary: `${context.document.originalFilename} parsed as generic JSON with ${candidates.length} candidate measurements.`,
    detail:
      candidates.length > 0
        ? "Heuristic candidate extraction ran against JSON objects containing name/result-like fields."
        : "JSON structure was summarized, but no safe measurement candidates were detected.",
    candidateCount: candidates.length,
    metadata,
    candidates,
  };
}

function detectDelimiter(text: string) {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  const commaCount = (firstLine.match(/,/g) ?? []).length;
  const tabCount = (firstLine.match(/\t/g) ?? []).length;
  return tabCount > commaCount ? "\t" : ",";
}

function parseDelimitedText(text: string, delimiter: string) {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentCell = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === "\"") {
      if (inQuotes && next === "\"") {
        currentCell += "\"";
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (!inQuotes && char === delimiter) {
      currentRow.push(currentCell);
      currentCell = "";
      continue;
    }

    if (!inQuotes && (char === "\n" || char === "\r")) {
      if (char === "\r" && next === "\n") {
        index += 1;
      }

      currentRow.push(currentCell);
      rows.push(currentRow);
      currentRow = [];
      currentCell = "";
      continue;
    }

    currentCell += char;
  }

  currentRow.push(currentCell);
  rows.push(currentRow);

  return rows.filter((row) => row.some((cell) => cell.trim().length > 0));
}

function parseCsv(context: ParseContext): ParseTaskDraft {
  const raw = previewUtf8(context.bytes);
  const delimiter = detectDelimiter(raw);
  const rows = parseDelimitedText(raw, delimiter);

  if (rows.length === 0) {
    return {
      mode: "deterministic",
      parser: "csv_table",
      status: "needs_review",
      summary: `${context.document.originalFilename} could not be summarized as CSV.`,
      detail: "The file was detected as CSV-like, but no data rows were found after parsing.",
      candidateCount: 0,
      metadata: [{ label: "Delimiter", value: delimiter === "\t" ? "tab" : "comma" }],
      candidates: [],
    };
  }

  const header = rows[0].map((cell) => normalizeKey(cell));
  const dataRows = rows.slice(1);
  const nameIndex = header.findIndex((value) => measurementNameKeys.includes(value));
  const valueIndex = header.findIndex((value) => measurementValueKeys.includes(value));
  const unitIndex = header.findIndex((value) => measurementUnitKeys.includes(value));
  const loincIndex = header.findIndex((value) => measurementLoincKeys.includes(value));
  const timeIndex = header.findIndex((value) => measurementTimeKeys.includes(value));
  const rangeIndex = header.findIndex((value) => measurementRangeKeys.includes(value));

  const candidates = dataRows
    .map((row, index) => {
      const displayName = row[nameIndex] || row[0];
      const rawValue = valueIndex >= 0 ? row[valueIndex] : undefined;
      if (!displayName || !rawValue) {
        return null;
      }

      const numericValue = parseMaybeNumber(rawValue);
      const textValue = numericValue === undefined ? rawValue : undefined;
      const unit = unitIndex >= 0 ? row[unitIndex] || undefined : undefined;

      return {
        id: randomUUID(),
        sourcePath: `row[${index + 1}]`,
        displayName,
        valueLabel: buildValueLabel({
          numericValue,
          textValue,
          unit,
        }),
        numericValue,
        textValue,
        unit,
        loincCode: loincIndex >= 0 ? row[loincIndex] || undefined : undefined,
        observedAt: timeIndex >= 0 ? row[timeIndex] || undefined : undefined,
        referenceRange: rangeIndex >= 0 ? row[rangeIndex] || undefined : undefined,
      };
    })
    .filter((candidate): candidate is NonNullable<typeof candidate> => candidate !== null)
    .slice(0, 24);

  const metadata: ParseTaskMetadataItem[] = [];
  pushMetadata(metadata, "Delimiter", delimiter === "\t" ? "tab" : "comma");
  pushMetadata(metadata, "Columns", header.length);
  pushMetadata(metadata, "Rows", dataRows.length);
  pushMetadata(metadata, "Candidate rows", candidates.length);

  return {
    mode: "deterministic",
    parser: "csv_table",
    status: "completed",
    summary: `${context.document.originalFilename} parsed as tabular data with ${candidates.length} candidate measurements.`,
    detail:
      candidates.length > 0
        ? "CSV rows with name/result-like columns were summarized without promoting them into canonical measurements."
        : "Table structure was detected, but no rows matched the current candidate extraction heuristics.",
    candidateCount: candidates.length,
    metadata,
    candidates,
  };
}

function parseTextNote(context: ParseContext): ParseTaskDraft {
  const text = previewUtf8(context.bytes);
  const lines = text
    .split(/\r?\n/)
    .map((line) => normalizeWhitespace(line))
    .filter(Boolean);
  const firstLine = lines[0] ?? "Empty note";

  return {
    mode: "deterministic",
    parser: "text_note",
    status: "completed",
    summary: `${context.document.originalFilename} summarized as free-text note.`,
    detail: firstLine.length > 180 ? `${firstLine.slice(0, 177)}...` : firstLine,
    candidateCount: 0,
    metadata: [
      { label: "Line count", value: String(lines.length) },
      { label: "Preview", value: firstLine },
    ],
    candidates: [],
  };
}

function collectMatches(text: string, expression: RegExp, mapper: (match: RegExpExecArray) => string | undefined) {
  const values: string[] = [];
  const unique = new Set<string>();
  let match = expression.exec(text);

  while (match) {
    const value = mapper(match);
    if (value) {
      const normalized = normalizeWhitespace(value);
      if (normalized && !unique.has(normalized)) {
        unique.add(normalized);
        values.push(normalized);
      }
    }
    match = expression.exec(text);
  }

  return values;
}

function parseCcdaMetadata(context: ParseContext): ParseTaskDraft {
  const xml = previewUtf8(context.bytes);
  const title = collectMatches(xml, /<title[^>]*>([\s\S]*?)<\/title>/gi, (match) => stripMarkup(match[1]))[0];
  const templateIds = collectMatches(xml, /<templateId[^>]*root="([^"]+)"/gi, (match) => match[1]).slice(0, 5);
  const sectionTitles = collectMatches(
    xml,
    /<section\b[\s\S]*?<title[^>]*>([\s\S]*?)<\/title>/gi,
    (match) => stripMarkup(match[1]),
  ).slice(0, 8);
  const effectiveTime = collectMatches(xml, /<effectiveTime[^>]*value="([^"]+)"/gi, (match) => match[1])[0];
  const observationCount = (xml.match(/<observation\b/gi) ?? []).length;
  const organizerCount = (xml.match(/<organizer\b/gi) ?? []).length;

  const metadata: ParseTaskMetadataItem[] = [];
  pushMetadata(metadata, "Title", title);
  pushMetadata(metadata, "Effective time", effectiveTime);
  pushMetadata(metadata, "Template IDs", templateIds.join(", "));
  pushMetadata(metadata, "Section count", sectionTitles.length);
  pushMetadata(metadata, "Observation nodes", observationCount);
  pushMetadata(metadata, "Organizer nodes", organizerCount);

  return {
    mode: "deterministic",
    parser: "ccda_metadata",
    status: "completed",
    summary: `${context.document.originalFilename} parsed as C-CDA structure with ${sectionTitles.length} titled sections.`,
    detail:
      sectionTitles.length > 0
        ? `Section preview: ${sectionTitles.slice(0, 4).join("; ")}.`
        : "ClinicalDocument metadata was summarized without promoting discrete values yet.",
    candidateCount: 0,
    metadata,
    candidates: [],
  };
}

function parseArchiveManifest(context: ParseContext): ParseTaskDraft {
  const entries = context.document.archiveEntries ?? [];
  const extractedCount = entries.filter(
    (entry) => !entry.isDirectory && entry.classification !== "unknown" && entry.classification !== "zip_archive",
  ).length;
  const classificationCounts = new Map<string, number>();

  entries.forEach((entry) => {
    const key = entry.classification;
    classificationCounts.set(key, (classificationCounts.get(key) ?? 0) + 1);
  });

  const metadata: ParseTaskMetadataItem[] = [
    { label: "Archive entries", value: String(entries.length) },
    { label: "Extracted child documents", value: String(extractedCount) },
  ];

  Array.from(classificationCounts.entries())
    .sort((left, right) => right[1] - left[1])
    .slice(0, 4)
    .forEach(([classification, count]) => {
      metadata.push({
        label: `Contains ${classification}`,
        value: String(count),
      });
    });

  return {
    mode: "deterministic",
    parser: "archive_manifest",
    status: "completed",
    summary: `${context.document.originalFilename} indexed as ZIP archive with ${entries.length} entries.`,
    detail: `Archive manifest summarized; ${extractedCount} supported child documents are available for parsing or review.`,
    candidateCount: 0,
    metadata,
    candidates: [],
  };
}

export function runParseTask(context: ParseContext): StoredParseTask {
  const parser = selectParser(context.document);
  const now = new Date().toISOString();
  const task = buildBaseTask(context, parser, now);

  try {
    const outcome =
      parser === "archive_manifest"
        ? parseArchiveManifest(context)
        : parser === "fhir_bundle"
          ? parseFhirBundle(context)
          : parser === "fhir_resource"
            ? parseFhirResource(context)
            : parser === "generic_json"
              ? parseGenericJson(context)
              : parser === "csv_table"
                ? parseCsv(context)
                : parser === "text_note"
                  ? parseTextNote(context)
                  : parser === "ccda_metadata"
                    ? parseCcdaMetadata(context)
                    : buildReviewTask(context, parser);

    return {
      ...task,
      ...outcome,
    };
  } catch (error) {
    return {
      ...task,
      status: "failed",
      summary: `${context.document.originalFilename} failed parsing.`,
      detail: "The parser encountered an error while building a summary. Review the source file before retrying.",
      errorMessage: error instanceof Error ? error.message : "Unknown parser error.",
    };
  }
}

export function toSourceDocumentStatus(document: StoredSourceDocument, task: StoredParseTask): SourceDocumentStatus {
  if (document.classification === "zip_archive") {
    return "archive_indexed";
  }

  if (task.status === "completed") {
    return "parsed_summary_ready";
  }

  if (task.status === "failed") {
    return "parse_failed";
  }

  if (task.status === "needs_review") {
    return "needs_review";
  }

  return "pending_parse";
}
