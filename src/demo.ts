import { trafficRates } from "./traffic";
import type { Source } from "./simulation";

export const DEMO_SECONDS = 45;
export const DEMO_TITLE = "Watch the rescue";
export const DEMO_TIMING = {
  providers: 4,
  automation: 10,
  launch: 15,
  overload: 22,
  crashed: 26,
  guard: 28,
  draining: 34,
  steady: 44,
} as const;
export type DemoPhase = "app" | keyof typeof DEMO_TIMING | "complete";
export type DemoSnapshot = {
  state: "idle" | "running" | "complete";
  elapsed: number;
  phase: DemoPhase;
};

export function demoPhase(seconds: number): DemoPhase {
  if (seconds >= DEMO_SECONDS) return "complete";
  const phases = Object.entries(DEMO_TIMING) as [
    keyof typeof DEMO_TIMING,
    number,
  ][];
  return phases.findLast(([, at]) => seconds >= at)?.[0] ?? "app";
}

// Compress a product-launch ramp into the film's timeline. After the rescue,
// arrivals taper off so viewers can watch the real queues finish draining.
export function demoRates(seconds: number): Record<Source, number> {
  const normal = { shopify: 20 / 3, stripe: 20 / 3, whatsapp: 20 / 3 };
  if (seconds < DEMO_TIMING.launch) return normal;
  if (seconds < DEMO_TIMING.guard)
    return trafficRates(
      "product-launch",
      Math.min(42, (seconds - DEMO_TIMING.launch) * 7),
    );
  const peak = trafficRates("product-launch", 42);
  const remaining = Math.max(0, 1 - (seconds - DEMO_TIMING.guard) / 2);
  return {
    shopify: normal.shopify + (peak.shopify - normal.shopify) * remaining,
    stripe: normal.stripe + (peak.stripe - normal.stripe) * remaining,
    whatsapp: normal.whatsapp + (peak.whatsapp - normal.whatsapp) * remaining,
  };
}

export function demoStory(
  phase: DemoPhase,
  automation: string,
): [string, string] {
  switch (phase) {
    case "app":
      return [
        "Start with your application.",
        "Connect webhook sources, add an automation, then test a traffic spike.",
      ];
    case "providers":
      return [
        "Here come your webhooks.",
        "Shopify orders. Stripe payments. WhatsApp messages.",
      ];
    case "automation":
      return [
        "Connect an automation.",
        `Events also arrive at your ${automation} webhook endpoint.`,
      ];
    case "launch":
      return [
        "The product launch is live.",
        "More customers. More events. The rush begins.",
      ];
    case "overload":
      return [
        "Webhook traffic exceeds capacity.",
        "Your app and automation are struggling to keep up.",
      ];
    case "crashed":
      return [
        "The webhook endpoints go offline.",
        "Events keep arriving, but your app and automation can’t receive them.",
      ];
    case "guard":
      return [
        "New webhooks take the protected route.",
        "Earlier requests finish their journey. New arrivals travel through Hookdeck.",
      ];
    case "draining":
      return [
        "Queued webhooks are delivered.",
        "Queued events move at a pace each destination can handle.",
      ];
    case "steady":
    case "complete":
      return [
        "Webhook delivery is protected.",
        "The queues are clear. Your app and automation receive events steadily.",
      ];
  }
}
