import type { Source } from "./simulation";

export type TrafficEventId =
  | "black-friday"
  | "product-launch"
  | "flash-sale"
  | "going-viral"
  | "message-blast";
export const TRAFFIC_EVENTS: {
  id: TrafficEventId;
  name: string;
  description: string;
  sources: Source[];
}[] = [
  {
    id: "black-friday",
    name: "Black Friday",
    description: "Orders surge first. Payments follow.",
    sources: ["shopify", "stripe"],
  },
  {
    id: "product-launch",
    name: "Product launch",
    description: "A quiet opening builds into a busy launch.",
    sources: ["shopify", "stripe", "whatsapp"],
  },
  {
    id: "flash-sale",
    name: "Flash sale",
    description: "Short checkout bursts, with a breather between each.",
    sources: ["shopify", "stripe"],
  },
  {
    id: "going-viral",
    name: "Going viral",
    description: "Messages spread, then shoppers and payments arrive.",
    sources: ["shopify", "stripe", "whatsapp"],
  },
  {
    id: "message-blast",
    name: "Message blast",
    description: "A WhatsApp campaign arrives in three rolling waves.",
    sources: ["whatsapp"],
  },
];

export function trafficRates(
  id: TrafficEventId,
  seconds: number,
): Record<Source, number> {
  const t = Math.max(0, Math.min(60, seconds));
  const wave = (center: number, width: number) =>
    Math.max(0, 1 - Math.abs(t - center) / width);
  switch (id) {
    case "black-friday":
      return {
        shopify: 180 + 300 * wave(10, 10) + 180 * wave(35, 12),
        stripe: 100 + 260 * wave(16, 12) + 170 * wave(42, 14),
        whatsapp: 7,
      };
    case "product-launch": {
      const ramp = Math.min(1, t / 42);
      return {
        shopify: 12 + 320 * ramp,
        stripe: 10 + 240 * ramp ** 1.5,
        whatsapp: 8 + 180 * ramp,
      };
    }
    case "flash-sale": {
      const burst = t % 16 < 5;
      return {
        shopify: burst ? 540 : 18,
        stripe: t % 16 >= 2 && t % 16 < 8 ? 320 : 14,
        whatsapp: 7,
      };
    }
    case "going-viral":
      return {
        shopify: 12 + 290 * wave(38, 24),
        stripe: 10 + 220 * wave(46, 22),
        whatsapp: 25 + 460 * wave(15, 15) + 250 * wave(35, 20),
      };
    case "message-blast":
      return {
        shopify: 7,
        stripe: 7,
        whatsapp: 14 + 600 * Math.max(wave(8, 8), wave(28, 9), wave(48, 10)),
      };
  }
}
