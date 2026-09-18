import type { Source } from "./simulation";

// Active-play seconds. Both the simulation and the scene use these journeys.
export const INGRESS_SECONDS = 3;
export const DELIVERY_SECONDS = 2;
export const ARRIVAL_EFFECT_SECONDS = 0.35;
export type FlightLeg = "direct" | "intake" | "delivery";
export type Flight = {
  id: number;
  source: Source;
  count: number;
  attempt: number;
  createdAt: number;
  departedAt: number;
  arrivesAt: number;
  leg: FlightLeg;
  visible: boolean;
  trace?: { id: number; offset: number };
};
export type FlightOutcome = Flight & { settledAt: number; failed: number };
