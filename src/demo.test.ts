import { describe, expect, it } from "vitest";
import { Simulation } from "./simulation";
import { ARRIVAL, AUTOMATIONS, Town, visibleAt } from "./town";
import { DEMO_SECONDS, DEMO_TIMING } from "./demo";

function conserved(town: Town) {
  const snapshot = town.snapshot();
  expect(snapshot.received).toBe(
    snapshot.delivered + snapshot.waiting + snapshot.delivering + snapshot.lost,
  );
}
function advanceTo(town: Town, seconds: number) {
  town.step(seconds - town.snapshot().demo.elapsed);
}

describe("optional 45-second webhook emergency", () => {
  it("builds the providers and one automation before starting the launch", () => {
    const app = new Simulation(),
      town = new Town(app);
    town.startDemo();
    expect(town.snapshot().demo).toMatchObject({
      state: "running",
      phase: "app",
      elapsed: 0,
    });
    expect(town.automation).toBe("n8n");
    expect(visibleAt(town, ARRIVAL.shopify)).toBe(false);
    advanceTo(town, DEMO_TIMING.providers - 0.1);
    expect(app.received).toBe(0);
    advanceTo(town, DEMO_TIMING.providers + 2.1);
    expect(visibleAt(town, ARRIVAL.shopify)).toBe(true);
    expect(visibleAt(town, ARRIVAL.whatsapp)).toBe(false);
    expect(app.delivered).toBe(0);
    expect(app.snapshot().flights.length).toBeGreaterThan(0);
    advanceTo(town, 9.5);
    expect(app.delivered).toBeGreaterThan(0);
    expect(town.destinations.n8n.received).toBe(0);
    advanceTo(town, DEMO_TIMING.automation + 4.5);
    expect(town.snapshot().demo.phase).toBe("automation");
    expect(visibleAt(town, ARRIVAL.n8n + 1)).toBe(true);
    expect(town.destinations.n8n.delivered).toBeGreaterThan(0);
    expect(app.inSurge).toBe(false);
    advanceTo(town, DEMO_TIMING.launch + 0.5);
    expect(app.trafficEvent).toBe("product-launch");
    expect(town.snapshot().demo.phase).toBe("launch");
    conserved(town);
  });
  it.each(AUTOMATIONS)(
    "gives the app and %s time to overload, crash, recover and drain over 45 seconds",
    (id) => {
      const app = new Simulation(),
        town = new Town(app);
      town.automation = id;
      town.startDemo();
      advanceTo(town, DEMO_TIMING.overload);
      for (const receiver of [app, town.destinations[id]]) {
        expect(receiver.online).toBe(true);
        expect(receiver.snapshot().overloadProgress).toBeGreaterThan(0);
      }
      advanceTo(town, DEMO_TIMING.crashed + 0.1);
      for (const receiver of [app, town.destinations[id]]) {
        expect(receiver.online).toBe(false);
        expect(receiver.offlineReason).toBe("overload");
      }
      const lost = town.snapshot().lost;
      advanceTo(town, DEMO_TIMING.guard + 0.1);
      expect(town.snapshot().demo.phase).toBe("guard");
      const deploymentLosses = town.snapshot().lost;
      expect(deploymentLosses).toBeGreaterThanOrEqual(lost);
      for (const receiver of [app, town.destinations[id]]) {
        expect(receiver.online).toBe(true);
        expect(receiver.enabled).toBe(true);
        expect(receiver.offlineReason).toBe(null);
      }
      advanceTo(town, 30);
      expect(town.mode).toBe("demo");
      advanceTo(town, DEMO_TIMING.draining);
      expect(town.snapshot().waiting).toBeGreaterThan(0);
      const rescueLosses = town.snapshot().lost;
      expect(rescueLosses).toBeGreaterThan(deploymentLosses);
      advanceTo(town, DEMO_TIMING.steady);
      expect(town.snapshot().waiting).toBe(0);
      advanceTo(town, DEMO_SECONDS - 0.05);
      expect(town.mode).toBe("demo");
      town.step(0.05);
      expect(town.mode).toBe("playing");
      expect(town.snapshot().demo).toMatchObject({
        state: "complete",
        elapsed: DEMO_SECONDS,
      });
      expect(town.snapshot().waiting).toBe(0);
      expect(town.snapshot().lost).toBe(rescueLosses);
      expect(app.online).toBe(true);
      expect(town.destinations[id].online).toBe(true);
      for (const other of AUTOMATIONS.filter((other) => other !== id))
        expect(town.destinations[other].received).toBe(0);
      expect(app.inputOverride).toBe(null);
      expect(app.inSurge).toBe(false);
      const delivered = town.snapshot().delivered;
      town.step(2);
      expect(town.snapshot().delivered).toBeGreaterThan(delivered);
      expect(town.snapshot().demo.elapsed).toBe(DEMO_SECONDS);
      conserved(town);
    },
  );
  it("freezes the full timeline on pause and ignores provider or endpoint clicks during playback", () => {
    const app = new Simulation(),
      town = new Town(app);
    town.startDemo();
    advanceTo(town, DEMO_TIMING.overload);
    app.paused = true;
    const paused = town.snapshot();
    town.step(100);
    expect(town.snapshot()).toEqual(paused);
    town.toggleProvider("whatsapp");
    town.toggleEndpoint("n8n");
    expect(app.sourceConnected.whatsapp).toBe(true);
    expect(town.destinations.n8n.online).toBe(true);
    app.paused = false;
    advanceTo(town, DEMO_SECONDS);
    expect(town.snapshot().demo.state).toBe("complete");
    expect(app.online).toBe(true);
    conserved(town);
  });
  it("restarts cleanly and allows exit without a delayed rescue from the old demo", () => {
    const app = new Simulation(),
      town = new Town(app);
    town.startDemo();
    town.step(DEMO_TIMING.guard + 1);
    expect(app.enabled).toBe(true);
    town.startDemo();
    expect(app.enabled).toBe(false);
    expect(town.snapshot().received).toBe(0);
    expect(town.snapshot().demo.elapsed).toBe(0);
    town.step(4);
    town.explore();
    app.disconnect();
    town.step(35);
    expect(town.mode).toBe("playing");
    expect(town.snapshot().demo.state).toBe("idle");
    expect(app.enabled).toBe(false);
    expect(app.inSurge).toBe(false);
    conserved(town);
  });
  it("keeps the timeline and accounting identical across irregular frame intervals", () => {
    const regular = new Town(new Simulation()),
      irregular = new Town(new Simulation());
    regular.startDemo();
    irregular.startDemo();
    regular.step(DEMO_SECONDS);
    for (let i = 0; i < 150; i++) {
      irregular.step(0.113);
      irregular.step(0.187);
    }
    expect(irregular.snapshot()).toEqual(regular.snapshot());
  });
});
