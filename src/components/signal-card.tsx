import { formatMeasurementValue, getMeasurementValueKindLabel } from "@/src/lib/domain/measurements";
import { CanonicalMeasurement } from "@/src/lib/domain/types";

type SignalCardProps = {
  measurement: CanonicalMeasurement;
};

export function SignalCard({ measurement }: SignalCardProps) {
  const statusClass =
    measurement.evidenceStatus === "conflicted" || measurement.evidenceStatus === "watch"
      ? "warn"
      : "ok";
  const valueKindLabel = getMeasurementValueKindLabel(measurement);

  return (
    <article className="signal-card">
      <div className="signal-meta">
        <div>
          <p className="signal-title">{measurement.title}</p>
          <div className="signal-source">
            {measurement.sourceVendor} · {measurement.modality}
          </div>
        </div>
        <span className={`pill ${statusClass}`}>{measurement.evidenceStatus}</span>
      </div>

      <div className="signal-value-row">
        <div className="signal-value">{formatMeasurementValue(measurement)}</div>
        <div className="signal-sidecar">
          {valueKindLabel ? <span className="pill">{valueKindLabel}</span> : null}
          {measurement.deltaLabel ? <div className="signal-delta">{measurement.deltaLabel}</div> : null}
        </div>
      </div>

      <div className="signal-foot">
        <span>{measurement.interpretation}</span>
        <span className="pill">{measurement.confidenceLabel} confidence</span>
      </div>
    </article>
  );
}
