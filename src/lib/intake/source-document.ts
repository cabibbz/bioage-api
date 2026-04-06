export const emptySourceDocumentFileError = "Choose a non-empty file.";

export function hasSourceDocumentContent(byteSize: number): boolean {
  return Number.isFinite(byteSize) && byteSize > 0;
}
