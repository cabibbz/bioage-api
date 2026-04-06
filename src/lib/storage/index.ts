import { localBinaryStorageRepository } from "@/src/lib/storage/local-storage";
import { objectBinaryStorageRepository } from "@/src/lib/storage/object-storage";
import { BinaryStorageRepository } from "@/src/lib/storage/repository";

export type DocumentStorageBackend = "local" | "object";

export function getDocumentStorageBackend(): DocumentStorageBackend {
  const configured = process.env.DOCUMENT_STORAGE_BACKEND?.trim().toLowerCase();
  return configured === "object" ? "object" : "local";
}

export function getBinaryStorageRepository(): BinaryStorageRepository {
  return getDocumentStorageBackend() === "object"
    ? objectBinaryStorageRepository
    : localBinaryStorageRepository;
}
