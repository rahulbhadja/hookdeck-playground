import { TRAFFIC_EVENTS, trafficRates, type TrafficEventId } from "./traffic";

export type Source = "shopify" | "stripe" | "whatsapp";
export type Scenario = "spike" | "downtime";
export type Phase =
  | "normal"
  | "spike"
  | "overloaded"
  | "offline"
  | "draining"
  | "recovered";
export type EventRecord = {
  id: number;
  source: Source;
  title: string;
  status: "delivered" | "waiting" | "retrying" | "failed";
  attempts: number;
  time: number;
};
export type TrackedEvent = {
  id: number;
  source: Source;
  status: "pending" | "queued" | "retrying" | "delivered" | "failed";
  protected: boolean;
  attempts: number;
  startedAt: number;
  receivedAt: number | null;
  finishedAt: number | null;
  nextAttemptAt: number | null;
  history: { status: string; time: number }[];
};
type Batch = {
  source: Source;
  count: number;
  attempt: number;
  readyAt: number;
  createdAt: number;
  trace?: { id: number; offset: number };
};

export const APP_CAPACITY = 100;
export const BASE_RATE = 20;
export const SPIKE_RATE = 400;
export const TIME_SCALE = 2;
// One minute of active play; simulation time runs at 2x real time.
export const RUSH_SECONDS = 60;
// Sustained overload gets a visible warning before this simulated receiver crashes.
// Like the rush timer, this is measured in seconds of active play.
export const OVERLOAD_SECONDS = 4;
export const SOURCES: Source[] = ["shopify", "stripe", "whatsapp"];
export const TITLES: Record<Source, string> = {
  shopify: "Order created",
  stripe: "Payment received",
  whatsapp: "Message received",
};

export type Snapshot = {
  clock: number;
  enabled: boolean;
  online: boolean;
  offlineReason: "maintenance" | "overload" | null;
  overloadProgress: number;
  paused: boolean;
  rate: number;
  incoming: number;
  deliveryRate: number;
  attemptRate: number;
  received: number;
  delivered: number;
  waiting: number;
  waitingBySource: Record<Source, number>;
  failedAttempts: number;
  unsuccessful: number;
  retrying: number;
  load: number;
  phase: Phase;
  inSurge: boolean;
  trafficEvent: TrafficEventId | null;
  spikes: Record<Source, boolean>;
  sourceRates: Record<Source, number>;
  sourceConnected: Record<Source, boolean>;
  spikeSource: Source;
  hasRun: boolean;
  scenario: Scenario;
  recent: EventRecord[];
  history: number[];
  tracked: TrackedEvent | null;
};
/** A small deterministic delivery model. All quantities are synthetic.
 * Events are counted once; failed attempts may be counted more than once.
 * A configured retry schedule does not repair an unavailable application.
 */
export class Simulation {
  private traceSerial = 0;
  private tracked: TrackedEvent | null = null;

  /** Observe an existing arrival; this never injects or prioritizes traffic. */
  follow(source: Source) {
    for (const batch of this.batches) delete batch.trace;
    this.tracked = {
      id: ++this.traceSerial,
      source,
      status: "pending",
      protected: this.enabled,
      attempts: 0,
      startedAt: this.clock,
      receivedAt: null,
      finishedAt: null,
      nextAttemptAt: null,
      history: [],
    };
  }
  stopFollowing() {
    this.tracked = null;
    for (const batch of this.batches) delete batch.trace;
  }
  private traceStatus(status: TrackedEvent["status"], label: string) {
    if (!this.tracked) return;
    this.tracked.status = status;
    this.tracked.history.push({ status: label, time: this.clock });
    if (status === "delivered" || status === "failed") {
      this.tracked.finishedAt = this.clock;
      this.tracked.nextAttemptAt = null;
    }
  }
  clock = 0;
  enabled = false;
  online = true;
  offlineReason: Snapshot["offlineReason"] = null;
  paused = false;
  rate = 80;
  // A town destination receives a copy of its connected provider's traffic.
  inputOverride: Record<Source, number> | null = null;
  sourceConnected: Record<Source, boolean> = {
    shopify: true,
    stripe: true,
    whatsapp: true,
  };
  scenario: Scenario = "spike";
  received = 0;
  delivered = 0;
  failedAttempts = 0;
  unsuccessful = 0;
  spikes: Record<Source, boolean> = {
    shopify: false,
    stripe: false,
    whatsapp: false,
  };
  spikeSource: Source = "shopify";
  hasRun = false;
  trafficEvent: TrafficEventId | null = null;
  private eventStartedAt = 0;
  private patternSources = new Set<Source>();
  private batches: Batch[] = [];
  private surgeEndsAt: Record<Source, number> = {
    shopify: 0,
    stripe: 0,
    whatsapp: 0,
  };
  private ingressCredit = 0;
  private sourceCredits: Record<Source, number> = {
    shopify: 0,
    stripe: 0,
    whatsapp: 0,
  };
  private deliveryCredit = 0;
  private capacityCredit = 0;
  private id = 0;
  private historyClock = 0;
  private recent: EventRecord[] = [];
  private history: number[] = Array(44).fill(BASE_RATE);
  private pendingTime = 0;
  private rateSamples: { delivered: number; attempts: number }[] = [];
  private overloadSeconds = 0;

  get incoming() {
    const rates = this.sourceRates;
    return SOURCES.reduce((total, source) => total + rates[source], 0);
  }
  get inSurge() {
    return SOURCES.some((source) => this.spikes[source]);
  }
  get sourceRates(): Record<Source, number> {
    const rates = this.unfilteredSourceRates;
    return Object.fromEntries(
      SOURCES.map((source) => [
        source,
        this.sourceConnected[source] ? rates[source] : 0,
      ]),
    ) as Record<Source, number>;
  }
  private get unfilteredSourceRates(): Record<Source, number> {
    if (this.inputOverride) return { ...this.inputOverride };
    const idleRate = this.inSurge ? 10 : BASE_RATE / SOURCES.length;
    const pattern = this.trafficEvent
      ? trafficRates(
          this.trafficEvent,
          (this.clock - this.eventStartedAt) / TIME_SCALE,
        )
      : null;
    return Object.fromEntries(
      SOURCES.map((source) => [
        source,
        this.spikes[source]
          ? pattern && this.patternSources.has(source)
            ? pattern[source]
            : SPIKE_RATE - 20
          : idleRate,
      ]),
    ) as Record<Source, number>;
  }
  get waiting() {
    return this.batches.reduce((sum, batch) => sum + batch.count, 0);
  }

  /** Capture the complete engine state, including queued retries and timers. */
  checkpoint(): () => void {
    const state = structuredClone(this);
    return () => Object.assign(this, structuredClone(state));
  }

  connect() {
    this.enabled = true;
    this.deliveryCredit = 0;
    this.rateSamples = [];
  }
  disconnect() {
    this.enabled = false;
    this.deliveryCredit = 0;
    this.rateSamples = [];
    // Buffered events remain held; only new arrivals bypass the gateway.
  }
  startSpike(source: Source = this.spikeSource) {
    this.patternSources.delete(source);
    this.spikeSource = source;
    this.spikes[source] = true;
    this.surgeEndsAt[source] = this.clock + RUSH_SECONDS * TIME_SCALE;
    this.hasRun = true;
    this.paused = false;
  }
  toggleSpike(source: Source) {
    if (this.spikes[source]) {
      this.spikes[source] = false;
      this.surgeEndsAt[source] = 0;
    } else this.startSpike(source);
  }
  startAllSpikes() {
    this.trafficEvent = null;
    this.patternSources.clear();
    for (const source of SOURCES) {
      this.spikes[source] = true;
      this.surgeEndsAt[source] = this.clock + RUSH_SECONDS * TIME_SCALE;
    }
    this.hasRun = true;
    this.paused = false;
  }
  stopAllSpikes() {
    this.trafficEvent = null;
    this.patternSources.clear();
    for (const source of SOURCES) {
      this.spikes[source] = false;
      this.surgeEndsAt[source] = 0;
    }
  }
  startEvent(id: TrafficEventId) {
    this.stopAllSpikes();
    this.trafficEvent = id;
    this.eventStartedAt = this.clock;
    const event = TRAFFIC_EVENTS.find((event) => event.id === id)!;
    this.patternSources = new Set(event.sources);
    for (const source of event.sources) {
      this.spikes[source] = true;
      this.surgeEndsAt[source] = this.clock + RUSH_SECONDS * TIME_SCALE;
    }
    this.hasRun = true;
    this.paused = false;
  }
  setOnline(online: boolean) {
    this.online = online;
    this.offlineReason = online ? null : "maintenance";
    this.overloadSeconds = 0;
    this.rateSamples = [];
    this.hasRun = true;
    this.paused = false;
  }
  reset(enabled = this.enabled, scenario = this.scenario) {
    const rate = this.rate;
    const source = this.spikeSource;
    Object.assign(this, new Simulation());
    this.enabled = enabled;
    this.scenario = scenario;
    this.rate = rate;
    this.spikeSource = source;
  }
  replayProtected() {
    this.reset(true);
    if (this.scenario === "spike") this.startSpike();
    else this.setOnline(false);
  }
  private record(
    source: Source,
    status: EventRecord["status"],
    attempts: number,
  ) {
    this.recent.unshift({
      id: ++this.id,
      source,
      title: TITLES[source],
      status,
      attempts,
      time: this.clock,
    });
    this.recent = this.recent.slice(0, 16);
  }
  private enqueue(source: Source, count: number, trace?: Batch["trace"]) {
    if (!count) return;
    const bucket = Math.floor(this.clock / 2);
    const existing = this.batches.findLast(
      (b) =>
        b.source === source &&
        b.attempt === 0 &&
        Math.floor(b.createdAt / 2) === bucket,
    );
    if (existing) {
      if (trace)
        existing.trace = { ...trace, offset: existing.count + trace.offset };
      existing.count += count;
    } else
      this.batches.push({
        source,
        count,
        attempt: 0,
        readyAt: this.clock,
        createdAt: this.clock,
        trace,
      });
  }
  step(seconds: number) {
    if (this.paused) return;
    // Fixed steps keep budgets identical across browser frame rates. Unused
    // capacity is not saved up into a later burst of delivery attempts.
    this.pendingTime += Math.max(0, seconds);
    while (!this.paused && this.pendingTime >= 0.05 - 1e-8) {
      this.tick(0.05);
      this.pendingTime = Math.max(0, this.pendingTime - 0.05);
    }
  }

  private tick(dt: number) {
    const sourceRates = this.sourceRates;
    const inputRate = this.incoming;
    const deliveredBefore = this.delivered;
    this.clock += dt;
    for (const source of SOURCES) {
      if (
        this.spikes[source] &&
        this.clock >= this.surgeEndsAt[source] - 1e-8
      ) {
        this.spikes[source] = false;
        this.surgeEndsAt[source] = 0;
      }
      this.sourceCredits[source] += sourceRates[source] * dt;
    }
    if (!this.inSurge) this.trafficEvent = null;
    this.ingressCredit += inputRate * dt;
    const arrivals = Math.floor(this.ingressCredit + 1e-8);
    this.ingressCredit -= arrivals;
    this.received += arrivals;
    const arrivalsBySource: Record<Source, number> = {
      shopify: 0,
      stripe: 0,
      whatsapp: 0,
    };
    let trackedArrival: {
      source: Source;
      index: number;
      offset: number;
    } | null = null;
    for (let i = 0; i < arrivals; i++) {
      const source = SOURCES.reduce((largest, next) =>
        this.sourceCredits[next] > this.sourceCredits[largest] ? next : largest,
      );
      if (
        this.tracked?.status === "pending" &&
        this.tracked.source === source &&
        !trackedArrival
      ) {
        trackedArrival = { source, index: i, offset: arrivalsBySource[source] };
        this.tracked.receivedAt = this.clock;
        this.tracked.protected = this.enabled;
        this.tracked.history.push({
          status: "Received from provider",
          time: this.clock,
        });
      }
      arrivalsBySource[source]++;
      this.sourceCredits[source]--;
    }
    this.capacityCredit += APP_CAPACITY * dt;
    const capacityBudget = Math.floor(this.capacityCredit + 1e-8);
    this.capacityCredit -= capacityBudget;
    const capacity = this.online ? capacityBudget : 0;
    let attempts = 0;

    if (!this.enabled) {
      const success = Math.min(arrivals, capacity);
      this.delivered += success;
      this.failedAttempts += arrivals - success;
      this.unsuccessful += arrivals - success;
      attempts = arrivals;
      if (trackedArrival && this.tracked) {
        this.tracked.attempts = 1;
        const accepted = trackedArrival.index < success;
        this.traceStatus(
          accepted ? "delivered" : "failed",
          accepted ? "Endpoint accepted webhook" : "Direct delivery failed",
        );
      }
      if (
        arrivals &&
        Math.floor(this.clock * 2) !== Math.floor((this.clock - dt) * 2)
      ) {
        this.record(
          SOURCES.reduce(
            (largest, next) =>
              arrivalsBySource[next] > arrivalsBySource[largest]
                ? next
                : largest,
            SOURCES[this.id % 3],
          ),
          success < arrivals ? "failed" : "delivered",
          1,
        );
      }
    } else {
      for (const source of SOURCES) {
        const trace =
          trackedArrival?.source === source && this.tracked
            ? { id: this.tracked.id, offset: trackedArrival.offset }
            : undefined;
        this.enqueue(source, arrivalsBySource[source], trace);
        if (trace) this.traceStatus("queued", "Buffered by Hookdeck");
      }
      this.deliveryCredit += this.rate * dt;
      let budget = Math.floor(this.deliveryCredit + 1e-8);
      this.deliveryCredit -= budget;
      let available = capacity;
      const failed: Batch[] = [];
      for (const batch of this.batches) {
        if (!budget) break;
        if (batch.readyAt > this.clock) continue;
        const count = Math.min(batch.count, budget);
        const success = Math.min(count, available);
        const failure = count - success;
        let failedTrace: Batch["trace"];
        if (batch.trace) {
          if (batch.trace.offset < count) {
            const trace = batch.trace;
            delete batch.trace;
            if (trace.offset >= success)
              failedTrace = { ...trace, offset: trace.offset - success };
            if (this.tracked?.id === trace.id) {
              this.tracked.attempts = batch.attempt + 1;
              if (trace.offset < success)
                this.traceStatus("delivered", "Endpoint accepted webhook");
              else if (batch.attempt < 7) {
                this.tracked.nextAttemptAt =
                  this.clock + Math.min(60, 5 * 2 ** batch.attempt);
                this.traceStatus(
                  "retrying",
                  `Attempt ${batch.attempt + 1} failed · retry scheduled`,
                );
              } else this.traceStatus("failed", "Retry limit reached");
            }
          } else batch.trace.offset -= count;
        }
        batch.count -= count;
        budget -= count;
        available -= success;
        attempts += count;
        this.delivered += success;
        if (failure) {
          this.failedAttempts += failure;
          if (batch.attempt < 7) {
            failed.push({
              ...batch,
              count: failure,
              attempt: batch.attempt + 1,
              readyAt: this.clock + Math.min(60, 5 * 2 ** batch.attempt),
              trace: failedTrace,
            });
          } else this.unsuccessful += failure;
        }
        if (
          count &&
          Math.floor(this.clock * 2) !== Math.floor((this.clock - dt) * 2)
        ) {
          this.record(
            batch.source,
            failure ? (batch.attempt < 7 ? "retrying" : "failed") : "delivered",
            batch.attempt + 1,
          );
        }
      }
      this.batches = this.batches.filter((batch) => batch.count > 0);
      for (const batch of failed) {
        const same = this.batches.findLast(
          (b) =>
            b.source === batch.source &&
            b.attempt === batch.attempt &&
            Math.floor(b.readyAt) === Math.floor(batch.readyAt),
        );
        if (same) {
          if (batch.trace)
            same.trace = {
              ...batch.trace,
              offset: same.count + batch.trace.offset,
            };
          same.count += batch.count;
        } else this.batches.push(batch);
      }
    }
    this.rateSamples.push({
      delivered: this.delivered - deliveredBefore,
      attempts,
    });
    if (this.rateSamples.length > 20) this.rateSamples.shift();
    // Use attempted deliveries, not incoming traffic or the Hookdeck backlog.
    // A rolling window avoids treating integer delivery budgets as load spikes.
    const attemptRate =
      this.rateSamples.reduce((sum, sample) => sum + sample.attempts, 0) /
      (this.rateSamples.length * dt);
    if (this.online && attemptRate > APP_CAPACITY) {
      this.overloadSeconds += dt / TIME_SCALE;
      if (this.overloadSeconds >= OVERLOAD_SECONDS - 1e-8) {
        this.online = false;
        this.offlineReason = "overload";
        this.overloadSeconds = 0;
        this.rateSamples = [];
      }
    } else this.overloadSeconds = 0;
    this.historyClock += dt;
    if (this.historyClock >= 1) {
      this.historyClock -= 1;
      this.history.push(inputRate);
      this.history.shift();
    }
  }
  snapshot(): Snapshot {
    const waiting = this.waiting;
    const duration = this.rateSamples.length * 0.05;
    const deliveryRate =
      this.online && duration
        ? Math.round(
            this.rateSamples.reduce((sum, s) => sum + s.delivered, 0) /
              duration,
          )
        : 0;
    const attemptRate =
      this.online && duration
        ? Math.round(
            this.rateSamples.reduce((sum, s) => sum + s.attempts, 0) / duration,
          )
        : 0;
    const phase: Phase = !this.online
      ? "offline"
      : attemptRate > APP_CAPACITY
        ? "overloaded"
        : this.inSurge
          ? "spike"
          : waiting > 0
            ? "draining"
            : this.hasRun
              ? "recovered"
              : "normal";
    return {
      clock: this.clock,
      enabled: this.enabled,
      online: this.online,
      offlineReason: this.offlineReason,
      overloadProgress: Math.min(1, this.overloadSeconds / OVERLOAD_SECONDS),
      paused: this.paused,
      rate: this.rate,
      incoming: this.incoming,
      deliveryRate,
      attemptRate,
      received: this.received,
      delivered: this.delivered,
      waiting,
      waitingBySource: this.batches.reduce(
        (counts, batch) => {
          counts[batch.source] += batch.count;
          return counts;
        },
        { shopify: 0, stripe: 0, whatsapp: 0 },
      ),
      failedAttempts: this.failedAttempts,
      unsuccessful: this.unsuccessful,
      retrying: this.batches
        .filter((b) => b.attempt > 0)
        .reduce((n, b) => n + b.count, 0),
      load: attemptRate / APP_CAPACITY,
      phase,
      inSurge: this.inSurge,
      trafficEvent: this.trafficEvent,
      spikes: { ...this.spikes },
      sourceRates: this.sourceRates,
      sourceConnected: { ...this.sourceConnected },
      spikeSource: this.spikeSource,
      hasRun: this.hasRun,
      scenario: this.scenario,
      recent: [...this.recent],
      history: [...this.history],
      tracked: this.tracked
        ? {
            ...this.tracked,
            history: this.tracked.history.map((item) => ({ ...item })),
          }
        : null,
    };
  }
}
