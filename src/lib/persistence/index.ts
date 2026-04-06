import { fileEvidenceRepository } from "@/src/lib/persistence/file-repository";
import { postgresEvidenceRepository } from "@/src/lib/persistence/postgres-repository";
import { EvidenceRepository } from "@/src/lib/persistence/repository";

export type PersistenceBackend = "file" | "postgres";

export function getPersistenceBackend(): PersistenceBackend {
  const configured = process.env.PERSISTENCE_BACKEND?.trim().toLowerCase();
  return configured === "postgres" ? "postgres" : "file";
}

export function getEvidenceRepository(): EvidenceRepository {
  return getPersistenceBackend() === "postgres" ? postgresEvidenceRepository : fileEvidenceRepository;
}
