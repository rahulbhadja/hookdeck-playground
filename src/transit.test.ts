import { describe, expect, it } from "vitest";
import { Simulation, TIME_SCALE, OVERLOAD_SECONDS } from "./simulation";
import { INGRESS_SECONDS, DELIVERY_SECONDS } from "./transit";

function engine(protectedMode = false) {
  const sim = new Simulation();
  sim.transit = {
    ingress: INGRESS_SECONDS * TIME_SCALE,
    delivery: DELIVERY_SECONDS * TIME_SCALE,
  };
  sim.inputOverride = { shopify: 0, stripe: 380, whatsapp: 0 };
  if (protectedMode) sim.connect();
  return sim;
}
const advance = (sim: Simulation, seconds: number) =>
  sim.step(seconds * TIME_SCALE);
const stop = (sim: Simulation) => {
  sim.inputOverride = { shopify: 0, stripe: 0, whatsapp: 0 };
};
function conserved(sim: Simulation) {
  const s = sim.snapshot();
  expect(s.received).toBe(
    s.delivered + s.waiting + s.delivering + s.unsuccessful,
  );
}

describe("causal package journeys", () => {
  it("shows the spike in transit before any endpoint overload or failure", () => {
    const sim = engine();
    advance(sim, INGRESS_SECONDS - 0.05);
    expect(sim.snapshot()).toMatchObject({
      received: 0,
      delivered: 0,
      unsuccessful: 0,
      waiting: 0,
      overloadProgress: 0,
      online: true,
    });
    const visible = sim.snapshot().flights.filter((f) => f.visible);
    expect(visible.length).toBeGreaterThan(0);
    expect(
      visible.every((f) => f.source === "stripe" && f.leg === "direct"),
    ).toBe(true);
    advance(sim, 0.35);
    expect(sim.received).toBeGreaterThan(0);
    expect(sim.snapshot().overloadProgress).toBeGreaterThan(0);
    expect(sim.online).toBe(true);
    advance(sim, OVERLOAD_SECONDS - 0.5);
    expect(sim.online).toBe(true);
    advance(sim, 0.6);
    expect(sim.offlineReason).toBe("overload");
    conserved(sim);
  });
  it("only fills Hookdeck after intake arrives, then counts delivery after the second hop", () => {
    const sim = engine(true);
    advance(sim, INGRESS_SECONDS - 0.05);
    expect(sim.waiting).toBe(0);
    expect(sim.snapshot().delivering).toBe(0);
    advance(sim, 0.15);
    expect(sim.waiting).toBeGreaterThan(0);
    expect(sim.snapshot().delivering).toBeGreaterThan(0);
    expect(sim.delivered).toBe(0);
    expect(
      sim
        .snapshot()
        .flights.filter((f) => f.leg === "delivery")
        .every((f) => f.source === "stripe"),
    ).toBe(true);
    advance(sim, DELIVERY_SECONDS - 0.2);
    expect(sim.delivered).toBe(0);
    advance(sim, 0.25);
    expect(sim.delivered).toBeGreaterThan(0);
    expect(sim.failedAttempts).toBe(0);
    conserved(sim);
  });
  it("uses endpoint health at arrival, and starts retry backoff after failure", () => {
    const sim = engine(true);
    advance(sim, INGRESS_SECONDS + 0.2);
    stop(sim);
    sim.setOnline(false);
    expect(sim.failedAttempts).toBe(0);
    advance(sim, DELIVERY_SECONDS);
    expect(sim.failedAttempts).toBeGreaterThan(0);
    expect(sim.snapshot().retrying).toBeGreaterThan(0);
    expect(
      sim
        .snapshot()
        .outcomes.some((f) => f.failed > 0 && f.settledAt >= f.arrivesAt),
    ).toBe(true);
    sim.setOnline(true);
    advance(sim, 30);
    expect(sim.delivered).toBe(sim.received);
    conserved(sim);
  });
  it("does not reroute or delete already-departed requests when Hookdeck is deployed", () => {
    const sim = engine();
    advance(sim, 1);
    const before = sim.snapshot().flights;
    sim.connect();
    expect(sim.snapshot().flights).toEqual(before);
    advance(sim, 1.5);
    expect(sim.received).toBe(0);
    expect(sim.waiting).toBe(0);
    advance(sim, 0.6);
    expect(sim.unsuccessful).toBeGreaterThan(0);
    expect(sim.waiting).toBe(0);
    advance(sim, 1.1);
    expect(sim.waiting).toBeGreaterThan(0);
    conserved(sim);
  });
  it("finishes the last emitted wave after a provider is detached", () => {
    const sim = engine(true);
    advance(sim, 1);
    sim.sourceConnected.stripe = false;
    const emitted = sim.snapshot().flights.reduce((n, f) => n + f.count, 0);
    advance(sim, 2);
    expect(sim.received).toBe(0);
    advance(sim, 1.1);
    expect(sim.received).toBe(emitted);
    advance(sim, 20);
    expect(sim.received).toBe(emitted);
    expect(sim.delivered).toBe(emitted);
    expect(sim.snapshot().flights).toEqual([]);
    conserved(sim);
  });
  it("preserves every flight on pause and checkpoint restoration", () => {
    const sim = engine(true);
    advance(sim, INGRESS_SECONDS + 1);
    sim.paused = true;
    const before = sim.snapshot();
    const restore = sim.checkpoint();
    advance(sim, 100);
    expect(sim.snapshot()).toEqual(before);
    sim.paused = false;
    advance(sim, 4);
    restore();
    expect(sim.snapshot()).toEqual(before);
    conserved(sim);
  });
  it("keeps the same journey and accounting across irregular frame intervals", () => {
    const regular = engine(true),
      irregular = engine(true);
    advance(regular, 20);
    for (let i = 0; i < 100; i++) {
      advance(irregular, 0.073);
      advance(irregular, 0.127);
    }
    expect(irregular.snapshot()).toEqual(regular.snapshot());
    conserved(regular);
  });
});
