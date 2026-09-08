export class StorageLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StorageLimitError";
  }
}
