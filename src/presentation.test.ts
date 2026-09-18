import { describe, it, expect } from "vitest";
import { Simulation } from "./simulation";
import { present } from "./presentation";

describe("shared city state", () => {
  it("uses the same safe state for the app, meter, caption, and output after activation", () => {
    const sim = new Simulation();
    sim.startSpike();
    sim.step(2);
    expect(present(sim.snapshot()).health).toBe("overloaded");
    const received = sim.received,
      failed = sim.unsuccessful;
    sim.connect();
    expect(sim.received).toBe(received);
    expect(sim.unsuccessful).toBe(failed);
    sim.step(2);
    expect(present(sim.snapshot())).toEqual({
      health: "healthy",
      dispatchRate: 80,
      outputRate: 80,
      load: 0.8,
    });
    expect(sim.received).toBe(sim.delivered + sim.waiting + sim.unsuccessful);
    expect(sim.unsuccessful).toBe(failed);
  });
  it("stops output while offline, buffers events, and resumes healthy delivery", () => {
    const sim = new Simulation();
    sim.connect();
    sim.setOnline(false);
    sim.step(3);
    expect(present(sim.snapshot()).health).toBe("offline");
    expect(present(sim.snapshot()).outputRate).toBe(0);
    expect(present(sim.snapshot()).load).toBe(0);
    expect(sim.waiting).toBe(sim.received);
    expect(sim.unsuccessful).toBe(0);
    sim.setOnline(true);
    sim.step(0.1);
    expect(present(sim.snapshot()).health).toBe("healthy");
    // Retry batches are not due yet: only newly arriving events are delivered.
    expect(present(sim.snapshot()).outputRate).toBe(20);
    sim.step(3);
    expect(present(sim.snapshot()).outputRate).toBeGreaterThan(20);
    expect(present(sim.snapshot()).outputRate).toBeLessThanOrEqual(80);
  });
  it("shows overload when a configured limit exceeds app capacity", () => {
    const sim = new Simulation();
    sim.connect();
    sim.rate = 150;
    sim.startSpike();
    sim.step(3);
    expect(present(sim.snapshot())).toEqual({
      health: "overloaded",
      dispatchRate: 150,
      outputRate: 100,
      load: 1.5,
    });
  });
});
