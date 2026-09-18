// @refresh reset
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  ArrowUpRight,
  PackageOpen,
  GitCompareArrows,
  PackageCheck,
  PackageX,
  CircleHelp,
  Focus,
  Pause,
  Play,
  Wrench,
  RotateCcw,
  Undo2,
  Square,
  ShoppingBag,
  Rocket,
  Tag,
  Flame,
  MessageCircle,
  Move,
  ZoomIn,
  ZoomOut,
  X,
} from "lucide-react";
import { Simulation, type Snapshot, type Source } from "./simulation";
import { present } from "./presentation";
import { TRAFFIC_EVENTS } from "./traffic";
import { DEMO_SECONDS, DEMO_TIMING, DEMO_TITLE, demoStory } from "./demo";
import {
  Town,
  AUTOMATIONS,
  AUTOMATION,
  constructionBusy,
  type Emergency,
  type Automation,
} from "./town";

import {
  Comparison,
  COMPARISON_SPEED,
  type ComparisonSnapshot,
} from "./comparison";
import { ComparisonPanel, SetupPanel } from "./ExperiencePanels";

import type { OpenParcel } from "./parcel";
import { NavButton } from "./NavButton";

const Scene = lazy(() => import("./Scene"));
const fmt = (n: number) => Math.round(n).toLocaleString("en-US");
const names = { shopify: "Shopify", stripe: "Stripe", whatsapp: "WhatsApp" };
const eventIcons = {
  "black-friday": ShoppingBag,
  "product-launch": Rocket,
  "flash-sale": Tag,
  "going-viral": Flame,
  "message-blast": MessageCircle,
};
const trafficEvents = TRAFFIC_EVENTS.map((event) => ({
  ...event,
  icon: eventIcons[event.id],
}));
function initialize() {
  const sim = new Simulation();
  const params = new URLSearchParams(location.search);
  sim.enabled = params.get("mode") === "protected";
  const source = params.get("source");
  if (source === "shopify" || source === "stripe" || source === "whatsapp")
    sim.spikeSource = source;
  const rate = Number(params.get("rate"));
  if (rate >= 20 && rate <= 150) sim.rate = Math.round(rate / 10) * 10;
  return sim;
}
function narrative(s: Snapshot) {
  const { health } = present(s);
  if (s.paused)
    return ["Delivery paused.", "Resume to continue webhook traffic."];
  if (health === "offline")
    return s.enabled
      ? [
          "Application in maintenance.",
          "Hookdeck buffers incoming webhooks until your app is back online.",
        ]
      : [
          "Application in maintenance.",
          "Incoming webhooks can’t be delivered while your app is offline.",
        ];
  if (health === "overloaded")
    return s.enabled
      ? ["Delivery exceeds capacity.", "Delivery is above your app’s capacity."]
      : [
          "Too many incoming webhooks.",
          "Add Hookdeck to queue the rush and control delivery.",
        ];
  if (s.enabled && s.waiting > 0)
    return [
      "Incoming webhooks are queued.",
      "Hookdeck delivers at a pace your app can handle.",
    ];
  if (s.enabled)
    return [
      "Webhook delivery is protected.",
      "Start a traffic spike to test delivery.",
    ];
  return [
    "Webhooks arrive directly.",
    "Start a traffic spike to test your app.",
  ];
}
export default function App() {
  const engine = useRef<Simulation | null>(null);
  if (!engine.current) engine.current = initialize();
  const sim = engine.current;
  const townRef = useRef<Town | null>(null);
  if (!townRef.current) townRef.current = new Town(sim);
  const town = townRef.current;
  const [t, setT] = useState(() => town.snapshot());
  const [sceneReady, setSceneReady] = useState(false);
  const onSceneReady = useCallback(() => setSceneReady(true), []);
  const isLobby = t.mode === "lobby";
  const isBuilding = constructionBusy(t);
  const interactive = t.mode === "playing";
  const [s, setS] = useState(() => sim.snapshot());
  const [reduceMotion, setReduceMotion] = useState(
    () => matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const [visible, setVisible] = useState(!document.hidden);
  const [panel, setPanel] = useState<"help" | "events" | "setup" | null>(null);
  const [selectedParcel, setSelectedParcel] = useState<OpenParcel | null>(null);
  const packageRef = useRef<OpenParcel | null>(null);
  const flowHeldRef = useRef(false);
  const [flowHeld, setFlowHeld] = useState(false);
  const flowRelease = useRef<number | undefined>(undefined);
  const onFlowHover = useCallback((held: boolean) => {
    window.clearTimeout(flowRelease.current);
    if (held) {
      flowHeldRef.current = true;
      setFlowHeld(true);
    } else {
      flowRelease.current = window.setTimeout(() => {
        flowHeldRef.current = false;
        setFlowHeld(false);
      }, 1000);
    }
  }, []);
  useEffect(() => () => window.clearTimeout(flowRelease.current), []);
  const [inspectRequest, setInspectRequest] = useState(0);
  const replayRef = useRef<Comparison | null>(null);
  const [replay, setReplay] = useState<ComparisonSnapshot | null>(null);
  const [replayView, setReplayView] = useState<"direct" | "protected">(
    "protected",
  );
  const lastEmergency = useRef<Emergency>("black-friday");
  const [run, setRun] = useState(0);
  const [cameraReset, setCameraReset] = useState(0);
  const [panCamera, setPanCamera] = useState(false);
  const [cameraZoom, setCameraZoom] = useState(0);
  const [choosingAutomation, setChoosingAutomation] = useState(false);
  const [announcement, announce] = useState("");
  const [eventIndex, setEventIndex] = useState(0);
  const [runningEvent, setRunningEvent] = useState<number | null>(null);
  const [eventHovered, setEventHovered] = useState(false);
  const [eventFocused, setEventFocused] = useState(false);
  const inSurge = s.inSurge;
  const demoActive = t.mode === "demo";
  const trafficEvent = trafficEvents[eventIndex];
  const EventIcon = trafficEvent.icon;
  const dialog = useRef<HTMLDialogElement>(null);
  const update = useCallback(
    (action: () => void) => {
      if (replayRef.current || packageRef.current) return;
      action();
      town.syncBranches();
      setS(sim.snapshot());
      setT(town.snapshot());
    },
    [sim, town],
  );
  useEffect(() => {
    const preference = matchMedia("(prefers-reduced-motion: reduce)");
    const updateMotion = () => setReduceMotion(preference.matches);
    updateMotion();
    preference.addEventListener("change", updateMotion);
    return () => preference.removeEventListener("change", updateMotion);
  }, []);
  // Keep the choice still while someone is using the control or a rush is live.
  useEffect(() => {
    if (t.demo.state === "complete")
      announce(
        "Your turn. The rescue is complete. Keep experimenting or try Hookdeck for free.",
      );
  }, [t.demo.state]);
  useEffect(() => {
    if (
      t.mode !== "playing" ||
      inSurge ||
      s.paused ||
      !visible ||
      panel ||
      reduceMotion ||
      eventHovered ||
      eventFocused
    )
      return;
    const timer = setInterval(() => {
      setEventIndex((index) => (index + 1) % trafficEvents.length);
    }, 2000);
    return () => clearInterval(timer);
  }, [
    t.mode,
    inSurge,
    s.paused,
    visible,
    panel,
    reduceMotion,
    eventHovered,
    eventFocused,
  ]);
  useEffect(() => {
    if (!inSurge && runningEvent !== null) {
      setEventIndex((runningEvent + 1) % trafficEvents.length);
      setRunningEvent(null);
    }
  }, [inSurge, runningEvent]);
  const surge = useCallback(
    (source?: Source) => {
      if (town.mode !== "playing") return;
      const stopping = !source && sim.inSurge;
      if (source) setRunningEvent(null);
      else if (!stopping) setRunningEvent(eventIndex);
      update(() => {
        sim.scenario = "spike";
        if (source) sim.toggleSpike(source);
        else if (stopping) sim.stopAllSpikes();
        else {
          lastEmergency.current = trafficEvents[eventIndex].id;
          sim.startEvent(trafficEvents[eventIndex].id);
        }
      });
      announce(
        source
          ? `${names[source]} ${sim.spikes[source] ? "surge incoming" : "back to normal"}`
          : stopping
            ? "Rush stopped. Traffic back to normal."
            : trafficEvents[eventIndex].description,
      );
    },
    [sim, town, update, eventIndex],
  );
  const toggleProvider = useCallback(
    (source: Source) => {
      update(() => town.toggleProvider(source));
      announce(
        `${names[source]} ${sim.sourceConnected[source] ? "attached" : "detached"}.`,
      );
    },
    [sim, town, update],
  );
  const power = useCallback(() => {
    if (town.mode === "demo") return;
    const crashed = sim.offlineReason === "overload";
    update(() => {
      sim.scenario = "downtime";
      sim.setOnline(!sim.online);
    });
    announce(
      sim.online
        ? crashed
          ? "App restarted."
          : "Maintenance complete. App back online."
        : "Maintenance started. App offline.",
    );
  }, [sim, town, update]);
  const protect = useCallback(() => {
    if (town.mode !== "playing") return;
    let restarted = 0;
    update(() => {
      if (sim.enabled) sim.disconnect();
      else restarted = town.deployGuard();
    });
    announce(
      sim.enabled
        ? restarted
          ? "Hookdeck online. Overloaded endpoints restarted in the simulation. New webhooks are buffered and paced."
          : "Hookdeck online. New events are buffered."
        : sim.waiting > 0
          ? "Queue held. New traffic goes directly to your app."
          : "Hookdeck off. Traffic goes directly to your app.",
    );
  }, [sim, town, update]);
  const exitDemo = useCallback(() => {
    update(() => town.explore());
    setRun((n) => n + 1);
    setRunningEvent(null);
    setEventIndex(0);
    announce("Demo ended. Test your app and automation with Hookdeck enabled.");
  }, [town, update]);
  const buildTown = useCallback(() => {
    update(() => town.build());
    setRun((n) => n + 1);
    setRunningEvent(null);
    setEventIndex(0);
    setPanel(null);
    setChoosingAutomation(false);
    announce(
      "Adding Shopify, Stripe, and WhatsApp. Choose an automation when you’re ready.",
    );
  }, [town, update]);
  const resetTown = useCallback(() => {
    update(() => town.reset());
    setRun((n) => n + 1);
    setRunningEvent(null);
    setEventIndex(0);
    setPanel(null);
    setChoosingAutomation(false);
    announce("Back to your app. Add third-party webhooks when you’re ready.");
  }, [town, update]);
  const addAutomation = useCallback(
    (id: Automation) => {
      update(() => town.addAutomation(id));
      setChoosingAutomation(false);
      announce(
        `Attaching ${AUTOMATION[id].name}. Choose a traffic spike when you’re ready.`,
      );
    },
    [town, update],
  );
  const undoStep = useCallback(() => {
    const label = town.snapshot().undoLabel;
    let restored = false;
    update(() => {
      restored = town.undo();
    });
    if (!restored) return;
    setRun((n) => n + 1);
    setChoosingAutomation(town.mode === "providers");
    setPanel(null);
    const index = Math.max(
      0,
      trafficEvents.findIndex((event) => event.id === sim.trafficEvent),
    );
    setEventIndex(index);
    setRunningEvent(sim.inSurge ? index : null);
    announce(
      `Undid ${label}.${town.mode === "providers" ? " Choose n8n, Zapier, or Make." : " Back to the previous step."}`,
    );
  }, [town, sim, update]);
  const startEmergency = useCallback(
    (event: Emergency) => {
      lastEmergency.current = event;
      update(() => town.startEmergency(event));
      const index = Math.max(
        0,
        trafficEvents.findIndex((item) => item.id === event),
      );
      setEventIndex(index);
      setRunningEvent(index);
      announce(
        "Traffic spike started. Deploy Hookdeck to protect webhook delivery to your app and automation.",
      );
    },
    [town, update],
  );
  const deployGuard = useCallback(() => {
    let restarted = 0;
    update(() => {
      restarted = town.deployGuard();
    });
    announce(
      restarted
        ? "Hookdeck deployed. Overloaded endpoints restarted in the simulation. Incoming webhooks are buffered and paced."
        : "Hookdeck deployed. Incoming webhooks are buffered and each destination receives at a controlled pace.",
    );
  }, [town, update]);
  const toggleAutomation = useCallback(
    (id: Automation) => {
      update(() => town.toggleEndpoint(id));
      const online = town.destinations[id].online;
      announce(
        `${AUTOMATION[id].name} webhook endpoint ${online ? "back online" : "offline"}.`,
      );
    },
    [town, update],
  );
  const startDemo = useCallback(() => {
    lastEmergency.current = "product-launch";
    update(() => town.startDemo());
    setRun((n) => n + 1);
    setRunningEvent(null);
    setPanel(null);
    setChoosingAutomation(false);
    announce(
      `${DEMO_SECONDS}-second rescue started. Watch webhook sources connect, traffic spike, and delivery recover with Hookdeck.`,
    );
  }, [town, update]);
  const closePackage = useCallback(() => {
    packageRef.current = null;
    setSelectedParcel(null);
    announce("Package returned to its connection.");
  }, []);
  const openPackage = useCallback(
    (selection: OpenParcel) => {
      if (replayRef.current || packageRef.current || town.mode === "demo")
        return;
      packageRef.current = selection;
      setSelectedParcel(selection);
      setPanel(null);
      announce(
        `Opened ${names[selection.parcel.route.source]} package. ${selection.parcel.title}.`,
      );
    },
    [town],
  );
  const inspect = useCallback(() => {
    setPanel(null);
    setInspectRequest((value) => value + 1);
  }, []);
  useEffect(() => {
    packageRef.current = null;
    setSelectedParcel(null);
  }, [run]);
  const startComparison = useCallback(() => {
    closePackage();
    setPanel(null);
    const comparison = new Comparison({
      event: lastEmergency.current,
      automation: town.automation,
      connected: { ...sim.sourceConnected },
      rate: sim.rate,
      appMaintenance: sim.offlineReason === "maintenance",
      automationMaintenance:
        !!town.automation &&
        town.destinations[town.automation].offlineReason === "maintenance",
    });
    replayRef.current = comparison;
    setReplayView("protected");
    setReplay(comparison.snapshot());
    setRun((n) => n + 1);
    announce(
      "Comparing identical traffic with and without Hookdeck. Your playground is saved.",
    );
  }, [sim, town, closePackage]);
  const closeComparison = useCallback(() => {
    replayRef.current = null;
    setReplay(null);
    setRun((n) => n + 1);
    announce("Back to your playground. Your previous run is preserved.");
  }, []);
  const closePanel = useCallback(() => setPanel(null), []);
  useEffect(() => {
    let last = performance.now();
    const timer = setInterval(() => {
      const now = performance.now(),
        elapsed = Math.min((now - last) / 1000, 0.2);
      last = now;
      if (replayRef.current) {
        if (!document.hidden && !panel)
          replayRef.current.step(elapsed * COMPARISON_SPEED);
        setReplay(replayRef.current.snapshot());
        return;
      }
      if (
        !document.hidden &&
        !sim.paused &&
        !packageRef.current &&
        !flowHeldRef.current &&
        town.mode !== "lobby" &&
        !(town.mode === "demo" && panel)
      ) {
        town.step(elapsed);
        setS(sim.snapshot());
        setT(town.snapshot());
      }
    }, 80);
    const visibility = () => {
      last = performance.now();
      setVisible(!document.hidden);
    };
    document.addEventListener("visibilitychange", visibility);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [sim, town, panel]);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (
        replayRef.current ||
        packageRef.current ||
        (town.mode !== "playing" && town.mode !== "demo") ||
        dialog.current?.open ||
        e.repeat ||
        e.ctrlKey ||
        e.metaKey ||
        e.altKey ||
        /INPUT|TEXTAREA|SELECT/.test((e.target as HTMLElement)?.tagName)
      )
        return;
      if (e.code === "Digit1" && town.mode === "playing") {
        e.preventDefault();
        surge();
      }
      if (e.code === "Digit2") {
        e.preventDefault();
        power();
      }
      if (e.code === "Digit3") {
        e.preventDefault();
        protect();
      }
      if (e.code === "Space" && e.target === document.body) {
        e.preventDefault();
        update(() => {
          sim.paused = !sim.paused;
        });
      }
    };
    addEventListener("keydown", handler);
    return () => removeEventListener("keydown", handler);
  }, [surge, power, protect, update, sim, town]);
  useEffect(() => {
    if (panel) dialog.current?.showModal();
    else dialog.current?.close();
  }, [panel]);
  const replayTown = replayRef.current?.[replayView];
  const shownSnapshot = replayTown ? replayTown.app.snapshot() : s;
  const shownTown = replay ? replay[replayView] : t;
  const state = present(s);
  const unavailable =
    t.automation && !t.destinations[t.automation].online ? t.automation : null;
  const offlineNames = [
    ...(!s.online ? ["Your app"] : []),
    ...(unavailable ? [AUTOMATION[unavailable].name] : []),
  ];
  const allCrashed =
    (!s.online ? s.offlineReason === "overload" : true) &&
    (unavailable
      ? t.destinations[unavailable].offlineReason === "overload"
      : true);
  const offlineTitle = `${offlineNames.join(" and ")} ${allCrashed ? "crashed" : offlineNames.length > 1 ? "are offline" : "is offline"}.`;
  const restartTarget =
    offlineNames.length > 1
      ? "each offline endpoint"
      : unavailable
        ? AUTOMATION[unavailable].name
        : "Your App";
  const guided = !interactive;
  const guidedTitle = isLobby
    ? "Start with your app."
    : t.mode === "providers"
      ? isBuilding
        ? "Connecting your providers."
        : choosingAutomation
          ? "Choose your automation."
          : "Webhook sources connected."
      : t.mode === "automations"
        ? isBuilding
          ? `Attaching ${t.automation ? AUTOMATION[t.automation].name : "your automation"}.`
          : "Choose a traffic spike."
        : !inSurge
          ? "Traffic is back to normal."
          : state.health === "overloaded"
            ? "Webhook traffic exceeds capacity."
            : "Webhook traffic is rising.";
  const guidedHint = isLobby
    ? "Add third-party webhook integrations when you’re ready."
    : t.mode === "providers"
      ? isBuilding
        ? "Orders. Payments. Messages."
        : choosingAutomation
          ? "Pick one: n8n, Zapier, or Make."
          : "Click a provider to attach or detach. Click Your App to take it offline."
      : t.mode === "automations"
        ? isBuilding
          ? "One event can reach your app and a workflow."
          : "See how your app and automation handle more incoming webhooks."
        : !inSurge
          ? "Try another event, or add Hookdeck before the next rush."
          : "Deploy Hookdeck to buffer new arrivals and pace every destination.";
  const [title, hint] = demoActive
    ? s.paused
      ? ["Rescue paused.", "Resume whenever you’re ready. Your place is saved."]
      : demoStory(t.demo.phase, AUTOMATION[t.automation ?? "n8n"].name)
    : s.paused
      ? narrative(s)
      : offlineNames.length > 0
        ? [
            offlineTitle,
            s.enabled
              ? `Hookdeck holds new events. Click ${restartTarget} to restart.`
              : allCrashed
                ? "Deploy Hookdeck to queue incoming webhooks and resume delivery."
                : `Click ${restartTarget} to bring it back online.`,
          ]
        : guided
          ? [guidedTitle, guidedHint]
          : s.enabled && s.flights.some((f) => f.leg === "direct")
            ? [
                "Traffic is switching to Hookdeck.",
                "Requests already on the direct route still reach your app.",
              ]
            : t.mode === "playing" &&
                s.enabled &&
                s.online &&
                state.health === "healthy"
              ? [
                  "Webhook delivery is protected.",
                  inSurge
                    ? "Hookdeck queues the rush and paces each destination."
                    : "Click providers to attach or detach. Click a destination to take it offline.",
                ]
              : narrative(s);
  const activeEvent = TRAFFIC_EVENTS.find(
    (event) => event.id === s.trafficEvent,
  );
  return (
    <div
      className={`app-shell ${s.enabled ? "protected" : ""} health-${state.health} ${reduceMotion ? "reduce-motion" : ""} town-${t.mode} ${guided ? "town-guided" : ""} ${selectedParcel ? "package-open" : ""} ${replay ? "replaying" : ""}`}
    >
      <header className="game-header" inert={!!selectedParcel}>
        <a
          className="brand"
          href="https://hookdeck.com"
          target="_blank"
          rel="noreferrer"
        >
          <img src="/logos/hookdeck.svg" alt="" />
          <span>hookdeck</span>
          <small>playground</small>
        </a>
        <div className="header-tools">
          {!isLobby && !replay && (
            <>
              <NavButton
                className="icon-button"
                aria-label={s.paused ? "Resume simulation" : "Pause simulation"}
                onClick={() =>
                  update(() => {
                    sim.paused = !sim.paused;
                  })
                }
              >
                {s.paused ? <Play /> : <Pause />}
              </NavButton>
              {t.undoLabel && (
                <NavButton
                  className="icon-button"
                  onClick={undoStep}
                  aria-label={`Undo ${t.undoLabel}`}
                  tooltip={`Undo ${t.undoLabel}`}
                >
                  <Undo2 />
                </NavButton>
              )}
              <NavButton
                className="icon-button"
                aria-label={demoActive ? "Restart rescue" : "Start over"}
                onClick={demoActive ? startDemo : resetTown}
              >
                <RotateCcw />
              </NavButton>
            </>
          )}
          {!isLobby && !demoActive && !replay && (
            <>
              <NavButton
                className="icon-button"
                aria-label="Open a package"
                tooltip="Open a webhook package"
                disabled={
                  isBuilding || !Object.values(s.sourceConnected).some(Boolean)
                }
                onClick={() => inspect()}
              >
                <PackageOpen />
              </NavButton>
              {(interactive || t.mode === "emergency") && (
                <NavButton
                  className="icon-button"
                  aria-label="Replay the same spike with and without Hookdeck"
                  tooltip="Compare the same traffic"
                  onClick={startComparison}
                >
                  <GitCompareArrows />
                </NavButton>
              )}
            </>
          )}
          <NavButton
            className="icon-button"
            aria-pressed={panCamera}
            aria-label="Pan scene"
            tooltip={
              panCamera
                ? "Switch back to rotating the scene"
                : "Drag to move the scene"
            }
            onClick={() => setPanCamera((value) => !value)}
          >
            <Move />
          </NavButton>
          <NavButton
            className="icon-button"
            aria-label="Zoom in"
            tooltip="Zoom in (or pinch)"
            onClick={() => setCameraZoom((value) => value + 1)}
          >
            <ZoomIn />
          </NavButton>
          <NavButton
            className="icon-button"
            aria-label="Zoom out"
            tooltip="Zoom out (or pinch)"
            onClick={() => setCameraZoom((value) => value - 1)}
          >
            <ZoomOut />
          </NavButton>
          <NavButton
            className="icon-button"
            aria-label="Reset camera view"
            tooltip="Fit computers in view"
            onClick={() => setCameraReset((n) => n + 1)}
          >
            <Focus />
          </NavButton>
          <NavButton
            className="icon-button"
            aria-label="How to play"
            onClick={() => setPanel("help")}
          >
            <CircleHelp />
          </NavButton>
          <NavButton
            className="demo-launch"
            disabled={!sceneReady || !!replay}
            onClick={demoActive ? exitDemo : startDemo}
            aria-label={
              demoActive
                ? "Exit rescue and explore the webhook playground"
                : DEMO_TITLE
            }
            tooltip={
              demoActive
                ? "Return to the manual playground"
                : "See Hookdeck rescue your app from a webhook spike"
            }
          >
            <span className="demo-launch-label">
              {demoActive ? "Back to playground" : DEMO_TITLE}
            </span>
          </NavButton>
        </div>
      </header>
      <main className="game-world">
        <div className="game-story" inert={!!selectedParcel}>
          <div
            className="story-copy"
            key={demoActive ? t.demo.phase : guided ? t.mode : "play"}
          >
            <h1 aria-live="polite">{title}</h1>
            <p>
              {interactive &&
              !s.enabled &&
              !unavailable &&
              activeEvent &&
              state.health === "healthy" &&
              !s.paused
                ? `${activeEvent.name} · ${activeEvent.description}`
                : hint}
            </p>
          </div>
          {(demoActive || t.demo.state === "complete") && (
            <div className="demo-time">
              <span>
                {demoActive
                  ? s.paused
                    ? "Rescue paused"
                    : "Rescue in progress"
                  : "Your turn"}
              </span>
              {demoActive && (
                <>
                  <div
                    role="progressbar"
                    aria-label={`${DEMO_SECONDS}-second rescue progress`}
                    aria-valuemin={0}
                    aria-valuemax={DEMO_SECONDS}
                    aria-valuenow={Math.floor(t.demo.elapsed)}
                    aria-valuetext={`${Math.floor(t.demo.elapsed)} of ${DEMO_SECONDS} seconds`}
                  >
                    <i
                      style={{
                        transform: `scaleX(${t.demo.elapsed / DEMO_SECONDS})`,
                      }}
                    />
                  </div>
                  <span className="demo-clock">
                    {Math.floor(t.demo.elapsed)} / {DEMO_SECONDS}s
                  </span>
                </>
              )}
            </div>
          )}
        </div>
        {(interactive ||
          t.mode === "emergency" ||
          (demoActive && t.demo.elapsed >= DEMO_TIMING.launch)) && (
          <div
            className="scoreboard"
            aria-label="Delivery counters"
            inert={!!selectedParcel}
          >
            <button
              onClick={() => setPanel("events")}
              aria-label={`${fmt(t.delivered)} successful webhook deliveries. Open event log.`}
            >
              <PackageCheck />
              <span>
                <b>{fmt(t.delivered)}</b>
                <small>delivered</small>
              </span>
            </button>
            <span className="score-divider" />
            <button
              className={t.lost ? "has-failures" : ""}
              onClick={() => setPanel("events")}
              aria-label={`${fmt(t.lost)} failed webhook deliveries. Open event log.`}
            >
              <PackageX />
              <span>
                <b>{fmt(t.lost)}</b>
                <small>failed</small>
              </span>
            </button>
          </div>
        )}
        <div
          className="world-canvas"
          aria-label="Interactive 3D webhook playground"
        >
          <Suspense
            fallback={
              <div className="world-fallback">
                Loading the webhook playground…
              </div>
            }
          >
            <Scene
              onFlowHover={onFlowHover}
              playbackSpeed={replay ? COMPARISON_SPEED : 1}
              snapshot={{
                ...shownSnapshot,
                paused: replay
                  ? replay.paused || replay.complete || !visible || !!panel
                  : s.paused ||
                    flowHeld ||
                    !!selectedParcel ||
                    !visible ||
                    (demoActive && !!panel),
              }}
              town={shownTown}
              onAutomation={replay ? () => {} : toggleAutomation}
              onReady={onSceneReady}
              reduceMotion={reduceMotion}
              run={run + (replayView === "direct" && replay ? 100000 : 0)}
              cameraReset={cameraReset}
              cameraZoom={cameraZoom}
              panCamera={panCamera}
              onProvider={replay ? () => {} : toggleProvider}
              onPower={replay ? () => {} : power}
              onInspect={openPackage}
              selectedParcel={selectedParcel}
              inspectRequest={inspectRequest}
              onClosePackage={closePackage}
              readOnly={!!replay}
            />
          </Suspense>
        </div>
        {replay && (
          <>
            <div className="replay-scene-label">
              <span>COMPARISON REPLAY</span>
              <h1>
                {replayView === "protected"
                  ? "Paced by Hookdeck."
                  : "Straight to your endpoint."}
              </h1>
              <p>
                {replayView === "protected"
                  ? "Incoming traffic waits for a delivery slot."
                  : "Every arrival reaches the endpoint immediately."}
              </p>
            </div>
            <ComparisonPanel
              snapshot={replay}
              selected={replayView}
              eventName={
                trafficEvents.find(
                  (event) => event.id === replayRef.current?.config.event,
                )?.name ?? "Webhook storm"
              }
              onSelect={setReplayView}
              onClose={closeComparison}
              onPause={() => {
                if (replayRef.current) {
                  replayRef.current.paused = !replayRef.current.paused;
                  setReplay(replayRef.current.snapshot());
                }
              }}
              onRestart={() => {
                if (replayRef.current) {
                  replayRef.current = new Comparison(replayRef.current.config);
                  setReplay(replayRef.current.snapshot());
                  setRun((n) => n + 1);
                }
              }}
            />
          </>
        )}
        <div
          className="sr-only"
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          {announcement}
        </div>
        {guided && !demoActive && (
          <section
            inert={!!selectedParcel}
            className={`town-actions ${t.mode === "emergency" ? "emergency-actions" : ""}`}
            aria-label="Set up webhook delivery"
          >
            {isLobby && (
              <button
                className="game-key hookdeck-key town-build"
                disabled={!sceneReady}
                onClick={buildTown}
              >
                <span className="key-cap">
                  <b>
                    {sceneReady
                      ? "Add third-party webhooks"
                      : "Preparing your app…"}
                  </b>
                </span>
              </button>
            )}
            {t.mode === "providers" && !choosingAutomation && (
              <button
                className="game-key attach-key town-build"
                disabled={isBuilding}
                onClick={() => setChoosingAutomation(true)}
              >
                <span className="key-cap">
                  <b>
                    {isBuilding ? "Connecting providers…" : "Add automation"}
                  </b>
                </span>
              </button>
            )}
            {t.mode === "providers" && choosingAutomation && (
              <div
                className="automation-picker"
                aria-label="Choose one automation"
              >
                <div className="automation-choices">
                  {AUTOMATIONS.map((id) => (
                    <button
                      key={id}
                      className={`game-key automation-choice choice-${id}`}
                      onClick={() => addAutomation(id)}
                      aria-label={`Add ${AUTOMATION[id].name}`}
                    >
                      <span className="key-cap">
                        <img src={`/logos/${id}.svg`} alt="" />
                        <b>{AUTOMATION[id].name}</b>
                      </span>
                    </button>
                  ))}
                </div>
                <button
                  className="choice-cancel"
                  onClick={() => setChoosingAutomation(false)}
                >
                  Cancel
                </button>
              </div>
            )}
            {t.mode === "automations" && isBuilding && t.automation && (
              <span className="construction-status" role="status">
                Attaching {AUTOMATION[t.automation].name}…
              </span>
            )}
            {((t.mode === "automations" && !isBuilding) ||
              (t.mode === "emergency" && !inSurge)) && (
              <div
                className="emergency-options"
                aria-label="Choose a traffic emergency"
              >
                <button
                  className="game-key surge-key"
                  onClick={() => startEmergency("black-friday")}
                >
                  <span className="key-cap">
                    <b>Black Friday</b>
                  </span>
                </button>
                <button
                  className="game-key surge-key"
                  onClick={() => startEmergency("product-launch")}
                >
                  <span className="key-cap">
                    <b>Product launch</b>
                  </span>
                </button>
                <button
                  className="game-key storm-key"
                  onClick={() => startEmergency("storm")}
                >
                  <span className="key-cap">
                    <b>Webhook storm</b>
                  </span>
                </button>
              </div>
            )}
            {t.mode === "emergency" && (
              <button
                className="game-key hookdeck-key town-build"
                onClick={deployGuard}
              >
                <span className="key-cap">
                  <img src="/logos/hookdeck.svg" alt="" />
                  <b>Deploy Hookdeck</b>
                </span>
              </button>
            )}
          </section>
        )}
        {interactive && (
          <section
            className="controller"
            aria-label="Webhook controls"
            inert={!!selectedParcel}
          >
            <button
              className={`game-key surge-key ${inSurge ? "active" : ""}`}
              onClick={() => surge()}
              aria-label={
                inSurge
                  ? "Stop traffic surge from all senders"
                  : `Start ${trafficEvent.name} event`
              }
              aria-pressed={inSurge}
              title={
                inSurge
                  ? "Stop the rush and return to normal traffic"
                  : trafficEvent.description
              }
              onPointerEnter={() => setEventHovered(true)}
              onPointerLeave={() => setEventHovered(false)}
              onFocus={() => setEventFocused(true)}
              onBlur={() => setEventFocused(false)}
            >
              <span className="key-cap">
                {inSurge ? <Square /> : <EventIcon />}
                <b
                  key={inSurge ? "stop" : trafficEvent.name}
                  className="event-key-label"
                >
                  {inSurge ? "Stop rush" : trafficEvent.name}
                </b>
              </span>
            </button>
            <button
              className={`game-key power-key ${!s.online ? "restore" : ""}`}
              onClick={power}
              aria-label={
                s.offlineReason === "overload"
                  ? "Restart app"
                  : s.online
                    ? "Start maintenance"
                    : "End maintenance"
              }
            >
              <span className="key-cap">
                <Wrench />
                <b>
                  {s.offlineReason === "overload" ? (
                    "Restart app"
                  ) : (
                    <>
                      <span>{s.online ? "Start" : "End"}</span> maintenance
                    </>
                  )}
                </b>
              </span>
            </button>
            <button
              className={`game-key hookdeck-key ${s.enabled ? "engaged" : ""}`}
              onClick={protect}
              aria-pressed={s.enabled}
              aria-label={s.enabled ? "Turn off Hookdeck" : "Deploy Hookdeck"}
            >
              <span className="key-cap">
                <img src="/logos/hookdeck.svg" alt="" />
                <b>{s.enabled ? "Turn off Hookdeck" : "Deploy Hookdeck"}</b>
              </span>
            </button>
          </section>
        )}
        {t.mode === "playing" && (
          <button
            className="town-cta"
            inert={!!selectedParcel}
            onClick={() => setPanel("setup")}
          >
            {t.automation
              ? `Protect my ${AUTOMATION[t.automation].name} webhooks`
              : "Protect my application"}{" "}
            <ArrowUpRight size={14} />
          </button>
        )}
      </main>
      <dialog
        ref={dialog}
        onCancel={closePanel}
        onClick={(e) => {
          if (e.target === dialog.current) closePanel();
        }}
      >
        <div className="dialog-content">
          <button
            className="icon-button close-dialog"
            aria-label="Close panel"
            onClick={closePanel}
          >
            <X />
          </button>
          {panel === "setup" && <SetupPanel automation={t.automation} />}
          {panel === "help" && (
            <>
              <span className="eyebrow">PLAYGROUND GUIDE</span>
              <h2>
                Test your webhooks.
                <br />
                <em>Control delivery.</em>
              </h2>
              <p className="dialog-note">
                Connect Shopify, Stripe, and WhatsApp to your app. Add an n8n,
                Zapier, or Make automation, then start a traffic spike and
                deploy Hookdeck. Each step waits for your click. “{DEMO_TITLE}”
                runs the full demo in {DEMO_SECONDS} seconds, then lets you
                continue testing webhook delivery yourself.
              </p>
              <ol className="guide">
                <li>
                  <b>1</b>
                  <div>
                    Start a traffic spike
                    <span>
                      Pick a moment: shopping surges, launch ramps, or WhatsApp
                      waves. It stops after one minute, or sooner with Stop
                      rush. Click a provider to attach or detach its traffic.
                      Bright screens and colored lighting show which senders are
                      sending more events. An endpoint shakes under overload,
                      then goes offline if the load stays too high. In this
                      simulation, deploying Hookdeck also restarts overloaded
                      endpoints so you can see delivery resume.
                    </span>
                  </div>
                </li>
                <li>
                  <b>2</b>
                  <div>
                    Start maintenance
                    <span>
                      Take your app offline for maintenance. Events keep
                      arriving; end maintenance to bring it back online.
                    </span>
                  </div>
                </li>
                <li>
                  <b>3</b>
                  <div>
                    Deploy Hookdeck
                    <span>
                      Buffer new events, pace delivery, and retry failures.
                    </span>
                  </div>
                </li>
              </ol>
              <p className="dialog-note">
                Hover a connection to hold its packages still. Click a package
                to lift it off the path and open its contents. Close it to
                return the same package and resume traffic. Open a package in
                the toolbar also works with a keyboard. Compare the same traffic
                from the event log to watch two fresh runs with identical
                conditions. Click a provider to attach or detach it. Use the
                Hookdeck control button to deploy or remove it. Click your app
                to start or end maintenance. Click n8n, Zapier, or Make to pause
                its webhook endpoint independently. Drag to rotate the view, or
                right-drag to move the scene. Scroll, pinch, or use the zoom
                buttons to zoom. Turn on Pan scene in the toolbar to move with a
                normal drag. Reset camera view brings the full setup back into
                view.
              </p>
              <details>
                <summary>About this simulation</summary>
                <p>
                  Synthetic traffic runs at 2× speed. Output and load measure
                  the last simulated second of delivery attempts. Each package
                  represents a group of events. Automation deliveries are routed
                  copies, with independent queues. Their lights show webhook
                  acceptance, not completion of the workflow inside the service.
                  Hookdeck’s demo delivery limit defaults to 80/s. Failed
                  attempts retry seven times with increasing delays capped at 60
                  simulated seconds. The FAILED counter counts unsuccessful
                  events, not retry attempts. Direct delivery has no durable
                  queue here; real providers may retry. Deploying protects
                  future traffic, without undoing earlier failures. Removing
                  Hookdeck holds its existing queue and sends new arrivals
                  directly to your app. Redeploying resumes the queue. This is
                  an illustrative model, not a product benchmark, retention
                  guarantee, or promise of event ordering.
                </p>
              </details>
            </>
          )}
          {panel === "events" && (
            <>
              <span className="eyebrow">EVENT LOG</span>
              <h2>Webhook deliveries.</h2>
              {!demoActive && (
                <div className="log-experiments">
                  <button
                    className="experience-primary"
                    disabled={!Object.values(s.sourceConnected).some(Boolean)}
                    onClick={() => inspect()}
                  >
                    Open a package
                  </button>
                  {(interactive || t.mode === "emergency") && (
                    <button
                      className="experience-secondary"
                      onClick={startComparison}
                    >
                      Replay this spike with protection
                    </button>
                  )}
                </div>
              )}
              <div className="log-totals">
                <span>{fmt(t.received)} delivery copies</span>
                <span>
                  {fmt(
                    s.failedAttempts +
                      AUTOMATIONS.reduce(
                        (n, id) => n + t.destinations[id].failedAttempts,
                        0,
                      ),
                  )}{" "}
                  failed attempts
                </span>
              </div>
              <p className="setting-hint">
                {fmt(t.delivered)} delivered + {fmt(t.waiting)} buffered +{" "}
                {fmt(t.delivering)} on the way + {fmt(t.lost)} failed ={" "}
                {fmt(t.received)} delivery copies.
              </p>
              {t.automation && (
                <div className="destination-ledger">
                  <div className="ledger-labels">
                    <span>Destination</span>
                    <span>Delivered</span>
                    <span>Waiting</span>
                  </div>
                  {[
                    { name: "Your app", snapshot: s },
                    ...(t.automation ? [t.automation] : []).map((id) => ({
                      name: AUTOMATION[id].name,
                      snapshot: t.destinations[id],
                    })),
                  ].map(({ name, snapshot }) => (
                    <div key={name}>
                      <span>
                        {name}
                        {!snapshot.online && <small>Offline</small>}
                      </span>
                      <b>{fmt(snapshot.delivered)}</b>
                      <b>
                        {snapshot.waiting > 50000
                          ? "50k+"
                          : fmt(snapshot.waiting)}
                      </b>
                    </div>
                  ))}
                </div>
              )}
              <div className="event-log">
                {s.recent.slice(0, 6).map((e) => (
                  <div key={e.id}>
                    <i className={e.source} />
                    <span>
                      {e.title}
                      <small>
                        {names[e.source]} · attempt {e.attempts}
                      </small>
                    </span>
                    <b className={e.status}>{e.status}</b>
                  </div>
                ))}
              </div>
              <p className="dialog-note">
                Sample app attempts. Delivery totals include copies sent to each
                destination.
              </p>
            </>
          )}
        </div>
      </dialog>
      <span
        className="sr-only"
        data-testid="simulation-state"
        data-mode={s.enabled ? "protected" : "direct"}
        data-health={state.health}
        data-delivered={s.delivered}
        data-delivering={s.delivering}
        data-clock={s.clock}
        data-waiting={s.waiting}
        data-failed={s.unsuccessful}
        data-online={s.online}
        data-offline-reason={s.offlineReason ?? ""}
        data-overload-progress={s.overloadProgress}
        data-source={s.spikeSource}
        data-output={state.outputRate}
        data-demo={t.demo.state}
        data-demo-phase={t.demo.phase}
        data-demo-elapsed={t.demo.elapsed}
        data-event={s.trafficEvent ?? ""}
        data-town={t.mode}
        data-automation={t.automation ?? "none"}
        data-connected-providers={Object.entries(s.sourceConnected)
          .filter(([, connected]) => connected)
          .map(([source]) => source)
          .join(",")}
        data-town-elapsed={t.elapsed.toFixed(2)}
        data-town-waiting={t.waiting}
        data-town-lost={t.lost}
        data-n8n-online={t.destinations.n8n.online}
        data-n8n-waiting={t.destinations.n8n.waiting}
        data-zapier-delivered={t.destinations.zapier.delivered}
      />
    </div>
  );
}
