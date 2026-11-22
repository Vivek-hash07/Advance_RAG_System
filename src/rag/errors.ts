export class NoSourcesError extends Error {
  constructor() {
    super(
      "No sources are ready yet. Upload a document or add a YouTube video or playlist first.",
    );
    this.name = "NoSourcesError";
  }
}
