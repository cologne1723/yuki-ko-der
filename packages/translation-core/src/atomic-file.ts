import writeFileAtomic from "write-file-atomic";

/** Atomic replacement only: exclusive creation and multi-file recovery remain separate. */
export async function atomicFile(
  path: string,
  bytes: string | Uint8Array,
): Promise<void> {
  await writeFileAtomic(
    path,
    typeof bytes === "string" ? bytes : Buffer.from(bytes),
  );
}
