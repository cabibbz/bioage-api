export type BinaryStorageBackend = "local_fs" | "object_storage";

export type WriteBinaryInput = {
  filenameHint: string;
  bytes: Buffer;
};

export type StoredBinaryLocation = {
  backend: BinaryStorageBackend;
  storedFilename: string;
  storageKey: string;
  relativePath: string;
};

export type BinaryStorageRepository = {
  ensureReady(): Promise<void>;
  writeBinary(input: WriteBinaryInput): Promise<StoredBinaryLocation>;
};
