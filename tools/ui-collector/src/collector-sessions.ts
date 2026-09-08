import { collectorVersion } from "./dictionary.ts";
import type { CollectorStore } from "./storage-types.ts";
import {
  createId,
  MAX_HTML_BYTES,
  MAX_TOTAL_BYTES,
  type DictionaryIdentity,
  type Session,
} from "./types.ts";

/** Durable session creation/resumption and dictionary succession. */
export class CollectorSessions {
  session?: Session;
  private pendingSession?: Session;
  constructor(
    private store: CollectorStore,
    private dictionary: DictionaryIdentity,
    private now: () => number,
    private retry: () => Promise<void>,
  ) {}
  private newSession(settings?: Session["settings"]): Session {
    return {
      sessionId: createId("session"),
      startedAt: this.now(),
      collectorVersion,
      dictionary: this.dictionary,
      settings: settings ?? {
        maxHtmlBytes: MAX_HTML_BYTES,
        maxTotalBytes: MAX_TOTAL_BYTES,
        includeEvents: true,
      },
      status: "paused",
      counts: { saved: 0, pending: 0, failed: 0 },
      captureFailures: [],
      totalBytes: 0,
    };
  }
  async start(resumeSessionId?: string): Promise<Session> {
    const id = resumeSessionId ?? this.session?.sessionId;
    if (id) {
      this.session = await this.store.getSession(id);
      const seen = new Set<string>();
      while (this.session?.successorSessionId) {
        if (seen.has(this.session.sessionId))
          throw new Error("Invalid session successor cycle");
        seen.add(this.session.sessionId);
        this.session = await this.store.getSession(
          this.session.successorSessionId,
        );
      }
    }
    if (this.session && this.session.dictionary.hash !== this.dictionary.hash) {
      await this.store.updateSession({ ...this.session, status: "paused" });
      await this.retry();
      if (!this.store.rotateSession)
        throw new Error(
          "Collector storage does not support dictionary rotation",
        );
      this.pendingSession ??= this.newSession(this.session.settings);
      this.session = await this.store.rotateSession(
        this.session.sessionId,
        this.pendingSession,
      );
      this.pendingSession = undefined;
    }
    if (!this.session || this.session.status === "complete") {
      this.pendingSession ??= this.newSession();
      await this.store.createSession(this.pendingSession);
      this.session = this.pendingSession;
      this.pendingSession = undefined;
    }
    await this.retry();
    await this.store.updateSession({ ...this.session, status: "recording" });
    this.session.status = "recording";
    return this.session;
  }
}
