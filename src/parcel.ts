import type { Source } from "./simulation";
import { AUTOMATION, type Automation } from "./town";

export type ParcelRoute = {
  id: string;
  source: Source;
  destination: "app" | "hookdeck" | Automation;
  viaHookdeck: boolean;
};
export type Parcel = {
  id: string;
  route: ParcelRoute;
  title: string;
  event: string;
  payload: Record<string, string | number>;
};
export type OpenParcel = {
  parcel: Parcel;
  position: [number, number, number];
  rotation: [number, number, number, number];
  color: string;
};
export const PROVIDER_NAMES = {
  shopify: "Shopify",
  stripe: "Stripe",
  whatsapp: "WhatsApp",
};
export const parcelDestination = (destination: ParcelRoute["destination"]) =>
  destination === "app"
    ? "Your app"
    : destination === "hookdeck"
      ? "Hookdeck"
      : AUTOMATION[destination].name;

/** A visual package carries its own immutable synthetic example from spawn.
 * Opening it must never generate another arrival or substitute the next event.
 */
export function createParcel(
  route: ParcelRoute,
  sequence: number,
  run: number,
): Parcel {
  const number = 1042 + sequence;
  const id = `${route.source.slice(0, 3)}_${route.destination.slice(0, 3)}_${route.viaHookdeck ? "h" : "d"}${run}_${sequence.toString().padStart(4, "0")}`;
  const data: Pick<Parcel, "title" | "event" | "payload"> =
    route.source === "shopify"
      ? {
          title: "Order placed",
          event: "orders/create",
          payload: { order_id: number, total: "89.00", currency: "USD" },
        }
      : route.source === "stripe"
        ? {
            title: "Payment received",
            event: "payment_intent.succeeded",
            payload: {
              payment_id: `pi_demo_${number}`,
              amount: 8900,
              currency: "usd",
            },
          }
        : {
            title: "Message received",
            event: "messages",
            payload: {
              message_id: `msg_${number}`,
              text: "Where is my order?",
              type: "text",
            },
          };
  return { id, route: { ...route }, ...data };
}

/** A short release grace period lets the pointer move from the line to a box. */
export class ParcelHover {
  hovered = false;
  private grace = 0;
  enter() {
    this.hovered = true;
    this.grace = 1;
  }
  leave() {
    this.hovered = false;
    this.grace = 1;
  }
  step(seconds: number) {
    if (!this.hovered) this.grace = Math.max(0, this.grace - seconds);
    return this.hovered || this.grace > 0;
  }
}
