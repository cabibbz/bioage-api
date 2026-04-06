import { readFile } from "node:fs/promises";
import path from "node:path";

const repoRoot = process.cwd();

const requiredDocs = [
  {
    file: "README.md",
    headings: ["## Getting started", "## Documentation"],
  },
  {
    file: "CONTRIBUTING.md",
    headings: ["## Documentation Contract", "## Testing Contract", "## Compaction Rule", "## Change Workflow"],
  },
  {
    file: "docs/README.md",
    headings: ["## Core Docs", "## Compact Handoff", "## Decision Log"],
  },
  {
    file: "docs/architecture.md",
    headings: ["## System Boundaries", "## Current Data Flow", "## Near-Term Architecture Gaps"],
  },
  {
    file: "docs/domain-model.md",
    headings: ["## Canonical Concepts", "## Persistence Shape", "## Interpretation Rules"],
  },
  {
    file: "docs/runbook.md",
    headings: ["## Local Workflow", "## Verification", "## Known Gaps"],
  },
  {
    file: "docs/progress-log.md",
    headings: ["## Entries"],
  },
  {
    file: "docs/research/parser-contracts-2026.md",
    headings: ["## Executive Summary", "## Standards Reality", "## Product Direction", "## Sources"],
  },
  {
    file: "docs/research/review-decision-workflow.md",
    headings: ["## Executive Summary", "## Standards Signals", "## Product Implication", "## Sources"],
  },
  {
    file: "docs/research/promotion-audit-model.md",
    headings: ["## Executive Summary", "## Standards Signals", "## Product Implication", "## Sources"],
  },
  {
    file: "docs/research/postgres-storage-plan.md",
    headings: ["## Executive Summary", "## Why This Shape", "## Proposed Database Boundary", "## What I'd Do Next"],
  },
  {
    file: "docs/research/object-storage-plan.md",
    headings: ["## Executive Summary", "## Why This Needs Its Own Layer", "## Migration Rule", "## What I'd Do Next"],
  },
  {
    file: "docs/compact/PROJECT_SNAPSHOT.md",
    headings: [
      "## Mission",
      "## Current Build State",
      "## Critical Files",
      "## Open Risks",
      "## Next 3 Moves",
    ],
    maxWords: 700,
  },
  {
    file: "docs/decisions/ADR-0001-product-wedge.md",
    headings: ["## Status", "## Decision", "## Consequences"],
  },
  {
    file: "docs/decisions/ADR-0002-local-file-store.md",
    headings: ["## Status", "## Decision", "## Consequences"],
  },
  {
    file: "docs/decisions/ADR-0003-envelope-first-ingestion.md",
    headings: ["## Status", "## Decision", "## Consequences"],
  },
  {
    file: "docs/decisions/ADR-0004-parser-task-queue.md",
    headings: ["## Status", "## Decision", "## Consequences"],
  },
  {
    file: "docs/decisions/ADR-0005-review-decision-layer.md",
    headings: ["## Status", "## Decision", "## Consequences"],
  },
  {
    file: "docs/decisions/ADR-0006-measurement-promotion-record.md",
    headings: ["## Status", "## Decision", "## Consequences"],
  },
  {
    file: "docs/decisions/ADR-0007-repository-abstraction.md",
    headings: ["## Status", "## Decision", "## Consequences"],
  },
  {
    file: "docs/decisions/ADR-0008-binary-storage-abstraction.md",
    headings: ["## Status", "## Decision", "## Consequences"],
  },
];

function wordCount(text) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

async function verify() {
  const errors = [];

  for (const doc of requiredDocs) {
    const fullPath = path.join(repoRoot, doc.file);
    let content;

    try {
      content = await readFile(fullPath, "utf8");
    } catch {
      errors.push(`Missing required doc: ${doc.file}`);
      continue;
    }

    for (const heading of doc.headings) {
      if (!content.includes(heading)) {
        errors.push(`${doc.file} is missing heading: ${heading}`);
      }
    }

    if (doc.maxWords && wordCount(content) > doc.maxWords) {
      errors.push(`${doc.file} exceeds max word count of ${doc.maxWords}`);
    }
  }

  if (errors.length > 0) {
    for (const error of errors) {
      console.error(`docs-verify: ${error}`);
    }
    process.exit(1);
  }

  console.log("docs-verify: all required documentation is present and compact-handoff safe.");
}

await verify();
