import { describe, expect, it } from "vitest";
import { trafficRates, TRAFFIC_EVENTS } from "./traffic";
import { Simulation, TIME_SCALE } from "./simulation";

describe("event traffic", () => {
  it("separates commerce, campaign waves, launch ramps, and flash-sale breaks", () => {
    expect(trafficRates("black-friday", 10).shopify).toBeGreaterThan(
      trafficRates("black-friday", 10).whatsapp * 20,
    );
    for (const peak of [8, 28, 48])
      expect(trafficRates("message-blast", peak).whatsapp).toBeGreaterThan(500);
    expect(trafficRates("message-blast", 18).whatsapp).toBeLessThan(50);
    expect(trafficRates("product-launch", 40).stripe).toBeGreaterThan(
      trafficRates("product-launch", 5).stripe * 4,
    );
    expect(trafficRates("flash-sale", 3).shopify).toBeGreaterThan(
      trafficRates("flash-sale", 12).shopify * 10,
    );
  });
  it.each(TRAFFIC_EVENTS)(
    "accounts for $name and ends it after a minute",
    ({ id }) => {
      const sim = new Simulation();
      sim.connect();
      sim.startEvent(id);
      sim.step(60 * TIME_SCALE);
      expect(sim.inSurge).toBe(false);
      expect(sim.trafficEvent).toBeNull();
      expect(sim.received).toBe(sim.delivered + sim.waiting);
      expect(sim.unsuccessful).toBe(0);
    },
  );
  it("allows individual manual surges alongside an event", () => {
    const sim = new Simulation();
    sim.startEvent("black-friday");
    const orders = sim.sourceRates.shopify;
    sim.toggleSpike("whatsapp");
    expect(sim.sourceRates.whatsapp).toBe(380);
    expect(sim.sourceRates.shopify).toBe(orders);
    sim.toggleSpike("shopify");
    expect(sim.sourceRates.shopify).toBe(10);
    expect(sim.sourceRates.stripe).toBeGreaterThan(10);
  });
});
