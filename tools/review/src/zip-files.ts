import { Uint8ArrayReader, ZipReader, type FileEntry } from "@zip.js/zip.js";

export const MAX_ARCHIVE_BYTES = 128 * 1024 * 1024;
export const MAX_EXPANDED_BYTES = 256 * 1024 * 1024;
export const MAX_SNAPSHOT_BYTES = 5 * 1024 * 1024;

export async function readZipFiles(
  bytes: Uint8Array,
): Promise<Map<string, Uint8Array>> {
  if (bytes.byteLength > MAX_ARCHIVE_BYTES)
    throw new Error("ZIP archive size limit exceeded");
  const reader = new ZipReader(new Uint8ArrayReader(bytes), {
    filenameEncoding: "utf-8",
    decodeText: (value, _encoding, type) =>
      type === "filename"
        ? new TextDecoder("utf-8", { fatal: true }).decode(value)
        : undefined,
    strictness: "strict",
    checkCrc32: true,
    checkLocalDirectory: true,
    checkOverlappingEntry: true,
    useWebWorkers: false,
  });
  try {
    const entries = await reader.getEntries();
    // Version-1 interchange ends with the ordinary EOCD, without ZIP64/signature records.
    if (
      reader.directoryOffset === undefined ||
      reader.directoryLength === undefined ||
      reader.digitalSignature ||
      reader.directoryOffset +
        reader.directoryLength +
        22 +
        reader.comment.byteLength !==
        bytes.byteLength
    )
      throw new Error("Unsupported ZIP directory");
    if (!entries.length || entries.length >= 65535)
      throw new Error("Invalid ZIP entry count");
    const names = new Set<string>();
    let declared = 0;
    for (const entry of entries) {
      const name = entry.filename;
      if (
        !name ||
        name.includes("\\") ||
        name.includes("\0") ||
        name.startsWith("/") ||
        name.includes(":") ||
        name.split("/").some((part) => part === "." || part === "..") ||
        names.has(name)
      )
        throw new Error("Unsafe or duplicate ZIP path");
      names.add(name);
      if (
        entry.zip64 ||
        entry.diskNumberStart ||
        entry.encrypted ||
        ![0, 8].includes(entry.compressionMethod)
      )
        throw new Error("Unsupported or encrypted ZIP entry");
      declared += entry.uncompressedSize;
      if (
        declared > MAX_EXPANDED_BYTES ||
        (name.endsWith(".html") && entry.uncompressedSize > MAX_SNAPSHOT_BYTES)
      )
        throw new Error("ZIP expanded size limit exceeded");
    }
    const files = new Map<string, Uint8Array>();
    let total = 0;
    for (const entry of entries) {
      const chunks: Uint8Array[] = [];
      let size = 0;
      // zip.js exposes getData for directories at runtime as well; its public
      // DirectoryEntry type omits it. Read them to verify CRC and byte counts.
      const readable = entry as typeof entry & Pick<FileEntry, "getData">;
      await readable.getData(
        new WritableStream<Uint8Array>({
          write(chunk) {
            size += chunk.byteLength;
            total += chunk.byteLength;
            if (size > entry.uncompressedSize || total > MAX_EXPANDED_BYTES)
              throw new Error("ZIP expanded size limit exceeded");
            chunks.push(chunk);
          },
        }),
      );
      if (size !== entry.uncompressedSize) throw new Error("Corrupt ZIP entry");
      files.set(entry.filename, Buffer.concat(chunks));
    }
    return files;
  } catch (error) {
    const reason =
      error && typeof error === "object" && "reason" in error
        ? String(error.reason)
        : "";
    throw new Error(
      `Corrupt ZIP archive: ${reason || (error instanceof Error ? error.message : String(error))}`,
      { cause: error },
    );
  } finally {
    await reader.close();
  }
}
