import { BinaryStorageRepository } from "@/src/lib/storage/repository";

function notImplemented(): never {
  throw new Error(
    "DOCUMENT_STORAGE_BACKEND=object is not implemented yet. Use the local filesystem backend for now and follow docs/research/object-storage-plan.md for the migration target.",
  );
}

export const objectBinaryStorageRepository: BinaryStorageRepository = {
  async ensureReady() {
    notImplemented();
  },
  async writeBinary() {
    notImplemented();
  },
};
