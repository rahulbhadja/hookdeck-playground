import { Simulation, type Source } from "./simulation";
import { Town, AUTOMATION, type Automation, type Emergency } from "./town";

export const COMPARISON_SECONDS = 60;
export const COMPARISON_SPEED = 4;
export type ComparisonConfig = {
  event: Emergency;
  automation: Automation | null;
  connected: Record<Source, boolean>;
  rate: number;
  appMaintenance: boolean;
  automationMaintenance: boolean;
};

/** Two fresh, deterministic runs. Nothing from the player's live run is reset.
 * Both start healthy (except deliberate maintenance), with identical traffic,
 * receiver capacity and observation windows. Only buffering/pacing differs.
 */
export class Comparison {
  readonly direct: Town;
  readonly protected: Town;
  elapsed = 0;
  paused = false;
  private pending = 0;
  readonly config: ComparisonConfig;
  constructor(config: ComparisonConfig) {
    this.config = structuredClone(config);
    const create = (protectedMode: boolean) => {
      const town = new Town(new Simulation());
      town.explore(config.automation);
      town.app.sourceConnected = { ...config.connected };
      town.app.rate = config.rate;
      if (!protectedMode) town.app.disconnect();
      if (config.event === "storm") town.app.startAllSpikes();
      else town.app.startEvent(config.event);
      if (config.appMaintenance) town.app.setOnline(false);
      if (config.automation) {
        town.destinations[config.automation].rate =
          AUTOMATION[config.automation].rate;
        if (config.automationMaintenance)
          town.destinations[config.automation].setOnline(false);
      }
      town.syncBranches();
      return town;
    };
    this.direct = create(false);
    this.protected = create(true);
  }
  get complete() {
    return this.elapsed >= COMPARISON_SECONDS - 1e-8;
  }
  step(seconds: number) {
    if (this.paused || this.complete) return;
    this.pending += Math.max(0, seconds);
    while (this.pending >= 0.05 - 1e-8 && !this.complete) {
      this.direct.step(0.05);
      this.protected.step(0.05);
      this.elapsed = Math.min(COMPARISON_SECONDS, this.elapsed + 0.05);
      this.pending = Math.max(0, this.pending - 0.05);
    }
  }
  snapshot() {
    return {
      elapsed: this.elapsed,
      complete: this.complete,
      paused: this.paused,
      direct: this.direct.snapshot(),
      protected: this.protected.snapshot(),
    };
  }
}
export type ComparisonSnapshot = ReturnType<Comparison["snapshot"]>;
