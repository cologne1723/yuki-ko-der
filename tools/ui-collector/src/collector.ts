import { pLimit } from "translation-core/concurrency";
import { debounce } from "translation-core/text-utils";
import { captureBatches } from "./capture-batches.ts";
import { captureSnapshot } from "./capture-snapshot.ts";
import { observeCollector } from "./collector-observer.ts";
import { CollectorSessions } from "./collector-sessions.ts";
import { toFindings, toOccurrences } from "./detection.ts";
import { dictionaryIdentity } from "./dictionary.ts";
import { EventRecorder } from "./events.ts";
import { sha256 } from "./hash.ts";
import type { CaptureOutcome, CollectorState } from "./messages.ts";
import { RemoteStore } from "./remote-store.ts";
import { StorageLimitError } from "./storage-errors.ts";
import type { CollectorStore } from "./storage.ts";
import {
  createId,
  type Capture,
  type DictionaryIdentity,
  type Session,
} from "./types.ts";

export interface CollectorOptions {
  store?: CollectorStore;
  dictionary?: DictionaryIdentity;
  now?: () => number;
  documentId?: string;
}

function allowedPage(): boolean {
  return location.protocol === "https:" && location.hostname === "yukicoder.me";
}

export class CollectorController {
  private readonly store: CollectorStore;
  private readonly now: () => number;
  private readonly dictionary: DictionaryIdentity;
  private sessions: CollectorSessions;
  private get session() {
    return this.sessions.session;
  }
  private set session(value: Session | undefined) {
    this.sessions.session = value;
  }
  private documentId: string;
  private eventRecorder?: EventRecorder;
  private observerCleanup?: () => void;
  private readonly scanLater = debounce(
    (reason: Capture["reason"]) => {
      const roots = [...this.scheduledRoots];
      this.scheduledRoots.clear();
      void this.capture(reason, roots).catch((error) =>
        console.error("Automatic capture failed", error),
      );
    },
    250,
    { maxWait: 1000 },
  );
  private scanning = false;
  private captureCompletion?: Promise<void>;
  private pendingReason?: Capture["reason"];
  private pendingManualId?: string;
  manualCapture?: CollectorState["manualCapture"];
  private readonly scheduledRoots = new Set<Element>();
  private readonly pendingRoots = new Set<Element>();
  private readonly retryRoots = new Set<Element>();
  private visibility = new Map<Element, boolean>();
  private seenLocations = new Set<string>();
  private sequence = 0;
  private active = false;
  constructor(
    private readonly doc: Document = document,
    options: CollectorOptions = {},
  ) {
    this.store = options.store ?? new RemoteStore();
    this.now = options.now ?? (() => Date.now());
    this.dictionary = options.dictionary ?? dictionaryIdentity;
    this.documentId = options.documentId ?? createId("document");
    this.sessions = new CollectorSessions(
      this.store,
      this.dictionary,
      this.now,
      () => this.retry(),
    );
  }
  get sessionId(): string | undefined {
    return this.session?.sessionId;
  }
  get recording(): boolean {
    return this.active;
  }
  get lastFailure(): string | undefined {
    return this.session?.captureFailures.at(-1)?.detail;
  }
  async captureManually(): Promise<CaptureOutcome> {
    if (!this.active) return { outcome: "not-recording" };
    const queued = this.scanning;
    const requestId = queued
      ? (this.pendingManualId ??= createId("manual"))
      : undefined;
    const capture = await this.capture("manual");
    if (capture) return { outcome: "saved", captureId: capture.captureId };
    if (requestId) return { outcome: "queued", requestId };
    return {
      outcome: "failed",
      error: this.lastFailure ?? "The capture could not be saved.",
    };
  }
  async counts(): Promise<{ saved: number; pending: number; failed: number }> {
    return this.session
      ? this.store.counts(this.session.sessionId)
      : { saved: 0, pending: 0, failed: 0 };
  }
  private startQueue = pLimit(1);
  async start(resumeSessionId?: string): Promise<Session> {
    return this.startQueue(() => this.startOnce(resumeSessionId));
  }
  private async startOnce(resumeSessionId?: string): Promise<Session> {
    if (!allowedPage())
      throw new Error("The collector only runs on https://yukicoder.me/*");
    if (
      this.active &&
      this.session?.dictionary.hash === this.dictionary.hash &&
      (!resumeSessionId || this.sessionId === resumeSessionId)
    )
      return this.session;
    this.active = false;
    this.disconnect();
    await this.captureCompletion;
    const oldDocument = this.session?.sessionId;
    this.session = await this.sessions.start(resumeSessionId);
    const changed = oldDocument !== this.session.sessionId;
    if (changed) {
      this.seenLocations.clear();
      this.retryRoots.clear();
      this.visibility.clear();
      this.documentId = createId("document");
      this.eventRecorder = undefined;
    }
    this.eventRecorder ??= new EventRecorder(
      this.session.sessionId,
      this.documentId,
      this.now,
    );
    this.eventRecorder.setDocument(this.documentId);
    this.eventRecorder.start(this.doc);
    this.active = true;
    this.observe();
    return this.captureStartedSession(
      resumeSessionId ? "navigation" : changed ? "initial" : "interaction",
    );
  }
  private async captureStartedSession(
    reason: Capture["reason"],
  ): Promise<Session> {
    const session = this.session!;
    await this.capture(reason);
    return (await this.store.getSession(session.sessionId)) ?? session;
  }
  async pause(): Promise<void> {
    this.active = false;
    if (!this.session) return;
    this.session.status = "paused";
    this.disconnect();
    await this.store.updateSession(this.session);
  }
  async discardSession(id: string | undefined): Promise<void> {
    if (!this.session || this.session.sessionId !== id) return;
    this.active = false;
    this.disconnect();
    // Finish in-flight writes before background deletes the durable records.
    await this.captureCompletion;
    this.session = undefined;
    this.eventRecorder = undefined;
    this.seenLocations.clear();
    this.visibility.clear();
    this.retryRoots.clear();
  }
  async stop(): Promise<void> {
    await this.pause();
    if (this.session) {
      this.session.status = "complete";
      this.session.endedAt = this.now();
      await this.store.updateSession(this.session);
    }
  }
  async capture(
    reason: Capture["reason"],
    roots: readonly Element[] = [this.doc.documentElement],
  ): Promise<Capture | undefined> {
    if (!this.session || !this.active) return undefined;
    if (this.scanning) {
      if (this.pendingReason !== "manual") this.pendingReason = reason;
      for (const root of roots) this.pendingRoots.add(root);
      return undefined;
    }
    this.scanning = true;
    for (const root of roots) this.retryRoots.add(root);
    let complete!: () => void;
    this.captureCompletion = new Promise<void>((resolve) => {
      complete = resolve;
    });
    try {
      await this.retry().catch(() => undefined);
      const at = this.now();
      const observedEvents = this.eventRecorder?.preceding(at) ?? [];
      const {
        html,
        redaction,
        url,
        title,
        viewport,
        scroll,
        candidates,
        nextVisibility,
      } = captureSnapshot(
        this.doc,
        this.session.dictionary.scopes,
        this.visibility,
        this.retryRoots,
      );
      const acceptVisibility = () => {
        this.visibility = nextVisibility;
        this.retryRoots.clear();
      };
      const snapshot = {
        html,
        bytes: new TextEncoder().encode(html).byteLength,
        redaction,
        hash: await sha256(html),
      };
      if (snapshot.bytes > this.session.settings.maxHtmlBytes)
        return await this.failCapture(
          "oversized",
          `${snapshot.bytes} bytes exceeds ${this.session.settings.maxHtmlBytes}`,
        );
      const newCandidates = candidates.filter(
        (candidate) =>
          !this.seenLocations.has(
            `${candidate.locator}|${candidate.kind}|${candidate.text}`,
          ),
      );
      const findings = await toFindings(newCandidates, at);
      const events = observedEvents.map((event) => event.eventId);
      if (
        !newCandidates.length &&
        reason !== "manual" &&
        reason !== "initial"
      ) {
        acceptVisibility();
        return undefined;
      }
      const capture: Capture = {
        captureId: createId("capture"),
        sessionId: this.session.sessionId,
        documentId: this.documentId,
        url,
        title,
        timestamp: at,
        reason,
        viewport,
        scroll,
        htmlHash: snapshot.hash,
        htmlBytes: snapshot.bytes,
        redaction: snapshot.redaction,
        findingIds: findings.map((finding) => finding.findingId),
        occurrenceIds: [],
      };
      const occurrences = await toOccurrences(
        newCandidates,
        capture.captureId,
        this.session.sessionId,
        this.documentId,
        events,
        capture.timestamp,
      );
      capture.occurrenceIds = occurrences.map(
        (occurrence) => occurrence.occurrenceId,
      );
      const batches = captureBatches(
        this.session.sessionId,
        this.documentId,
        findings,
        occurrences,
        observedEvents,
        capture,
        snapshot,
        () => ++this.sequence,
        () => this.sequence,
        this.now,
      );
      await this.store.stageCapture?.(this.session.sessionId, batches);
      await this.store.commitBatch(
        this.session.sessionId,
        batches,
        snapshot.bytes,
      );
      acceptVisibility();
      for (const candidate of newCandidates)
        this.seenLocations.add(
          `${candidate.locator}|${candidate.kind}|${candidate.text}`,
        );
      this.session =
        (await this.store.getSession(this.session.sessionId)) ?? this.session;
      return capture;
    } catch (error) {
      if (this.session) {
        const limited = error instanceof StorageLimitError;
        if (limited) {
          this.active = false;
          this.session.status = "paused";
          this.disconnect();
        }
        this.session.captureFailures.push({
          at: this.now(),
          documentId: this.documentId,
          reason: limited ? "storage-limit" : "unknown",
          detail: String(error),
        });
        await this.store.updateSession(this.session);
      }
      return undefined;
    } finally {
      this.scanning = false;
      const pending = this.pendingReason;
      const manualId = this.pendingManualId;
      this.pendingManualId = undefined;
      const roots = [...this.pendingRoots];
      this.pendingReason = undefined;
      this.pendingRoots.clear();
      this.captureCompletion = undefined;
      complete();
      if (pending && this.active) {
        void this.capture(pending, roots).then(
          (capture) => {
            if (manualId)
              this.manualCapture = {
                requestId: manualId,
                outcome: capture ? "saved" : "failed",
                error: capture ? undefined : this.lastFailure,
              };
          },
          (error) => {
            if (manualId)
              this.manualCapture = {
                requestId: manualId,
                outcome: "failed",
                error: String(error),
              };
            console.error("Queued capture failed", error);
          },
        );
      } else if (manualId)
        this.manualCapture = { requestId: manualId, outcome: "not-recording" };
    }
  }
  async retry(): Promise<void> {
    if (this.session) {
      try {
        await this.store.retryPending(this.session.sessionId);
      } finally {
        for (const key of (await this.store.locations?.(
          this.session.sessionId,
          this.documentId,
        )) ?? [])
          this.seenLocations.add(key);
        this.session =
          (await this.store.getSession(this.session.sessionId)) ?? this.session;
      }
    }
  }
  private async failCapture(
    reason: "oversized" | "storage-limit",
    detail: string,
  ): Promise<undefined> {
    if (!this.session) return undefined;
    this.session.captureFailures.push({
      at: this.now(),
      documentId: this.documentId,
      reason,
      detail,
    });
    this.session.counts.failed = (this.session.counts.failed ?? 0) + 1;
    await this.store.updateSession(this.session);
    return undefined;
  }
  private observe(): void {
    this.observerCleanup = observeCollector(this.doc, (reason, roots) =>
      this.scheduleScan(reason, roots),
    );
  }
  private scheduleScan(
    reason: Capture["reason"],
    roots: readonly Element[] = [this.doc.documentElement],
  ): void {
    if (!this.active) return;
    for (const root of roots) this.scheduledRoots.add(root);
    this.scanLater(reason);
  }
  private disconnect(): void {
    this.observerCleanup?.();
    this.observerCleanup = undefined;
    this.eventRecorder?.stop();
    this.scanLater.cancel();
    this.scheduledRoots.clear();
  }
}
