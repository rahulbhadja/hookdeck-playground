import { describe, expect, it } from "vitest";
import { Simulation } from "./simulation";
import { Comparison, type ComparisonConfig } from "./comparison";

const totals = (sim: Simulation) => {
  const s = sim.snapshot();
  return [
    s.received,
    s.delivered,
    s.waiting,
    s.unsuccessful,
    s.failedAttempts,
    s.online,
  ];
};

describe("following a simulated webhook", () => {
  it("observes arrivals without injecting, prioritizing, or changing delivery totals", () => {
    const watched = new Simulation(),
      baseline = new Simulation();
    for (const sim of [watched, baseline]) {
      sim.connect();
      sim.startEvent("black-friday");
    }
    for (let tick = 0; tick < 500; tick++) {
      if (tick % 73 === 0) watched.follow("stripe");
      if (tick === 140) {
        watched.setOnline(false);
        baseline.setOnline(false);
      }
      if (tick === 240) {
        watched.setOnline(true);
        baseline.setOnline(true);
      }
      watched.step(0.1);
      baseline.step(0.1);
      expect(totals(watched)).toEqual(totals(baseline));
    }
  });
  it("follows direct acceptance and keeps failed events failed after deploying", () => {
    const sim = new Simulation();
    sim.follow("shopify");
    sim.step(1);
    expect(sim.snapshot().tracked?.status).toBe("delivered");
    sim.setOnline(false);
    sim.follow("stripe");
    sim.step(1);
    expect(sim.snapshot().tracked).toMatchObject({
      status: "failed",
      protected: false,
      attempts: 1,
    });
    sim.connect();
    sim.setOnline(true);
    sim.step(10);
    expect(sim.snapshot().tracked?.status).toBe("failed");
  });
  it("waits behind the backlog and follows the same event through a partial batch", () => {
    const sim = new Simulation();
    sim.connect();
    sim.rate = 1;
    sim.step(3);
    sim.follow("stripe");
    sim.step(1);
    expect(sim.snapshot().tracked?.status).toBe("queued");
    sim.inputOverride = { shopify: 0, stripe: 0, whatsapp: 0 };
    sim.step(70);
    expect(sim.snapshot().tracked).toMatchObject({
      status: "delivered",
      protected: true,
      attempts: 1,
    });
    expect(sim.snapshot().tracked?.history.map((item) => item.status)).toEqual([
      "Received from provider",
      "Buffered by Hookdeck",
      "Endpoint accepted webhook",
    ]);
  });
  it("retains a traced retry through failed-batch merges and a held queue", () => {
    const sim = new Simulation();
    sim.connect();
    sim.setOnline(false);
    sim.step(0.6);
    sim.follow("shopify");
    sim.step(1);
    expect(sim.snapshot().tracked?.status).toBe("retrying");
    const attempts = sim.snapshot().tracked!.attempts;
    sim.disconnect();
    sim.step(20);
    expect(sim.snapshot().tracked?.attempts).toBe(attempts);
    sim.connect();
    sim.setOnline(true);
    sim.step(30);
    expect(sim.snapshot().tracked?.status).toBe("delivered");
    expect(sim.snapshot().tracked!.attempts).toBeGreaterThan(1);
  });
  it("fails the observed event when all retries are exhausted", () => {
    const sim = new Simulation();
    sim.connect();
    sim.setOnline(false);
    sim.follow("whatsapp");
    sim.step(1);
    sim.inputOverride = { shopify: 0, stripe: 0, whatsapp: 0 };
    sim.step(500);
    expect(sim.snapshot().tracked).toMatchObject({
      status: "failed",
      attempts: 8,
      nextAttemptAt: null,
    });
  });
  it("does not mutate saved snapshots and respects pause and disconnected sources", () => {
    const sim = new Simulation();
    sim.sourceConnected.stripe = false;
    sim.follow("stripe");
    sim.step(2);
    const saved = sim.snapshot();
    expect(saved.tracked?.status).toBe("pending");
    sim.sourceConnected.stripe = true;
    sim.paused = true;
    sim.step(2);
    expect(sim.snapshot().tracked?.status).toBe("pending");
    sim.paused = false;
    sim.step(1);
    expect(sim.snapshot().tracked?.status).toBe("delivered");
    expect(saved.tracked?.history).toEqual([]);
    sim.stopFollowing();
    expect(sim.snapshot().tracked).toBeNull();
  });
});

const config: ComparisonConfig = {
  event: "black-friday",
  automation: "zapier",
  connected: { shopify: true, stripe: true, whatsapp: true },
  rate: 80,
  appMaintenance: false,
  automationMaintenance: false,
};
describe("a fair traffic comparison", () => {
  it("uses identical ingress and separates queued from delivered copies", () => {
    const comparison = new Comparison(config);
    comparison.step(60);
    const result = comparison.snapshot();
    expect(result.complete).toBe(true);
    expect(result.direct.received).toBeGreaterThan(0);
    expect(result.direct.received).toBe(result.protected.received);
    for (const run of [result.direct, result.protected]) {
      expect(run.delivered + run.waiting + run.delivering + run.lost).toBe(
        run.received,
      );
    }
    expect(result.direct.lost).toBeGreaterThan(0);
    expect(result.protected.waiting).toBeGreaterThan(0);
    expect(result.protected.lost).toBe(0);
    expect(comparison.direct.app.online).toBe(false);
    expect(comparison.protected.app.online).toBe(true);
  });
  it("is deterministic across playback frame rates and freezes at the window end", () => {
    const fast = new Comparison(config),
      slow = new Comparison(config);
    fast.step(90);
    for (let i = 0; i < 600; i++) slow.step(0.1);
    expect(totals(fast.direct.app)).toEqual(totals(slow.direct.app));
    expect(totals(fast.protected.app)).toEqual(totals(slow.protected.app));
    const before = fast.snapshot();
    fast.step(20);
    expect(fast.snapshot()).toEqual(before);
  });
  it("preserves maintenance and disconnected providers equally in both runs", () => {
    const comparison = new Comparison({
      ...config,
      appMaintenance: true,
      automationMaintenance: true,
      connected: { shopify: false, stripe: true, whatsapp: false },
    });
    comparison.step(30);
    expect(comparison.direct.app.online).toBe(false);
    expect(comparison.protected.app.online).toBe(false);
    expect(comparison.protected.app.delivered).toBe(0);
    expect(comparison.protected.destinations.zapier.received).toBe(0);
    expect(comparison.direct.app.received).toBe(
      comparison.protected.app.received,
    );
    comparison.paused = true;
    const before = comparison.snapshot();
    comparison.step(10);
    expect(comparison.snapshot()).toEqual(before);
  });
  it("owns its settings without modifying the player's configuration", () => {
    const settings = structuredClone(config);
    const comparison = new Comparison(settings);
    settings.connected.shopify = false;
    comparison.step(1);
    expect(comparison.config.connected.shopify).toBe(true);
    expect(comparison.direct.app.sourceConnected.shopify).toBe(true);
    expect(settings).toEqual({
      ...config,
      connected: { ...config.connected, shopify: false },
    });
  });
});
