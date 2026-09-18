import { describe, expect, it } from "vitest";
import { Simulation } from "./simulation";
import { present } from "./presentation";
import {
  ARRIVAL,
  AUTOMATIONS,
  Town,
  constructionBusy,
  visibleAt,
  type Automation,
} from "./town";

function conservation(town: Town) {
  const s = town.snapshot();
  expect(s.received).toBe(s.delivered + s.waiting + s.lost);
  for (const id of AUTOMATIONS) {
    const d = s.destinations[id];
    expect(d.received).toBe(d.delivered + d.waiting + d.unsuccessful);
  }
}
function assemble(town: Town, automation: Automation = "n8n") {
  town.build();
  town.step(4);
  town.addAutomation(automation);
  town.step(4);
}
describe("player-led Hookdeck town", () => {
  it.each(["make", "n8n"] as const)(
    "undoes Zapier and lets the player choose %s with providers retained",
    (replacement) => {
      const app = new Simulation(),
        town = new Town(app);
      town.build();
      town.step(4);
      town.toggleProvider("whatsapp");
      const before = town.snapshot(),
        appBefore = app.snapshot();
      town.addAutomation("zapier");
      town.step(6);
      expect(town.destinations.zapier.received).toBeGreaterThan(0);
      expect(town.undo()).toBe(true);
      expect(town.snapshot()).toEqual(before);
      expect(app.snapshot()).toEqual(appBefore);
      expect(town.automation).toBe(null);
      expect(constructionBusy(town)).toBe(false);
      town.toggleProvider("whatsapp");
      town.addAutomation(replacement);
      town.step(4);
      expect(town.automation).toBe(replacement);
      expect(town.destinations[replacement].delivered).toBeGreaterThan(0);
      expect(town.destinations.zapier.received).toBe(0);
      conservation(town);
    },
  );
  it("undoes rescue, emergency, automation, and providers one step at a time", () => {
    const app = new Simulation(),
      town = new Town(app);
    const lobby = town.snapshot();
    assemble(town, "make");
    const ready = town.snapshot();
    town.startEmergency("storm");
    town.step(5);
    const crashed = town.snapshot(),
      crashedApp = app.snapshot();
    town.deployGuard();
    town.step(3);
    expect(app.waiting).toBeGreaterThan(0);
    expect(town.undo()).toBe(true);
    expect(town.snapshot()).toEqual(crashed);
    expect(app.snapshot()).toEqual(crashedApp);
    expect(town.undo()).toBe(true);
    expect(town.snapshot()).toEqual(ready);
    expect(app.inSurge).toBe(false);
    expect(app.online).toBe(true);
    town.undo();
    expect(town.mode).toBe("providers");
    town.undo();
    expect(town.snapshot()).toEqual(lobby);
    expect(app.incoming).toBe(0);
    expect(town.undo()).toBe(false);
    conservation(town);
  });
  it("restores paused setup and clears undo when starting over or watching the demo", () => {
    const app = new Simulation(),
      town = new Town(app);
    town.build();
    town.step(4);
    app.paused = true;
    town.syncBranches();
    const before = town.snapshot();
    town.addAutomation("zapier");
    town.undo();
    expect(app.paused).toBe(true);
    expect(town.snapshot()).toEqual(before);
    town.reset();
    expect(town.undo()).toBe(false);
    town.startDemo();
    expect(town.snapshot().undoLabel).toBe(null);
    expect(town.undo()).toBe(false);
    town.explore();
    expect(town.undo()).toBe(false);
  });
  it("starts with only the app and no traffic until providers are explicitly added", () => {
    const app = new Simulation(),
      town = new Town(app);
    expect(town.mode).toBe("lobby");
    expect(constructionBusy(town)).toBe(false);
    town.addAutomation("n8n");
    town.toggleProvider("shopify");
    town.startEmergency("storm");
    town.deployGuard();
    town.step(120);
    expect(town.mode).toBe("lobby");
    expect(town.automation).toBe(null);
    expect(app.online).toBe(true);
    expect(app.incoming).toBe(0);
    expect(app.received).toBe(0);
    expect(app.delivered).toBe(0);
    expect(Object.values(app.sourceConnected)).toEqual([false, false, false]);
    expect(app.enabled).toBe(false);
    expect(app.inSurge).toBe(false);
    for (const at of [
      ARRIVAL.shopify,
      ARRIVAL.stripe,
      ARRIVAL.whatsapp,
      ARRIVAL.n8n,
    ])
      expect(visibleAt(town, at)).toBe(false);
    for (const id of AUTOMATIONS)
      expect(town.destinations[id].received).toBe(0);
    conservation(town);
    town.build();
    expect(town.mode).toBe("providers");
    expect(app.incoming).toBe(0);
    town.step(4);
    expect(app.delivered).toBeGreaterThan(0);
    expect(town.automation).toBe(null);
    expect(visibleAt(town, ARRIVAL.whatsapp)).toBe(true);
    conservation(town);
  });
  it.each(AUTOMATIONS)("attaches only the chosen %s automation", (id) => {
    const app = new Simulation(),
      town = new Town(app);
    town.build();
    town.step(4);
    town.addAutomation(id);
    town.addAutomation(id === "n8n" ? "zapier" : "n8n");
    town.step(120);
    expect(town.automation).toBe(id);
    expect(town.mode).toBe("automations");
    expect(town.destinations[id].delivered).toBeGreaterThan(0);
    for (const other of AUTOMATIONS.filter((value) => value !== id)) {
      expect(town.destinations[other].received).toBe(0);
      expect(town.destinations[other].unsuccessful).toBe(0);
    }
    expect(app.inSurge).toBe(false);
    expect(app.enabled).toBe(false);
    conservation(town);
  });
  it("finishes each arrival before allowing the next action, without resetting previous deliveries", () => {
    const app = new Simulation(),
      town = new Town(app);
    town.build();
    town.addAutomation("n8n");
    town.startEmergency("storm");
    expect(town.mode).toBe("providers");
    town.step(4);
    const delivered = app.delivered;
    town.addAutomation("n8n");
    town.startEmergency("storm");
    expect(town.mode).toBe("automations");
    expect(app.delivered).toBe(delivered);
    expect(app.inSurge).toBe(false);
    town.step(4);
    const elapsed = town.elapsed;
    town.addAutomation("n8n");
    expect(town.elapsed).toBe(elapsed);
    conservation(town);
  });
  it("overloads every receiver in a storm and rescues the same live traffic only on deployment", () => {
    const app = new Simulation(),
      town = new Town(app);
    assemble(town);
    town.startEmergency("storm");
    town.step(3);
    expect(town.mode).toBe("emergency");
    expect(app.enabled).toBe(false);
    for (const destination of [app, town.destinations.n8n]) {
      expect(present(destination.snapshot()).health).toBe("overloaded");
      expect(destination.unsuccessful).toBeGreaterThan(0);
    }
    const incoming = app.incoming,
      lost = town.snapshot().lost,
      received = town.snapshot().received;
    town.deployGuard();
    expect(town.mode).toBe("playing");
    expect(town.snapshot().received).toBe(received);
    expect(app.incoming).toBe(incoming);
    town.step(3);
    expect(town.snapshot().lost).toBe(lost);
    expect(town.snapshot().waiting).toBeGreaterThan(0);
    for (const destination of [app, town.destinations.n8n]) {
      expect(present(destination.snapshot()).health).toBe("healthy");
    }
    conservation(town);
  });
  it.each(AUTOMATIONS)(
    "brings the crashed app and %s back online when Hookdeck guard is deployed",
    (id) => {
      const app = new Simulation(),
        town = new Town(app);
      assemble(town, id);
      town.startEmergency("storm");
      town.step(3);
      for (const destination of [app, town.destinations[id]]) {
        expect(destination.online).toBe(true);
        expect(destination.snapshot().overloadProgress).toBeGreaterThan(0.5);
      }
      town.step(2);
      for (const destination of [app, town.destinations[id]])
        expect(destination.snapshot()).toMatchObject({
          online: false,
          offlineReason: "overload",
        });
      const before = town.snapshot(),
        incoming = app.incoming;
      expect(town.deployGuard()).toBe(2);
      for (const destination of [app, town.destinations[id]])
        expect(destination.snapshot()).toMatchObject({
          online: true,
          offlineReason: null,
          overloadProgress: 0,
          enabled: true,
        });
      expect(town.snapshot()).toMatchObject({
        delivered: before.delivered,
        received: before.received,
        waiting: before.waiting,
        lost: before.lost,
      });
      expect(app.incoming).toBe(incoming);
      const delivered = town.snapshot().delivered,
        lost = town.snapshot().lost;
      town.step(3);
      expect(town.snapshot().delivered).toBeGreaterThan(delivered);
      expect(town.snapshot().lost).toBe(lost);
      expect(town.snapshot().waiting).toBeGreaterThan(0);
      town.step(5);
      expect(app.online).toBe(true);
      expect(town.destinations[id].online).toBe(true);
      expect(town.destinations[id].snapshot().deliveryRate).toBeGreaterThan(0);
      app.stopAllSpikes();
      town.step(250);
      expect(town.snapshot().waiting).toBe(0);
      expect(town.snapshot().lost).toBe(lost);
      conservation(town);
    },
  );
  it("rescues another crash on redeployment while preserving queues and the paused state", () => {
    const app = new Simulation(),
      town = new Town(app);
    town.explore("n8n");
    app.startAllSpikes();
    town.step(2);
    app.disconnect();
    town.step(5);
    expect(app.offlineReason).toBe("overload");
    expect(town.destinations.n8n.offlineReason).toBe("overload");
    const before = town.snapshot();
    expect(before.waiting).toBeGreaterThan(0);
    app.paused = true;
    expect(town.deployGuard()).toBe(2);
    expect(town.snapshot()).toMatchObject({
      mode: "playing",
      delivered: before.delivered,
      received: before.received,
      waiting: before.waiting,
      lost: before.lost,
    });
    const paused = town.snapshot();
    town.step(10);
    expect(town.snapshot()).toEqual(paused);
    expect(app.online).toBe(true);
    expect(town.destinations.n8n.online).toBe(true);
    app.paused = false;
    town.step(10);
    expect(town.snapshot().delivered).toBeGreaterThan(before.delivered);
    expect(town.snapshot().lost).toBe(before.lost);
    conservation(town);
  });
  it("does not crash an automation just because the app receives too much traffic", () => {
    const app = new Simulation(),
      town = new Town(app);
    assemble(town, "n8n");
    town.startEmergency("black-friday");
    town.step(10);
    expect(app.offlineReason).toBe("overload");
    expect(town.destinations.n8n.snapshot()).toMatchObject({
      online: true,
      offlineReason: null,
      overloadProgress: 0,
    });
    conservation(town);
  });
  it("runs the chosen named event and lets it expire without automatically deploying Hookdeck", () => {
    const app = new Simulation(),
      town = new Town(app);
    assemble(town);
    town.startEmergency("black-friday");
    expect(app.trafficEvent).toBe("black-friday");
    town.step(10);
    expect(app.unsuccessful).toBeGreaterThan(0);
    town.step(55);
    expect(app.inSurge).toBe(false);
    expect(app.enabled).toBe(false);
    expect(town.mode).toBe("emergency");
    town.startEmergency("product-launch");
    expect(app.trafficEvent).toBe("product-launch");
    expect(app.inSurge).toBe(true);
    conservation(town);
  });
  it("freezes construction and emergency traffic while paused", () => {
    const app = new Simulation(),
      town = new Town(app);
    town.build();
    town.step(1);
    app.paused = true;
    const before = town.snapshot();
    town.step(100);
    expect(town.snapshot()).toEqual(before);
    app.paused = false;
    town.step(3);
    town.addAutomation("n8n");
    town.step(4);
    town.startEmergency("storm");
    town.step(2);
    app.paused = true;
    const emergency = town.snapshot();
    town.step(100);
    expect(town.snapshot()).toEqual(emergency);
    conservation(town);
  });
  it("keeps deliberate app and automation maintenance under player control", () => {
    const app = new Simulation(),
      town = new Town(app);
    assemble(town);
    town.startEmergency("storm");
    app.setOnline(false);
    town.destinations.n8n.setOnline(false);
    expect(town.deployGuard()).toBe(0);
    town.step(3);
    expect(app.online).toBe(false);
    expect(town.destinations.n8n.online).toBe(false);
    expect(town.destinations.n8n.waiting).toBeGreaterThan(0);
    expect(app.delivered).toBeGreaterThan(0);
    expect(town.destinations.zapier.received).toBe(0);
    app.stopAllSpikes();
    app.setOnline(true);
    town.toggleEndpoint("n8n");
    town.step(45);
    expect(town.destinations.n8n.waiting).toBe(0);
    conservation(town);
  });
  it("supports repeat builds with fresh counters and providers", () => {
    const app = new Simulation(),
      town = new Town(app);
    assemble(town);
    town.startEmergency("storm");
    town.step(2);
    town.deployGuard();
    town.build();
    expect(town.mode).toBe("providers");
    expect(town.elapsed).toBe(0);
    expect(town.emergency).toBe(null);
    expect(town.snapshot().received).toBe(0);
    expect(app.enabled).toBe(false);
  });
  it("starts over with one healthy app and no connections or traffic", () => {
    const app = new Simulation(),
      town = new Town(app);
    assemble(town);
    town.startEmergency("storm");
    town.step(5);
    town.deployGuard();
    town.step(2);
    app.paused = true;
    town.reset();
    town.step(120);
    expect(town.snapshot()).toMatchObject({
      mode: "lobby",
      elapsed: 0,
      automation: null,
      emergency: null,
      received: 0,
      delivered: 0,
      waiting: 0,
      lost: 0,
      demo: { state: "idle", elapsed: 0 },
    });
    expect(app.snapshot()).toMatchObject({
      online: true,
      enabled: false,
      paused: false,
      incoming: 0,
    });
    expect(Object.values(app.sourceConnected)).toEqual([false, false, false]);
    conservation(town);
  });
  it("holds every branch queue during bypass and resumes without duplicating deliveries", () => {
    const app = new Simulation(),
      town = new Town(app);
    town.explore("n8n");
    app.startAllSpikes();
    town.step(2);
    const waiting = town.snapshot().waiting;
    app.disconnect();
    town.step(2);
    expect(town.snapshot().waiting).toBe(waiting);
    expect(town.snapshot().lost).toBeGreaterThan(0);
    app.stopAllSpikes();
    app.connect();
    town.step(45);
    expect(town.snapshot().waiting).toBe(0);
    conservation(town);
  });
  it("detaches provider traffic from both destinations, while existing queues keep draining", () => {
    const app = new Simulation(),
      town = new Town(app);
    assemble(town);
    town.startEmergency("storm");
    town.deployGuard();
    town.step(2);
    const waiting = town.destinations.n8n.waiting;
    expect(waiting).toBeGreaterThan(0);
    town.toggleProvider("whatsapp");
    expect(app.sourceRates.whatsapp).toBe(0);
    const received = town.destinations.n8n.received;
    town.step(3);
    expect(town.destinations.n8n.received).toBe(received);
    expect(town.destinations.n8n.waiting).toBeLessThan(waiting);
    expect(app.sourceRates.shopify).toBeGreaterThan(0);
    town.toggleProvider("whatsapp");
    town.step(1);
    expect(town.destinations.n8n.received).toBeGreaterThan(received);
    conservation(town);
  });
  it("keeps detached providers disconnected when a named emergency starts", () => {
    const app = new Simulation(),
      town = new Town(app);
    assemble(town, "zapier");
    town.toggleProvider("shopify");
    town.startEmergency("black-friday");
    const before = town.destinations.zapier.received;
    town.step(10);
    expect(app.sourceRates.shopify).toBe(0);
    expect(app.sourceRates.stripe).toBeGreaterThan(0);
    expect(town.destinations.zapier.received).toBe(before);
    conservation(town);
  });
  it("lets the app go offline and recover before automation setup", () => {
    const app = new Simulation(),
      town = new Town(app);
    town.build();
    town.step(4);
    app.setOnline(false);
    town.step(2);
    expect(app.unsuccessful).toBeGreaterThan(0);
    app.setOnline(true);
    const lost = app.unsuccessful;
    town.step(2);
    expect(app.delivered).toBeGreaterThan(0);
    expect(app.unsuccessful).toBe(lost);
    conservation(town);
  });
  it("keeps the selected tool when exiting the automatic demo", () => {
    const app = new Simulation(),
      town = new Town(app);
    assemble(town, "make");
    town.startDemo();
    town.step(2);
    expect(town.destinations.make.received).toBe(0);
    town.explore();
    expect(town.automation).toBe("make");
    town.step(2);
    expect(town.destinations.make.received).toBeGreaterThan(0);
    expect(town.destinations.n8n.received).toBe(0);
    conservation(town);
  });
});
