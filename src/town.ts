import {
  Simulation,
  SOURCES,
  TIME_SCALE,
  type Snapshot,
  type Source,
} from "./simulation";
import type { TrafficEventId } from "./traffic";
import {
  DEMO_SECONDS,
  DEMO_TIMING,
  demoPhase,
  demoRates,
  type DemoSnapshot,
} from "./demo";

export const AUTOMATIONS = ["n8n", "zapier", "make"] as const;
export type Automation = (typeof AUTOMATIONS)[number];
export type TownMode =
  | "lobby"
  | "providers"
  | "automations"
  | "emergency"
  | "playing"
  | "demo";
export type Emergency = TrafficEventId | "storm";
export const PROVIDERS_READY = 3.4;
export const AUTOMATIONS_START = 4;
export const TOWN_READY = 5.6;
export const ARRIVAL = {
  app: 0,
  shopify: 0.15,
  stripe: 1.05,
  whatsapp: 1.95,
  n8n: 4.15,
  zapier: 4.15,
  make: 4.15,
};
export const AUTOMATION = {
  n8n: { name: "n8n", color: "#EA4B71", source: "whatsapp", rate: 35 },
  zapier: { name: "Zapier", color: "#FF4F00", source: "shopify", rate: 45 },
  make: { name: "Make", color: "#A855F7", source: "stripe", rate: 40 },
} as const;
export type TownSnapshot = {
  mode: TownMode;
  undoLabel: string | null;
  demo: DemoSnapshot;
  elapsed: number;
  emergency: Emergency | null;
  automation: Automation | null;
  destinations: Record<Automation, Snapshot>;
  delivered: number;
  waiting: number;
  lost: number;
  received: number;
};
const emptyRates = (): Record<Source, number> => ({
  shopify: 0,
  stripe: 0,
  whatsapp: 0,
});

export function constructionBusy(town: Pick<TownSnapshot, "mode" | "elapsed">) {
  return (
    (town.mode === "providers" && town.elapsed < PROVIDERS_READY) ||
    (town.mode === "automations" && town.elapsed < TOWN_READY)
  );
}
export function visibleAt(
  town: Pick<TownSnapshot, "mode" | "elapsed">,
  at: number,
) {
  return town.mode !== "lobby" && town.elapsed >= at;
}

/** Players advance each sandbox stage; the optional demo plays them automatically.
 * Each destination has independent delivery capacity, retries, and accounting.
 */
export class Town {
  mode: TownMode = "lobby";
  elapsed = 0;
  emergency: Emergency | null = null;
  automation: Automation | null = null;
  private demoTime = 0;
  private demoState: DemoSnapshot["state"] = "idle";
  readonly destinations: Record<Automation, Simulation> = {
    n8n: new Simulation(),
    zapier: new Simulation(),
    make: new Simulation(),
  };
  private pending = 0;
  private undoSteps: { label: string; restore: () => void }[] = [];
  constructor(readonly app: Simulation) {
    this.reset();
  }
  private resetBranches() {
    for (const id of AUTOMATIONS) {
      this.destinations[id].reset(false);
      this.destinations[id].rate = AUTOMATION[id].rate;
      this.destinations[id].inputOverride = emptyRates();
    }
  }
  private remember(label: string) {
    const state = {
      mode: this.mode,
      elapsed: this.elapsed,
      emergency: this.emergency,
      automation: this.automation,
      pending: this.pending,
    };
    const restoreReceivers = [
      this.app,
      ...Object.values(this.destinations),
    ].map((receiver) => receiver.checkpoint());
    this.undoSteps.push({
      label,
      restore: () => {
        Object.assign(this, state);
        for (const restore of restoreReceivers) restore();
      },
    });
  }
  undo() {
    if (this.mode === "demo") return false;
    const step = this.undoSteps.pop();
    if (!step) return false;
    step.restore();
    this.syncBranches();
    return true;
  }
  reset() {
    this.undoSteps = [];
    this.demoState = "idle";
    this.demoTime = 0;
    this.app.reset(false);
    this.app.rate = 80;
    this.app.inputOverride = emptyRates();
    for (const source of SOURCES) this.app.sourceConnected[source] = false;
    this.resetBranches();
    this.elapsed = 0;
    this.pending = 0;
    this.emergency = null;
    this.automation = null;
    this.mode = "lobby";
  }
  build() {
    this.reset();
    this.remember("adding third-party webhooks");
    for (const source of SOURCES) this.app.sourceConnected[source] = true;
    this.mode = "providers";
  }
  addAutomation(id: Automation) {
    if (this.mode !== "providers" || constructionBusy(this)) return;
    this.remember(`adding ${AUTOMATION[id].name}`);
    this.automation = id;
    this.mode = "automations";
    this.elapsed = AUTOMATIONS_START;
  }
  startEmergency(event: Emergency) {
    if (
      (this.mode !== "automations" && this.mode !== "emergency") ||
      constructionBusy(this)
    )
      return;
    this.remember("starting the traffic spike");
    this.app.inputOverride = null;
    if (event === "storm") this.app.startAllSpikes();
    else this.app.startEvent(event);
    this.emergency = event;
    this.mode = "emergency";
    this.syncBranches();
  }
  deployGuard() {
    if (
      (this.mode !== "emergency" &&
        this.mode !== "playing" &&
        this.mode !== "demo") ||
      this.app.enabled
    )
      return 0;
    if (this.mode === "emergency") this.remember("deploying Hookdeck");
    const paused = this.app.paused;
    this.app.connect();
    if (this.mode === "emergency") this.mode = "playing";
    const receivers = [
      this.app,
      ...(this.automation ? [this.destinations[this.automation]] : []),
    ];
    let restarted = 0;
    // The game's rescue action restarts overload casualties. Deliberate
    // maintenance remains player-controlled, and delivery history is retained.
    for (const receiver of receivers) {
      if (receiver.offlineReason === "overload") {
        receiver.setOnline(true);
        restarted++;
      }
    }
    this.app.paused = paused;
    this.syncBranches();
    return restarted;
  }
  explore(automation: Automation | null = this.automation) {
    this.undoSteps = [];
    this.demoState = "idle";
    this.demoTime = 0;
    this.app.reset(true);
    this.app.rate = 80;
    this.resetBranches();
    this.mode = "playing";
    this.elapsed = TOWN_READY;
    this.pending = 0;
    this.emergency = null;
    this.automation = automation;
    this.syncBranches();
  }
  startDemo() {
    const automation = this.automation ?? "n8n";
    this.build();
    this.undoSteps = [];
    this.automation = automation;
    this.mode = "demo";
    this.demoState = "running";
  }
  private advanceDemo(dt: number) {
    this.demoTime = Math.min(DEMO_SECONDS, this.demoTime + dt);
    if (DEMO_SECONDS - this.demoTime < 1e-8) this.demoTime = DEMO_SECONDS;
    const time = this.demoTime;
    this.elapsed =
      time < DEMO_TIMING.automation
        ? Math.min(
            PROVIDERS_READY,
            Math.max(
              0,
              ((time - DEMO_TIMING.providers) * PROVIDERS_READY) /
                (DEMO_TIMING.automation - DEMO_TIMING.providers),
            ),
          )
        : Math.min(
            TOWN_READY,
            AUTOMATIONS_START + time - DEMO_TIMING.automation,
          );
    if (time >= DEMO_TIMING.launch && !this.emergency) {
      this.emergency = "product-launch";
      this.app.startEvent("product-launch");
    }
    if (time >= DEMO_TIMING.guard && !this.app.enabled) this.deployGuard();
    if (time >= DEMO_TIMING.draining && this.app.inSurge)
      this.app.stopAllSpikes();
    const rates = demoRates(time);
    this.app.inputOverride = Object.fromEntries(
      SOURCES.map((source) => [
        source,
        this.elapsed >= ARRIVAL[source] + 0.8 ? rates[source] : 0,
      ]),
    ) as Record<Source, number>;
  }
  toggleProvider(source: Source) {
    if (this.mode === "lobby" || this.mode === "demo") return;
    this.app.sourceConnected[source] = !this.app.sourceConnected[source];
    this.syncBranches();
  }
  toggleEndpoint(id: Automation) {
    if (
      this.mode === "demo" ||
      id !== this.automation ||
      !visibleAt(this, ARRIVAL[id] + 1)
    )
      return;
    const destination = this.destinations[id];
    destination.setOnline(!destination.online);
  }
  syncBranches() {
    const rates = this.app.sourceRates;
    for (const id of AUTOMATIONS) {
      const branch = this.destinations[id];
      if (branch.enabled !== this.app.enabled) {
        if (this.app.enabled) branch.connect();
        else branch.disconnect();
      }
      const source = AUTOMATION[id].source;
      branch.inputOverride =
        id === this.automation && visibleAt(this, ARRIVAL[id] + 0.8)
          ? { ...emptyRates(), [source]: rates[source] }
          : emptyRates();
      branch.paused = this.app.paused;
    }
  }
  step(seconds: number) {
    if (this.mode === "lobby" || this.app.paused) return;
    this.pending += Math.max(0, seconds);
    while (this.pending >= 0.05 - 1e-8 && !this.app.paused) {
      this.pending = Math.max(0, this.pending - 0.05);
      if (this.mode === "demo") this.advanceDemo(0.05);
      else if (this.mode === "providers") {
        this.elapsed = Math.min(PROVIDERS_READY, this.elapsed + 0.05);
        this.app.inputOverride = Object.fromEntries(
          SOURCES.map((source) => [
            source,
            this.elapsed < ARRIVAL[source] + 0.8 ? 0 : 20 / 3,
          ]),
        ) as Record<Source, number>;
      } else if (this.mode === "automations") {
        this.elapsed = Math.min(TOWN_READY, this.elapsed + 0.05);
        this.app.inputOverride = null;
      }
      this.syncBranches();
      for (const id of AUTOMATIONS) {
        if (id === this.automation && visibleAt(this, ARRIVAL[id] + 0.8))
          this.destinations[id].step(0.05 * TIME_SCALE);
      }
      this.app.step(0.05 * TIME_SCALE);
      if (this.mode === "demo" && this.demoTime >= DEMO_SECONDS) {
        this.demoState = "complete";
        this.mode = "playing";
        this.app.inputOverride = null;
      }
    }
  }
  snapshot(): TownSnapshot {
    const destinations = Object.fromEntries(
      AUTOMATIONS.map((id) => [id, this.destinations[id].snapshot()]),
    ) as Record<Automation, Snapshot>;
    const all = [
      this.app.snapshot(),
      ...(this.automation ? [destinations[this.automation]] : []),
    ];
    return {
      mode: this.mode,
      undoLabel: this.undoSteps.at(-1)?.label ?? null,
      demo: {
        state: this.demoState,
        elapsed: this.demoTime,
        phase: demoPhase(this.demoTime),
      },
      elapsed: this.elapsed,
      emergency: this.emergency,
      automation: this.automation,
      destinations,
      delivered: all.reduce((n, s) => n + s.delivered, 0),
      waiting: all.reduce((n, s) => n + s.waiting, 0),
      lost: all.reduce((n, s) => n + s.unsuccessful, 0),
      received: all.reduce((n, s) => n + s.received, 0),
    };
  }
}
