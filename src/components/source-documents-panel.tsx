import { StoredSourceDocument } from "@/src/lib/persistence/store-types";

type SourceDocumentsPanelProps = {
  documents: StoredSourceDocument[];
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

export function SourceDocumentsPanel({ documents }: SourceDocumentsPanelProps) {
  const childCounts = documents.reduce<Record<string, number>>((counts, document) => {
    if (document.parentDocumentId) {
      counts[document.parentDocumentId] = (counts[document.parentDocumentId] ?? 0) + 1;
    }
    return counts;
  }, {});

  const topLevelDocuments = documents.filter((document) => !document.parentDocumentId);
  const childDocuments = documents.filter((document) => document.parentDocumentId).slice(0, 4);

  return (
    <section className="panel section-panel" style={{ marginBottom: 18 }}>
      <div className="section-head">
        <div>
          <div className="section-kicker">Ingestion</div>
          <h2 className="section-title">Stored source documents</h2>
          <p className="section-copy">
            Source files stay visible and separate from parsed values. Provenance should remain inspectable at every
            step.
          </p>
        </div>
        <span className="pill">{documents.length} stored</span>
      </div>

      <div className="detail-stack">
        {documents.length === 0 ? (
          <div className="detail-card">
            <div className="detail-label">No uploads yet</div>
            <p className="detail-copy">Upload a source file to create the first persisted document record.</p>
          </div>
        ) : (
          topLevelDocuments.slice(0, 4).map((document) => (
            <article className="detail-card" key={document.id}>
              <div className="signal-meta">
                <div>
                  <div className="detail-label">{document.classification}</div>
                  <p className="signal-title">{document.originalFilename}</p>
                </div>
                <span className="pill">{document.status}</span>
              </div>
              <p className="summary-note">
                {document.sourceSystem} | {formatDate(document.receivedAt)} | {document.byteSize} bytes
              </p>
              {document.archiveEntries?.length ? (
                <p className="detail-copy">
                  {document.archiveEntries.length} archive entries indexed, {childCounts[document.id] ?? 0} extracted
                  child documents.
                </p>
              ) : (
                <p className="detail-copy">
                  Stored at {document.relativePath} with checksum tracking ready for provenance.
                </p>
              )}
            </article>
          ))
        )}
      </div>

      {childDocuments.length > 0 ? (
        <div className="detail-stack" style={{ marginTop: 16 }}>
          <div className="detail-label">Recent extracted children</div>
          {childDocuments.map((document) => (
            <article className="detail-card" key={document.id}>
              <div className="signal-meta">
                <div>
                  <p className="signal-title">{document.originalFilename}</p>
                  <p className="summary-note">{document.archiveEntryPath}</p>
                </div>
                <span className="pill">{document.classification}</span>
              </div>
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
}
