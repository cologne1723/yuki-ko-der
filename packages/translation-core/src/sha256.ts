/** Browser-safe SHA-256 shared by the translator and collector. */
export async function sha256Hex(
  value: string | BufferSource | Uint8Array<ArrayBufferLike>,
  subtle: SubtleCrypto = globalThis.crypto.subtle,
): Promise<string> {
  // Own the bytes before awaiting, including views backed by shared buffers.
  const bytes =
    typeof value === "string"
      ? new TextEncoder().encode(value)
      : ArrayBuffer.isView(value)
        ? new Uint8Array(
            new Uint8Array(value.buffer, value.byteOffset, value.byteLength),
          )
        : new Uint8Array(value.slice(0));
  const digest = await subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
