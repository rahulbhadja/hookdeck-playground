import { describe, expect, it } from "vitest";
import { createParcel, ParcelHover, type ParcelRoute } from "./parcel";

describe("package hover hold", () => {
  it("holds the connection for as long as the pointer is over it", () => {
    const hover = new ParcelHover();
    expect(hover.step(0.1)).toBe(false);
    hover.enter();
    for (let frame = 0; frame < 600; frame++)
      expect(hover.step(1 / 60)).toBe(true);
  });
  it("gives one second to move from the connection to a package", () => {
    const hover = new ParcelHover();
    hover.enter();
    hover.leave();
    expect(hover.step(0.4)).toBe(true);
    expect(hover.step(0.4)).toBe(true);
    expect(hover.step(0.3)).toBe(false);
  });
  it("does not release while moving between a package and its line", () => {
    const hover = new ParcelHover();
    hover.enter();
    hover.leave();
    hover.step(0.7);
    hover.enter();
    expect(hover.step(2)).toBe(true);
    hover.leave();
    expect(hover.step(1.01)).toBe(false);
  });
});

describe("contents stay with their physical package", () => {
  const route: ParcelRoute = {
    id: "shopify-app",
    source: "shopify",
    destination: "app",
    viaHookdeck: false,
  };
  it("keeps the selected package unchanged when later packages spawn", () => {
    const selected = createParcel(route, 3, 0);
    const original = structuredClone(selected);
    for (let sequence = 4; sequence < 164; sequence++)
      createParcel(route, sequence, 0);
    expect(selected).toEqual(original);
    expect(selected.payload.order_id).toBe(1045);
    route.destination = "hookdeck";
    expect(selected.route.destination).toBe("app");
  });
  it("uses the clicked provider's contents, with a distinct package identity", () => {
    const stripe = createParcel({ ...route, source: "stripe" }, 2, 1);
    const whatsapp = createParcel({ ...route, source: "whatsapp" }, 2, 1);
    expect(stripe.event).toBe("payment_intent.succeeded");
    expect(stripe.payload.amount).toBe(8900);
    expect(whatsapp.payload.text).toBe("Where is my order?");
    expect(stripe.id).not.toBe(whatsapp.id);
    expect(createParcel(route, 2, 1).id).not.toBe(createParcel(route, 3, 1).id);
  });
});
