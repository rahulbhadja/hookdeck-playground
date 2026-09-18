import { APP_CAPACITY, type Snapshot } from "./simulation";

/** Measured rates keep the HUD, building expression, meter, and trails in sync. */
export function present(s: Snapshot) {
  const dispatchRate = s.attemptRate;
  const health = !s.online
    ? "offline"
    : dispatchRate > APP_CAPACITY
      ? "overloaded"
      : "healthy";
  const outputRate = s.online ? s.deliveryRate : 0;
  return {
    health,
    dispatchRate,
    outputRate,
    load: s.online ? dispatchRate / APP_CAPACITY : 0,
  } as const;
}
