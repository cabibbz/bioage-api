import path from "node:path";
import { promises as fs } from "node:fs";
import { randomUUID } from "node:crypto";
import { BinaryStorageRepository, StoredBinaryLocation, WriteBinaryInput } from "@/src/lib/storage/repository";

const uploadsDirectory = path.join(process.cwd(), "data", "uploads");

function extensionOf(filename: string) {
  return path.extname(filename);
}

function buildLocation(storedFilename: string): StoredBinaryLocation {
  return {
    backend: "local_fs",
    storedFilename,
    storageKey: `uploads/${storedFilename}`,
    relativePath: `data/uploads/${storedFilename}`,
  };
}

export const localBinaryStorageRepository: BinaryStorageRepository = {
  async ensureReady() {
    await fs.mkdir(uploadsDirectory, { recursive: true });
  },
  async writeBinary(input: WriteBinaryInput) {
    const extension = extensionOf(input.filenameHint);
    const storedFilename = `${randomUUID()}${extension || ".bin"}`;
    const absolutePath = path.join(uploadsDirectory, storedFilename);
    await fs.writeFile(absolutePath, input.bytes);
    return buildLocation(storedFilename);
  },
};
