import { describe, expect, it } from "vitest";
import {
  OVERLOAD_SECONDS,
  RUSH_SECONDS,
  Simulation,
  TIME_SCALE,
} from "./simulation";

describe("webhook delivery model", () => {
  it("warns under sustained overload, then stays crashed until explicitly restarted", () => {
    const sim = new Simulation();
    sim.startAllSpikes();
    sim.step((OVERLOAD_SECONDS - 0.1) * TIME_SCALE);
    expect(sim.snapshot()).toMatchObject({
      online: true,
      phase: "overloaded",
      offlineReason: null,
    });
    expect(sim.snapshot().overloadProgress).toBeGreaterThan(0.9);
    sim.step(0.1 * TIME_SCALE);
    expect(sim.snapshot()).toMatchObject({
      online: false,
      phase: "offline",
      offlineReason: "overload",
      deliveryRate: 0,
    });
    const delivered = sim.delivered;
    sim.stopAllSpikes();
    sim.step(10);
    expect(sim.online).toBe(false);
    expect(sim.delivered).toBe(delivered);
    expect(sim.received).toBe(sim.delivered + sim.unsuccessful);
    sim.setOnline(true);
    sim.step(10);
    expect(sim.snapshot()).toMatchObject({
      online: true,
      offlineReason: null,
      overloadProgress: 0,
    });
    expect(sim.delivered).toBeGreaterThan(delivered);
  });
  it("prevents a crash when Hookdeck is deployed during the warning, regardless of queue size", () => {
    const sim = new Simulation();
    sim.startAllSpikes();
    sim.step((OVERLOAD_SECONDS - 1) * TIME_SCALE);
    expect(sim.snapshot().overloadProgress).toBeGreaterThan(0);
    sim.connect();
    const lost = sim.unsuccessful;
    sim.step(55 * TIME_SCALE);
    expect(sim.waiting).toBeGreaterThan(50_000);
    expect(sim.snapshot()).toMatchObject({
      online: true,
      offlineReason: null,
      overloadProgress: 0,
    });
    expect(sim.unsuccessful).toBe(lost);
    expect(sim.received).toBe(sim.delivered + sim.waiting + sim.unsuccessful);
  });
  it("restarts the overload warning after a safe interval, and freezes it when paused", () => {
    const sim = new Simulation();
    sim.startAllSpikes();
    sim.step(3 * TIME_SCALE);
    const progress = sim.snapshot().overloadProgress;
    sim.paused = true;
    sim.step(100);
    expect(sim.snapshot().overloadProgress).toBe(progress);
    sim.paused = false;
    sim.stopAllSpikes();
    sim.step(2 * TIME_SCALE);
    expect(sim.snapshot().overloadProgress).toBe(0);
    sim.startAllSpikes();
    sim.step(3 * TIME_SCALE);
    expect(sim.online).toBe(true);
    sim.step(2 * TIME_SCALE);
    expect(sim.offlineReason).toBe("overload");
    sim.setOnline(true);
    sim.step((OVERLOAD_SECONDS + 1) * TIME_SCALE);
    expect(sim.offlineReason).toBe("overload");
    sim.reset();
    expect(sim.snapshot()).toMatchObject({
      online: true,
      offlineReason: null,
      overloadProgress: 0,
    });
  });
  it("lets independent sender surges stop manually without cancelling others", () => {
    const sim = new Simulation();
    sim.startSpike("shopify");
    sim.step(5);
    sim.startSpike("stripe");
    sim.startSpike("whatsapp");
    expect(sim.incoming).toBe(1140);
    expect(sim.snapshot().sourceRates).toEqual({
      shopify: 380,
      stripe: 380,
      whatsapp: 380,
    });
    sim.toggleSpike("stripe");
    expect(sim.spikes).toEqual({
      shopify: true,
      stripe: false,
      whatsapp: true,
    });
    expect(sim.incoming).toBe(770);
    sim.step(30);
    expect(sim.incoming).toBe(770);
    expect(sim.snapshot().inSurge).toBe(true);
    sim.toggleSpike("shopify");
    expect(sim.spikes.shopify).toBe(false);
    expect(sim.spikes.whatsapp).toBe(true);
    expect(sim.incoming).toBe(400);
    sim.toggleSpike("whatsapp");
    expect(sim.incoming).toBe(20);
    expect(sim.snapshot().inSurge).toBe(false);
    expect(sim.received).toBe(sim.delivered + sim.unsuccessful);
  });
  it("ends a rush at one real minute and keeps the buffered queue intact", () => {
    const sim = new Simulation();
    sim.connect();
    sim.startAllSpikes();
    sim.step(RUSH_SECONDS * TIME_SCALE - 0.05);
    expect(sim.inSurge).toBe(true);
    expect(sim.incoming).toBe(1140);
    sim.step(0.05);
    expect(sim.inSurge).toBe(false);
    expect(sim.incoming).toBe(20);
    expect(sim.received).toBe(1140 * RUSH_SECONDS * TIME_SCALE);
    expect(sim.waiting).toBeGreaterThan(50_000);
    const waiting = sim.waiting;
    sim.step(10);
    expect(sim.waiting).toBe(waiting - 600);
    expect(sim.received).toBe(sim.delivered + sim.waiting);
    expect(sim.failedAttempts).toBe(0);
  });
  it("gives each sender its own minute and freezes the deadline while paused", () => {
    const sim = new Simulation();
    sim.startSpike("shopify");
    sim.step(15 * TIME_SCALE);
    sim.startSpike("whatsapp");
    sim.paused = true;
    sim.step(500);
    expect(sim.clock).toBeCloseTo(30);
    sim.paused = false;
    sim.step(45 * TIME_SCALE);
    expect(sim.spikes).toEqual({
      shopify: false,
      stripe: false,
      whatsapp: true,
    });
    sim.step(15 * TIME_SCALE);
    expect(sim.inSurge).toBe(false);
    sim.startSpike("whatsapp");
    sim.step(59 * TIME_SCALE);
    expect(sim.inSurge).toBe(true);
    sim.step(TIME_SCALE);
    expect(sim.inSurge).toBe(false);
  });
  it("buffers all three simultaneous surges within one delivery limit", () => {
    const sim = new Simulation();
    sim.connect();
    sim.startAllSpikes();
    sim.step(4);
    expect(sim.received).toBe(4560);
    expect(sim.delivered).toBe(320);
    expect(sim.snapshot().deliveryRate).toBe(80);
    expect(sim.unsuccessful).toBe(0);
    expect(sim.received).toBe(sim.delivered + sim.waiting);
  });
  it("stops all surges without resetting counters or removing queued events", () => {
    const sim = new Simulation();
    sim.connect();
    sim.startAllSpikes();
    sim.step(30);
    expect(sim.incoming).toBe(1140);
    const { received, delivered, waiting } = sim.snapshot();
    sim.stopAllSpikes();
    expect(sim.incoming).toBe(20);
    expect(sim.snapshot()).toMatchObject({
      received,
      delivered,
      waiting,
      inSurge: false,
    });
    expect(sim.spikes).toEqual({
      shopify: false,
      stripe: false,
      whatsapp: false,
    });
    sim.step(10);
    expect(sim.waiting).toBeLessThan(waiting);
    expect(sim.received).toBe(sim.delivered + sim.waiting);
    expect(sim.failedAttempts).toBe(0);
    sim.startAllSpikes();
    expect(sim.incoming).toBe(1140);
    sim.reset();
    expect(sim.incoming).toBe(20);
    expect(sim.inSurge).toBe(false);
  });
  it("holds the queue while disconnected, overloads on direct traffic, and resumes on redeployment", () => {
    const sim = new Simulation();
    sim.connect();
    sim.startAllSpikes();
    sim.step(2);
    const held = sim.waiting;
    sim.disconnect();
    sim.step(2);
    expect(sim.waiting).toBe(held);
    expect(sim.snapshot().load).toBe(11.4);
    expect(sim.unsuccessful).toBe(2080);
    expect(sim.received).toBe(sim.delivered + sim.waiting + sim.unsuccessful);
    sim.connect();
    sim.step(2);
    expect(sim.snapshot().load).toBe(0.8);
    expect(sim.unsuccessful).toBe(2080);
    for (const source of ["shopify", "stripe", "whatsapp"] as const)
      sim.toggleSpike(source);
    sim.step(180);
    expect(sim.waiting).toBe(0);
    expect(sim.received).toBe(sim.delivered + sim.unsuccessful);
  });
  it("keeps the server load stable across irregular animation intervals", () => {
    const sim = new Simulation();
    sim.enabled = true;
    sim.startSpike();
    sim.step(2);
    for (let i = 0; i < 30; i++) {
      sim.step(0.403);
      expect(sim.snapshot().load).toBeGreaterThan(0.65);
      expect(sim.snapshot().load).toBeLessThan(0.95);
    }
    expect(sim.failedAttempts).toBe(0);
  });
  it("replays the selected provider's burst with the same incoming volume", () => {
    const sim = new Simulation();
    sim.startSpike("stripe");
    sim.step(4);
    const directReceived = sim.received;
    sim.replayProtected();
    expect(sim.snapshot().spikeSource).toBe("stripe");
    sim.step(4);
    expect(sim.received).toBe(directReceived);
    expect(sim.failedAttempts).toBe(0);
    expect(sim.waiting).toBeGreaterThan(0);
  });
  it("shows unsuccessful direct deliveries during a spike", () => {
    const sim = new Simulation();
    sim.startSpike();
    sim.step(24);
    expect(sim.failedAttempts).toBeGreaterThan(0);
    expect(sim.received).toBe(sim.delivered + sim.unsuccessful);
    expect(sim.waiting).toBe(0);
  });
  it("buffers the same spike and drains it without exceeding configured throughput", () => {
    const sim = new Simulation();
    sim.enabled = true;
    sim.startSpike();
    sim.step(24);
    expect(sim.delivered).toBeLessThanOrEqual(24 * 80);
    expect(sim.waiting).toBeGreaterThan(0);
    expect(sim.failedAttempts).toBe(0);
    expect(sim.received).toBe(sim.delivered + sim.waiting);
    sim.stopAllSpikes();
    sim.step(180);
    expect(sim.waiting).toBe(0);
    expect(sim.received).toBe(sim.delivered);
  });
  it("keeps events during downtime and retries them after restoration", () => {
    const sim = new Simulation();
    sim.enabled = true;
    sim.setOnline(false);
    sim.step(40);
    expect(sim.delivered).toBe(0);
    expect(sim.failedAttempts).toBeGreaterThan(0);
    expect(sim.received).toBe(sim.waiting);
    sim.setOnline(true);
    sim.step(120);
    expect(sim.waiting).toBe(0);
    expect(sim.received).toBe(sim.delivered);
  });
  it("does not make the server invincible when the rate is too high", () => {
    const sim = new Simulation();
    sim.enabled = true;
    sim.rate = 150;
    sim.startSpike();
    sim.step(10);
    expect(sim.failedAttempts).toBeGreaterThan(0);
    expect(sim.offlineReason).toBe("overload");
    expect(sim.received).toBe(sim.delivered + sim.waiting + sim.unsuccessful);
  });
  it("limits retries and accounts for terminal failures", () => {
    const sim = new Simulation();
    sim.enabled = true;
    sim.setOnline(false);
    sim.step(600);
    expect(sim.unsuccessful).toBeGreaterThan(0);
    expect(sim.received).toBe(sim.delivered + sim.waiting + sim.unsuccessful);
  });
  it("pauses, resets, and replays from fresh counters", () => {
    const sim = new Simulation();
    sim.startSpike();
    sim.step(4);
    sim.paused = true;
    const snapshot = sim.snapshot();
    sim.step(10);
    expect(sim.snapshot()).toEqual(snapshot);
    sim.replayProtected();
    expect(sim.enabled).toBe(true);
    expect(sim.received).toBe(0);
    expect(sim.failedAttempts).toBe(0);
    expect(sim.inSurge).toBe(true);
  });
});
