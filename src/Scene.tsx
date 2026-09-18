import {
  Component,
  Suspense,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type ComponentRef,
} from "react";
import {
  Canvas,
  useFrame,
  useThree,
  type ThreeEvent,
} from "@react-three/fiber";
import { Html, OrbitControls, SoftShadows } from "@react-three/drei";
import { Solid as Box, StudioReflections } from "./Architecture";
import { Laptop, HookdeckComputer } from "./ComputerHardware";
import * as THREE from "three";
import { TIME_SCALE, type Snapshot, type Source } from "./simulation";
import { present } from "./presentation";
import { BRAND } from "./brands";
import { BuildingLighting } from "./BuildingLighting";
import {
  AUTOMATIONS,
  AUTOMATION,
  ARRIVAL,
  visibleAt,
  type Automation,
  type TownSnapshot,
} from "./town";

import {
  createParcel,
  ParcelHover,
  type Parcel,
  type ParcelRoute,
  type OpenParcel,
} from "./parcel";
import { PackageOpening } from "./PackageOpening";
import {
  ARRIVAL_EFFECT_SECONDS,
  type Flight,
  type FlightOutcome,
} from "./transit";

type Vec = [number, number, number];
type Props = {
  snapshot: Snapshot;
  town: TownSnapshot;
  onAutomation: (id: Automation) => void;
  onReady: () => void;
  reduceMotion: boolean;
  run: number;
  cameraReset: number;
  cameraZoom: number;
  panCamera: boolean;
  onProvider: (source: Source) => void;
  onPower: () => void;
  onInspect: (selection: OpenParcel) => void;
  selectedParcel: OpenParcel | null;
  inspectRequest: number;
  onClosePackage: () => void;
  onFlowHover: (held: boolean) => void;
  playbackSpeed: number;
  readOnly: boolean;
};
const C = {
  shopify: BRAND.shopify.primary,
  stripe: BRAND.stripe.primary,
  whatsapp: BRAND.whatsapp.primary,
  hookdeck: BRAND.hookdeck.primary,
  app: "#F2B672",
  red: "#FA6E6E",
};
const sources: Source[] = ["shopify", "stripe", "whatsapp"];
// Generous space between physical computers keeps the parcel routes readable.
const positions: Vec[] = [
  [-13.5, 0, 10.5],
  [-15, 0, 0],
  [-13.5, 0, -10.5],
];
const appPosition: Vec = [13.5, 0, 2];
const automationPositions: Record<Automation, Vec> = {
  n8n: [11.5, 0, -10.5],
  zapier: [11.5, 0, -10.5],
  make: [11.5, 0, -10.5],
};
type TownLayout = {
  providers: Vec[];
  app: Vec;
  automations: Record<Automation, Vec>;
};
const desktopLayout: TownLayout = {
  providers: positions,
  app: appPosition,
  automations: automationPositions,
};
const phoneLayout: TownLayout = {
  providers: [
    [-8.8, 0, 11],
    [-10, 0, 0],
    [-8.8, 0, -11],
  ],
  app: [9.5, 0, 4.8],
  automations: {
    n8n: [8.5, 0, -9.8],
    zapier: [8.5, 0, -9.8],
    make: [8.5, 0, -9.8],
  },
};
const appScale = 1.08;
const gatewayScale = 1.15;
const appDock = 2.25 * appScale;
const initialCamera = {
  position: [8, 12, 20] as Vec,
  fov: 42,
  near: 0.1,
  far: 240,
};
const unit = new THREE.Object3D();
// The world group is at -0.4 and its ground surface is another -0.4 below it.
const gatewayGround = [new THREE.Plane(new THREE.Vector3(0, 1, 0), 0.8)];
const parcelBody = new THREE.BoxGeometry(0.39, 0.34, 0.41);
const parcelLid = new THREE.BoxGeometry(0.415, 0.055, 0.435).translate(
  0,
  0.186,
  0,
);
const parcelTape = new THREE.BoxGeometry(0.075, 0.395, 0.444).translate(
  0,
  0.015,
  0,
);
const directionMark = new THREE.ShapeGeometry(
  new THREE.Shape()
    .moveTo(-0.15, 0.08)
    .lineTo(0, -0.08)
    .lineTo(0.15, 0.08)
    .lineTo(0.15, 0.15)
    .lineTo(0, -0.01)
    .lineTo(-0.15, 0.15)
    .closePath(),
);

function Base({
  color,
  width = 2.9,
  depth = 2.75,
}: {
  color: string;
  width?: number;
  depth?: number;
}) {
  return (
    <group>
      <Box
        at={[0, -0.18, 0]}
        size={[width, 0.4, depth]}
        color="#424a53"
        rough={0.88}
        metal={0}
        round={0.035}
      />
      <Box
        at={[0, 0.045, 0]}
        size={[width - 0.13, 0.07, depth - 0.13]}
        color="#758089"
        rough={0.85}
        metal={0}
        round={0.018}
      />
      <Box
        at={[0, -0.07, depth / 2 + 0.003]}
        size={[width - 0.4, 0.045, 0.025]}
        color={color}
        glow={0.05}
        lighting="accent"
        round={0}
      />
      <Box
        at={[width / 2 + 0.002, -0.07, 0]}
        size={[0.025, 0.045, depth - 0.4]}
        color={color}
        glow={0.05}
        lighting="accent"
        round={0}
      />
      {[-1, 1].flatMap((x) =>
        [-1, 1].map((z) => (
          <Box
            key={`${x}${z}`}
            at={[x * (width / 2 - 0.2), 0.11, z * (depth / 2 - 0.2)]}
            size={[0.075, 0.055, 0.075]}
            color={color}
            glow={0.1}
            lighting="accent"
            round={0}
          />
        )),
      )}
    </group>
  );
}
function Provider({
  source,
  position,
  snapshot,
  reduceMotion,
  onClick,
  interactive = true,
  showLabel = true,
}: {
  source: Source;
  position: Vec;
  snapshot: Snapshot;
  reduceMotion: boolean;
  onClick: () => void;
  interactive?: boolean;
  showLabel?: boolean;
}) {
  const [hovered, setHovered] = useState(false);
  const lift = useRef<THREE.Group>(null);
  const invalidate = useThree((s) => s.invalidate);
  const connected = snapshot.sourceConnected[source];
  const active = connected && snapshot.spikes[source];
  const name =
    source === "shopify"
      ? "Shopify"
      : source === "stripe"
        ? "Stripe"
        : "WhatsApp";
  useFrame((_, dt) => {
    if (!lift.current) return;
    const target = hovered ? 0.1 : 0;
    lift.current.position.y = reduceMotion
      ? 0
      : THREE.MathUtils.damp(
          lift.current.position.y,
          target,
          10,
          Math.min(dt, 0.05),
        );
    if (!reduceMotion && Math.abs(lift.current.position.y - target) > 0.001)
      invalidate();
  });
  return (
    <group position={position}>
      <group
        ref={lift}
        onClick={(e) => {
          e.stopPropagation();
          if (interactive && e.delta < 5) onClick();
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHovered(interactive);
          document.body.style.cursor = interactive ? "pointer" : "";
        }}
        onPointerOut={() => {
          setHovered(false);
          document.body.style.cursor = "";
        }}
      >
        <BuildingLighting
          color={C[source]}
          mode={!connected ? "offline" : active ? "active" : "idle"}
          activity={Math.min(1, snapshot.sourceRates[source] / 380)}
          reduceMotion={reduceMotion}
          facadeZ={1.6}
          size={7.5}
        >
          <Base color={C[source]} width={4.5} depth={3.8} />
          <Laptop
            brand={source}
            color={C[source]}
            state={!connected ? "disconnected" : active ? "busy" : "online"}
            role="EVENT SOURCE"
            paused={snapshot.paused}
            reduceMotion={reduceMotion}
            onClick={onClick}
            ariaLabel={`${connected ? "Detach" : "Attach"} ${name}`}
            interactive={interactive}
            showControl={showLabel}
          />
        </BuildingLighting>
      </group>
    </group>
  );
}
function Gateway({
  snapshot,
  reduceMotion,
  reset,
  cinematic,
}: {
  snapshot: Snapshot;
  reduceMotion: boolean;
  reset: number;
  cinematic: boolean;
}) {
  const building = useRef<THREE.Group>(null);
  // Keep the model resident so deploying never constructs geometry on click.
  // The console sits below the clipping plane while the gateway is parked.
  const buriedY = -5.82 * gatewayScale;
  const startPosition = useRef<Vec>([0, buriedY, 0]);
  const deployment = useRef(0);
  const warmed = useRef(false);
  const invalidate = useThree((state) => state.invalidate);
  const enabled =
    snapshot.enabled || snapshot.flights.some((f) => f.leg !== "direct");
  const color = C.hookdeck;
  useLayoutEffect(() => {
    deployment.current = 0;
    if (building.current) building.current.position.y = buriedY;
  }, [reset, buriedY]);
  useLayoutEffect(() => {
    building.current?.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      const materials = Array.isArray(object.material)
        ? object.material
        : [object.material];
      materials.forEach((material) => {
        material.clippingPlanes = gatewayGround;
        material.clipShadows = true;
        material.needsUpdate = true;
      });
    });
  }, []);
  useFrame((_, dt) => {
    if (!building.current) return;
    const target = enabled ? 1 : 0;
    if (deployment.current !== target) {
      deployment.current = reduceMotion
        ? target
        : THREE.MathUtils.clamp(
            deployment.current +
              Math.min(dt, 0.05) *
                (enabled ? 1 / (cinematic ? 1.1 : 0.55) : -1 / 0.45),
            0,
            1,
          );
      building.current.position.y = buriedY * (1 - deployment.current) ** 3;
      if (deployment.current !== target) invalidate();
    }
    // Render one fully clipped frame at startup to warm the materials. Parked
    // models then skip rendering and raycasting, but retain their GPU resources.
    building.current.visible = !warmed.current || deployment.current > 0;
    if (!warmed.current) {
      warmed.current = true;
      invalidate();
    }
  });
  return (
    <group position={[0, 0, 0]}>
      <group
        ref={building}
        position={startPosition.current}
        scale={gatewayScale}
        raycast={() => (enabled ? undefined : false)}
      >
        <BuildingLighting
          color={color}
          mode={enabled ? "active" : "offline"}
          reduceMotion={reduceMotion}
          size={9}
          facadeZ={2.7}
        >
          <Base color={color} width={5.4} depth={4.3} />
          <HookdeckComputer
            state={enabled ? "online" : "offline"}
            paused={snapshot.paused}
            reduceMotion={reduceMotion}
          />
          <Box
            at={[0, 0.15, 2.9]}
            size={[3.3, 0.18, 1.7]}
            color="#152439"
            metal={0.5}
            round={0.06}
          />
          <group position={[0, -0.12, 2.9]}>
            <QueuePackages snapshot={snapshot} reduceMotion={reduceMotion} />
          </group>
        </BuildingLighting>
      </group>
    </group>
  );
}
function AppBuilding({
  snapshot,
  position,
  reduceMotion,
  onClick,
  interactive = true,
  showLabel = true,
}: {
  snapshot: Snapshot;
  position: Vec;
  reduceMotion: boolean;
  onClick: () => void;
  interactive?: boolean;
  showLabel?: boolean;
}) {
  const group = useRef<THREE.Group>(null);
  const time = useRef(0);
  const state = present(snapshot);
  const stress = state.health === "overloaded",
    offline = state.health === "offline";
  const color = offline ? "#617183" : stress ? C.red : C.app;
  useFrame((_, dt) => {
    if (snapshot.paused) return;
    const delta = Math.min(dt, 0.05);
    if (!reduceMotion) time.current += delta;
    if (group.current) {
      const crashed = snapshot.offlineReason === "overload";
      const tilt = crashed ? -0.045 : 0;
      group.current.rotation.z =
        stress && !reduceMotion
          ? Math.sin(time.current * 34) *
            (0.009 + snapshot.overloadProgress * 0.03)
          : reduceMotion
            ? tilt
            : THREE.MathUtils.damp(group.current.rotation.z, tilt, 12, delta);
      group.current.rotation.x =
        stress && !reduceMotion
          ? Math.sin(time.current * 27) * snapshot.overloadProgress * 0.012
          : THREE.MathUtils.damp(group.current.rotation.x, 0, 12, delta);
    }
  });
  return (
    <group position={position}>
      <group scale={appScale}>
        <BuildingLighting
          color={color}
          mode={offline ? "offline" : stress ? "overloaded" : "healthy"}
          reduceMotion={reduceMotion}
          size={8}
          facadeZ={1.6}
          staggerRecovery
          paused={snapshot.paused}
        >
          <Base color={color} width={4.5} depth={3.8} />
          <group
            ref={group}
            onClick={(e) => {
              e.stopPropagation();
              if (interactive && e.delta < 5) onClick();
            }}
            onPointerOver={() => {
              document.body.style.cursor = interactive ? "pointer" : "";
            }}
            onPointerOut={() => {
              document.body.style.cursor = "";
            }}
          >
            <Laptop
              brand="app"
              color={C.app}
              state={offline ? "offline" : stress ? "overload" : "online"}
              role="YOUR APPLICATION"
              paused={snapshot.paused}
              reduceMotion={reduceMotion}
              onClick={onClick}
              ariaLabel={
                snapshot.offlineReason === "overload"
                  ? "Restart Your App from computer"
                  : offline
                    ? "End maintenance from computer"
                    : "Start maintenance from computer"
              }
              interactive={interactive}
              showControl={showLabel}
            />
          </group>
        </BuildingLighting>
      </group>
    </group>
  );
}
function PackageMeshes({
  body,
  lid,
  tape,
}: {
  body: React.RefObject<THREE.InstancedMesh | null>;
  lid: React.RefObject<THREE.InstancedMesh | null>;
  tape: React.RefObject<THREE.InstancedMesh | null>;
}) {
  return (
    <>
      <instancedMesh
        ref={body}
        args={[parcelBody, undefined, 160]}
        castShadow
        frustumCulled={false}
      >
        <meshStandardMaterial roughness={0.65} metalness={0.02} />
      </instancedMesh>
      <instancedMesh
        ref={lid}
        args={[parcelLid, undefined, 160]}
        castShadow
        frustumCulled={false}
      >
        <meshStandardMaterial roughness={0.6} />
      </instancedMesh>
      <instancedMesh
        ref={tape}
        args={[parcelTape, undefined, 160]}
        frustumCulled={false}
      >
        <meshStandardMaterial color="#F5EAD4" roughness={0.8} />
      </instancedMesh>
    </>
  );
}
function QueuePackages({
  snapshot,
  reduceMotion,
}: {
  snapshot: Snapshot;
  reduceMotion: boolean;
}) {
  const body = useRef<THREE.InstancedMesh>(null),
    lid = useRef<THREE.InstancedMesh>(null),
    tape = useRef<THREE.InstancedMesh>(null);
  const levels = useRef(new Float32Array(45));
  const paint = useMemo(() => new THREE.Color(), []),
    white = useMemo(() => new THREE.Color("#fff"), []);
  const count = Math.min(45, Math.ceil(Math.sqrt(snapshot.waiting) / 3));
  useFrame((_, dt) => {
    if (!body.current || !lid.current || !tape.current) return;
    let rendered = 0;
    for (let i = 0; i < 45; i++) {
      const target = i < count ? 1 : 0;
      if (reduceMotion) levels.current[i] = target;
      else if (!snapshot.paused)
        levels.current[i] = THREE.MathUtils.damp(
          levels.current[i],
          target,
          target ? 5 : 3.5,
          Math.min(dt, 0.1),
        );
      const level = levels.current[i];
      if (level < 0.005) continue;
      const arriving = target === 1;
      unit.position.set(
        -0.77 + (i % 5) * 0.385 + (!arriving ? (1 - level) * 1.2 : 0),
        0.58 + Math.floor(i / 15) * 0.34 + (arriving ? (1 - level) * 0.65 : 0),
        -0.78 + (Math.floor(i / 5) % 3) * 0.43,
      );
      unit.rotation.set(0, (i % 2) * 0.07, 0);
      unit.scale.setScalar(0.86 * level);
      unit.updateMatrix();
      for (const mesh of [body.current, lid.current, tape.current])
        mesh.setMatrixAt(rendered, unit.matrix);
      const portion = ((i + 0.5) / Math.max(1, count)) * snapshot.waiting;
      const source =
        portion < snapshot.waitingBySource.shopify
          ? "shopify"
          : portion <
              snapshot.waitingBySource.shopify + snapshot.waitingBySource.stripe
            ? "stripe"
            : "whatsapp";
      paint.set(C[source]);
      body.current.setColorAt(rendered, paint);
      lid.current.setColorAt(rendered, paint.lerp(white, 0.14));
      rendered++;
    }
    for (const mesh of [body.current, lid.current, tape.current]) {
      mesh.count = rendered;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  });
  return <PackageMeshes body={body} lid={lid} tape={tape} />;
}
function Route({
  curve,
  color,
  active = true,
  shown = true,
  reduceMotion = false,
  paused = false,
}: {
  curve: THREE.CatmullRomCurve3;
  color: string;
  active?: boolean;
  shown?: boolean;
  reduceMotion?: boolean;
  paused?: boolean;
}) {
  const root = useRef<THREE.Group>(null);
  const progress = useRef(shown ? 1 : 0);
  const invalidate = useThree((state) => state.invalidate);
  useFrame((_, dt) => {
    if (!root.current) return;
    // Switching comparison views while paused must still reveal the full route.
    if (reduceMotion || paused) progress.current = shown ? 1 : 0;
    else
      progress.current = THREE.MathUtils.damp(
        progress.current,
        shown ? 1 : 0,
        shown ? 4 : 7,
        Math.min(dt, 0.05),
      );
    if (Math.abs(progress.current - (shown ? 1 : 0)) < 0.002)
      progress.current = shown ? 1 : 0;
    const p = progress.current;
    root.current.visible = p > 0.002;
    root.current.traverse((object) => {
      if (object instanceof THREE.Mesh && object.geometry !== directionMark) {
        object.geometry.setDrawRange(
          0,
          Math.floor(p * 64) * ((object.geometry.index?.count ?? 0) / 64),
        );
      }
    });
    root.current.children.slice(3).forEach((arrow, i) => {
      arrow.visible = p > (i + 0.5) / 5;
    });
    if (Math.abs(p - (shown ? 1 : 0)) > 0.002 && !paused) invalidate();
  });
  const { ribbon, left, right, arrows } = useMemo(() => {
    const vertices: number[] = [],
      indices: number[] = [],
      left: THREE.Vector3[] = [],
      right: THREE.Vector3[] = [];
    for (let i = 0; i <= 64; i++) {
      const p = curve.getPointAt(i / 64),
        t = curve.getTangentAt(i / 64),
        n = new THREE.Vector3(-t.z, 0, t.x).normalize();
      const a = p.clone().addScaledVector(n, 0.33),
        b = p.clone().addScaledVector(n, -0.33);
      vertices.push(a.x, a.y, a.z, b.x, b.y, b.z);
      left.push(a);
      right.push(b);
      if (i < 64) {
        const v = i * 2;
        indices.push(v, v + 2, v + 1, v + 1, v + 2, v + 3);
      }
    }
    const ribbon = new THREE.BufferGeometry();
    ribbon.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(vertices, 3),
    );
    ribbon.setIndex(indices);
    ribbon.computeVertexNormals();
    return {
      ribbon,
      left: new THREE.CatmullRomCurve3(left),
      right: new THREE.CatmullRomCurve3(right),
      arrows: Array.from({ length: 5 }, (_, i) => ({
        p: curve.getPointAt((i + 0.5) / 5),
        t: curve.getTangentAt((i + 0.5) / 5),
      })),
    };
  }, [curve]);
  useEffect(() => () => ribbon.dispose(), [ribbon]);
  return (
    <group ref={root}>
      <mesh geometry={ribbon} receiveShadow>
        <meshStandardMaterial
          color={active ? "#353A49" : "#232733"}
          roughness={0.76}
          side={THREE.DoubleSide}
        />
      </mesh>
      {[left, right].map((edge, i) => (
        <mesh key={i}>
          <tubeGeometry args={[edge, 64, 0.024, 6, false]} />
          <meshStandardMaterial
            color={active ? "#70788C" : "#3C4252"}
            metalness={0.5}
            roughness={0.35}
          />
        </mesh>
      ))}
      {arrows.map(({ p, t }, i) => (
        <group
          key={i}
          position={[p.x, p.y + 0.008, p.z]}
          rotation={[0, Math.atan2(t.x, t.z), 0]}
        >
          <mesh geometry={directionMark} rotation={[-Math.PI / 2, 0, 0]}>
            <meshBasicMaterial
              color={active ? color : "#697187"}
              transparent
              opacity={0.55}
              side={THREE.DoubleSide}
            />
          </mesh>
        </group>
      ))}
    </group>
  );
}
/** Packages are views of actual in-flight simulation batches, not a second clock. */
function Flow({
  curve,
  color,
  clock,
  paused,
  playbackSpeed,
  flights,
  reduceMotion,
  reset,
  onInspect,
  onFlowHover,
  packageRoute,
  selectedParcel,
  inspectRequest = 0,
  requestEnabled = false,
}: {
  curve: THREE.CatmullRomCurve3;
  color: string;
  clock: number;
  paused: boolean;
  playbackSpeed: number;
  flights: (Flight | FlightOutcome)[];
  reduceMotion: boolean;
  reset: number;
  onInspect?: (selection: OpenParcel) => void;
  onFlowHover: Props["onFlowHover"];
  packageRoute: ParcelRoute;
  selectedParcel: OpenParcel | null;
  inspectRequest?: number;
  requestEnabled?: boolean;
}) {
  const body = useRef<THREE.InstancedMesh>(null),
    lid = useRef<THREE.InstancedMesh>(null),
    tape = useRef<THREE.InstancedMesh>(null);
  const records = useRef(new Map<number, Parcel>());
  const rendered = useRef<
    { flight: Flight | FlightOutcome; parcel: Parcel; progress: number }[]
  >([]);
  const hover = useRef(new ParcelHover());
  const hoverMaterial = useRef<THREE.MeshBasicMaterial>(null);
  const sync = useRef({ clock, at: performance.now() });
  useLayoutEffect(() => {
    sync.current = { clock, at: performance.now() };
  }, [clock, paused]);
  const invalidate = useThree((state) => state.invalidate);
  const point = useMemo(() => new THREE.Vector3(), []),
    tangent = useMemo(() => new THREE.Vector3(), []);
  const paint = useMemo(() => new THREE.Color(), []),
    base = useMemo(() => new THREE.Color(color), [color]);
  const red = useMemo(() => new THREE.Color(C.red), []),
    white = useMemo(() => new THREE.Color("#fff"), []);
  useEffect(() => {
    const sphere = new THREE.Box3()
      .setFromPoints(curve.getSpacedPoints(48))
      .getBoundingSphere(new THREE.Sphere());
    sphere.radius += 2;
    for (const mesh of [body.current, lid.current, tape.current])
      if (mesh) mesh.boundingSphere = sphere;
  }, [curve]);
  useEffect(() => {
    records.current.clear();
    hover.current = new ParcelHover();
    return () => {
      document.body.style.cursor = "";
      onFlowHover(false);
    };
  }, [reset, onFlowHover]);
  const openInstance = (index: number) => {
    if (!onInspect || !body.current || selectedParcel) return;
    const record = rendered.current[index];
    if (!record) return;
    const matrix = new THREE.Matrix4();
    body.current.getMatrixAt(index, matrix);
    matrix.premultiply(body.current.matrixWorld);
    const position = new THREE.Vector3(),
      rotation = new THREE.Quaternion(),
      scale = new THREE.Vector3();
    matrix.decompose(position, rotation, scale);
    hover.current.leave();
    onFlowHover(false);
    document.body.style.cursor = "";
    const actualColor = new THREE.Color();
    body.current.getColorAt(index, actualColor);
    onInspect({
      parcel: record.parcel,
      position: position.toArray(),
      rotation: rotation.toArray(),
      color: actualColor.getStyle(),
    });
  };
  const lastRequest = useRef(inspectRequest);
  useEffect(() => {
    if (lastRequest.current === inspectRequest) return;
    lastRequest.current = inspectRequest;
    if (requestEnabled && rendered.current.length)
      openInstance(Math.floor(rendered.current.length / 2));
  }, [inspectRequest]);
  useFrame((_, delta) => {
    if (!body.current || !lid.current || !tape.current) return;
    const dt = Math.min(delta, 0.05);
    const held = hover.current.step(dt);
    if (hoverMaterial.current)
      hoverMaterial.current.opacity = THREE.MathUtils.damp(
        hoverMaterial.current.opacity,
        held && !selectedParcel ? 0.17 : 0,
        12,
        dt,
      );
    // Interpolate between React snapshots, capped to one update interval. The
    // same simulation timestamps work in normal play, pause and 4x comparison.
    const time =
      clock +
      (paused || reduceMotion
        ? 0
        : Math.min(0.08, (performance.now() - sync.current.at) / 1000) *
          TIME_SCALE *
          playbackSpeed);
    let index = 0;
    rendered.current.length = 0;
    const active = new Set<number>();
    for (const flight of flights) {
      if (!flight.visible || index >= 160) continue;
      active.add(flight.id);
      let parcel = records.current.get(flight.id);
      if (!parcel) {
        parcel = createParcel(
          { ...packageRoute, source: flight.source },
          flight.id,
          reset,
        );
        records.current.set(flight.id, parcel);
      }
      if (parcel === selectedParcel?.parcel) continue;
      const outcome = "settledAt" in flight ? flight : null;
      if (outcome && (!outcome.failed || reduceMotion)) continue;
      const progress = THREE.MathUtils.clamp(
        (time - flight.departedAt) /
          Math.max(0.001, flight.arrivesAt - flight.departedAt),
        0,
        1,
      );
      curve.getPointAt(progress, point);
      curve.getTangentAt(progress, tangent);
      const lane = flight.count > 8 ? ((flight.id % 3) - 1) * 0.12 : 0;
      unit.position.set(
        point.x - tangent.z * lane,
        point.y + 0.21,
        point.z + tangent.x * lane,
      );
      unit.rotation.set(0, Math.atan2(tangent.x, tangent.z), 0);
      unit.scale.setScalar(1);
      if (outcome) {
        const hit = THREE.MathUtils.clamp(
          (time - outcome.settledAt) / (ARRIVAL_EFFECT_SECONDS * TIME_SCALE),
          0,
          1,
        );
        unit.position.y += Math.sin(hit * Math.PI) * 0.5;
        unit.position.z += hit * 0.45;
        unit.rotation.z = hit * 1.8;
        unit.scale.setScalar(1 - hit);
      }
      unit.updateMatrix();
      for (const mesh of [body.current, lid.current, tape.current])
        mesh.setMatrixAt(index, unit.matrix);
      paint.copy(outcome ? red : base);
      body.current.setColorAt(index, paint);
      lid.current.setColorAt(index, paint.lerp(white, 0.16));
      rendered.current.push({ flight, parcel, progress });
      index++;
    }
    for (const [id, parcel] of records.current)
      if (!active.has(id) && parcel !== selectedParcel?.parcel)
        records.current.delete(id);
    for (const mesh of [body.current, lid.current, tape.current]) {
      mesh.count = index;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
    if (held || (hoverMaterial.current?.opacity ?? 0) > 0.002) invalidate();
  });
  return (
    <group
      onPointerOver={(event) => {
        if (!onInspect || selectedParcel) return;
        event.stopPropagation();
        hover.current.enter();
        onFlowHover(true);
        document.body.style.cursor = "pointer";
        invalidate();
      }}
      onPointerOut={() => {
        hover.current.leave();
        onFlowHover(false);
        document.body.style.cursor = "";
        invalidate();
      }}
      onClick={(event) => {
        if (event.delta > 5 || !onInspect || selectedParcel) return;
        event.stopPropagation();
        const hit = event.intersections.find(
          (item) =>
            item.object === body.current ||
            item.object === lid.current ||
            item.object === tape.current,
        );
        if (hit?.instanceId !== undefined) {
          openInstance(hit.instanceId);
          return;
        }
        let nearest = -1,
          distance = Infinity;
        for (let i = 0; i < rendered.current.length; i++) {
          curve.getPointAt(rendered.current[i].progress, point);
          body.current?.parent?.localToWorld(point);
          const d = point.distanceToSquared(event.point);
          if (d < distance) {
            distance = d;
            nearest = i;
          }
        }
        if (nearest >= 0) openInstance(nearest);
      }}
    >
      {flights.some((f) => f.visible) && onInspect && (
        <mesh>
          <tubeGeometry args={[curve, 64, 0.48, 6, false]} />
          <meshBasicMaterial
            ref={hoverMaterial}
            color={color}
            transparent
            opacity={0}
            depthWrite={false}
          />
        </mesh>
      )}
      <PackageMeshes body={body} lid={lid} tape={tape} />
    </group>
  );
}

function BuildReveal({
  town,
  at,
  reduceMotion,
  paused,
  alwaysVisible = false,
  enabled = true,
  children,
}: {
  town: TownSnapshot;
  at: number;
  reduceMotion: boolean;
  paused: boolean;
  alwaysVisible?: boolean;
  enabled?: boolean;
  children: ReactNode;
}) {
  const root = useRef<THREE.Group>(null);
  const progress = useRef(
    alwaysVisible || (enabled && visibleAt(town, at + 1.25)) ? 1 : 0,
  );
  const warmed = useRef(false);
  const invalidate = useThree((state) => state.invalidate);
  const shown = enabled && (alwaysVisible || visibleAt(town, at));
  useLayoutEffect(() => {
    root.current?.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      for (const material of Array.isArray(object.material)
        ? object.material
        : [object.material]) {
        material.clippingPlanes = gatewayGround;
        material.clipShadows = true;
        material.needsUpdate = true;
      }
    });
  }, []);
  useFrame((_, dt) => {
    if (!root.current) return;
    if (!shown) progress.current = 0;
    else if (reduceMotion || town.mode === "playing") progress.current = 1;
    else if (!paused)
      progress.current = Math.min(
        1,
        progress.current + Math.min(dt, 0.05) / 1.25,
      );
    const p = progress.current;
    root.current.position.y = -7.5 * (1 - p) ** 3;
    root.current.visible = !warmed.current || p > 0;
    if (!warmed.current || (shown && p < 1 && !paused)) invalidate();
    warmed.current = true;
  });
  return (
    <group ref={root} position={[0, -7.5 * (1 - progress.current) ** 3, 0]}>
      {children}
    </group>
  );
}
function AutomationBuilding({
  id,
  position,
  snapshot,
  town,
  reduceMotion,
  paused,
  onClick,
  readOnly = false,
}: {
  id: Automation;
  position: Vec;
  snapshot: Snapshot;
  town: TownSnapshot;
  reduceMotion: boolean;
  paused: boolean;
  onClick: () => void;
  readOnly?: boolean;
}) {
  const spec = AUTOMATION[id];
  const offline = !snapshot.online;
  const stressed = !offline && snapshot.attemptRate > 100;
  const color = offline ? "#607080" : stressed ? C.red : spec.color;
  const root = useRef<THREE.Group>(null);
  const age = useRef(0);
  const interactive =
    !readOnly && town.automation === id && town.mode !== "demo";
  const showLabel = town.automation === id && visibleAt(town, ARRIVAL[id] + 1);
  useFrame((_, dt) => {
    if (paused || !root.current) return;
    if (!reduceMotion) age.current += Math.min(dt, 0.05);
    const tilt = snapshot.offlineReason === "overload" ? -0.045 : 0;
    root.current.rotation.z =
      stressed && !reduceMotion
        ? Math.sin(age.current * 23) *
          (0.006 + snapshot.overloadProgress * 0.03)
        : reduceMotion
          ? tilt
          : THREE.MathUtils.damp(
              root.current.rotation.z,
              tilt,
              12,
              Math.min(dt, 0.05),
            );
  });
  return (
    <group position={position}>
      <BuildingLighting
        color={color}
        mode={offline ? "offline" : stressed ? "overloaded" : "healthy"}
        reduceMotion={reduceMotion}
        staggerRecovery
        paused={paused}
        facadeZ={1.6}
        size={7.5}
      >
        <Base color={color} width={4.5} depth={3.8} />
        <group
          ref={root}
          onClick={(e) => {
            e.stopPropagation();
            if (interactive && e.delta < 5) onClick();
          }}
          onPointerOver={(e) => {
            e.stopPropagation();
            document.body.style.cursor = interactive ? "pointer" : "";
          }}
          onPointerOut={() => {
            document.body.style.cursor = "";
          }}
        >
          <Laptop
            brand={id}
            color={spec.color}
            state={offline ? "offline" : stressed ? "overload" : "online"}
            role="AUTOMATION"
            paused={paused}
            reduceMotion={reduceMotion}
            onClick={onClick}
            interactive={interactive}
            showControl={showLabel && !readOnly}
            ariaLabel={`${snapshot.offlineReason === "overload" ? "Restart" : offline ? "Restore" : "Pause"} ${spec.name} webhook endpoint`}
          />
        </group>
      </BuildingLighting>
    </group>
  );
}
function Plot({ position, large = false }: { position: Vec; large?: boolean }) {
  return (
    <group position={[position[0], -0.34, position[2]]}>
      <Box
        size={[large ? 6.3 : 4.75, 0.12, large ? 5 : 4.15]}
        color="#262c36"
        rough={0.96}
        round={0.06}
      />
      {[-1, 1].flatMap((x) =>
        [-1, 1].map((z) => (
          <Box
            key={`${x}:${z}`}
            at={[x * (large ? 2.85 : 2.14), 0.08, z * (large ? 2.25 : 1.83)]}
            size={[0.22, 0.025, 0.22]}
            color="#566171"
            rough={0.8}
            round={0.025}
          />
        )),
      )}
    </group>
  );
}
function Streets({
  snapshot,
  layout,
  town,
  reduceMotion,
  run,
  onInspect,
  selectedParcel,
  inspectRequest,
  readOnly,
  onFlowHover,
  playbackSpeed,
}: {
  snapshot: Snapshot;
  layout: TownLayout;
  town: TownSnapshot;
  reduceMotion: boolean;
  run: number;
  onInspect: Props["onInspect"];
  selectedParcel: Props["selectedParcel"];
  inspectRequest: number;
  readOnly: boolean;
  onFlowHover: Props["onFlowHover"];
  playbackSpeed: number;
}) {
  const {
    providers: positions,
    app: appPosition,
    automations: automationPositions,
  } = layout;
  const canInspect = !readOnly && town.mode !== "demo";
  const connectedSources = sources.filter(
    (source) => snapshot.sourceConnected[source],
  );
  const firstSource = connectedSources[0] ?? "shopify";
  const input = useMemo(
    () =>
      positions.map(
        (p) =>
          new THREE.CatmullRomCurve3([
            new THREE.Vector3(p[0] + 2.25, 0.22, p[2]),
            new THREE.Vector3(p[0] * 0.58, 0.22, p[2]),
            new THREE.Vector3(-4, 0.22, p[2] * 0.45),
            new THREE.Vector3(-2.55 * gatewayScale, 0.22, 0),
          ]),
      ),
    [layout],
  );
  const direct = useMemo(
    () =>
      positions.map(
        (p) =>
          new THREE.CatmullRomCurve3([
            new THREE.Vector3(p[0] + 2.25, 0.22, p[2]),
            new THREE.Vector3(
              -4,
              0.22,
              THREE.MathUtils.lerp(p[2], appPosition[2], 0.15),
            ),
            new THREE.Vector3(
              appPosition[0] * 0.5,
              0.22,
              THREE.MathUtils.lerp(p[2], appPosition[2], 0.8),
            ),
            new THREE.Vector3(appPosition[0] - appDock, 0.22, appPosition[2]),
          ]),
      ),
    [layout],
  );
  const output = useMemo(
    () =>
      new THREE.CatmullRomCurve3([
        new THREE.Vector3(2.55 * gatewayScale, 0.22, 0),
        new THREE.Vector3(appPosition[0] * 0.3, 0.22, appPosition[2] * 0.3),
        new THREE.Vector3(appPosition[0] * 0.55, 0.22, appPosition[2]),
        new THREE.Vector3(appPosition[0] - appDock, 0.22, appPosition[2]),
      ]),
    [layout],
  );
  const branchPaths = useMemo(
    () =>
      Object.fromEntries(
        AUTOMATIONS.map((id) => {
          const p = automationPositions[id],
            from = positions[sources.indexOf(AUTOMATION[id].source)];
          return [
            id,
            {
              protected: new THREE.CatmullRomCurve3([
                new THREE.Vector3(2.55 * gatewayScale, 0.22, 0),
                new THREE.Vector3(p[0] * 0.35, 0.22, p[2] * 0.4),
                new THREE.Vector3(p[0] * 0.65, 0.22, p[2]),
                new THREE.Vector3(p[0] - 2.25, 0.22, p[2]),
              ]),
              direct: new THREE.CatmullRomCurve3([
                new THREE.Vector3(from[0] + 2.25, 0.22, from[2]),
                new THREE.Vector3(-3.8, 0.22, from[2] - 2.3),
                new THREE.Vector3(3.8, 0.22, p[2] - 2.5),
                new THREE.Vector3(p[0] - 2.25, 0.22, p[2]),
              ]),
            },
          ];
        }),
      ) as Record<
        Automation,
        { protected: THREE.CatmullRomCurve3; direct: THREE.CatmullRomCurve3 }
      >,
    [layout],
  );
  const journeys = (s: Snapshot, leg: Flight["leg"], source?: Source) =>
    [...s.flights, ...s.outcomes].filter(
      (f) => f.leg === leg && (!source || f.source === source),
    );
  const common = {
    paused: snapshot.paused,
    playbackSpeed,
    reduceMotion,
    reset: run,
    onInspect: canInspect ? onInspect : undefined,
    onFlowHover,
    selectedParcel,
  };
  const outputFlights = journeys(snapshot, "delivery");
  return (
    <>
      {sources.map((source, i) => {
        const visible =
          snapshot.sourceConnected[source] &&
          visibleAt(town, ARRIVAL[source] + 0.8);
        const intakeFlights = journeys(snapshot, "intake", source);
        const directFlights = journeys(snapshot, "direct", source);
        return (
          <group key={source}>
            <Route
              curve={input[i]}
              color={C[source]}
              shown={(visible && snapshot.enabled) || intakeFlights.length > 0}
              reduceMotion={reduceMotion}
              paused={snapshot.paused}
            />
            <Route
              curve={direct[i]}
              color={C[source]}
              shown={(visible && !snapshot.enabled) || directFlights.length > 0}
              reduceMotion={reduceMotion}
              paused={snapshot.paused}
            />
            <Flow
              {...common}
              curve={input[i]}
              clock={snapshot.clock}
              flights={intakeFlights}
              color={C[source]}
              packageRoute={{
                id: `${source}-intake`,
                source,
                destination: "hookdeck",
                viaHookdeck: true,
              }}
              inspectRequest={inspectRequest}
              requestEnabled={source === firstSource && snapshot.enabled}
            />
            <Flow
              {...common}
              curve={direct[i]}
              clock={snapshot.clock}
              flights={directFlights}
              color={C[source]}
              packageRoute={{
                id: `${source}-app`,
                source,
                destination: "app",
                viaHookdeck: false,
              }}
              inspectRequest={inspectRequest}
              requestEnabled={source === firstSource && !snapshot.enabled}
            />
          </group>
        );
      })}
      <Route
        curve={output}
        color={C.hookdeck}
        shown={snapshot.enabled || outputFlights.length > 0}
        reduceMotion={reduceMotion}
        paused={snapshot.paused}
      />
      <Flow
        {...common}
        curve={output}
        clock={snapshot.clock}
        flights={outputFlights}
        color={C.hookdeck}
        packageRoute={{
          id: "hookdeck-app",
          source: firstSource,
          destination: "app",
          viaHookdeck: true,
        }}
      />
      {town.automation &&
        AUTOMATIONS.map((id) => {
          const branch = town.destinations[id],
            spec = AUTOMATION[id],
            paths = branchPaths[id];
          const visible =
            town.automation === id && visibleAt(town, ARRIVAL[id] + 0.8);
          if (!visible) return null;
          const deliveries = journeys(branch, "delivery"),
            directDeliveries = journeys(branch, "direct");
          return (
            <group key={id}>
              <Route
                curve={paths.protected}
                color={spec.color}
                shown={snapshot.enabled || deliveries.length > 0}
                reduceMotion={reduceMotion}
                paused={snapshot.paused}
              />
              <Route
                curve={paths.direct}
                color={spec.color}
                shown={
                  (!snapshot.enabled &&
                    snapshot.sourceConnected[spec.source]) ||
                  directDeliveries.length > 0
                }
                reduceMotion={reduceMotion}
                paused={snapshot.paused}
              />
              <Flow
                {...common}
                curve={paths.protected}
                clock={branch.clock}
                flights={deliveries}
                color={C[spec.source]}
                packageRoute={{
                  id: `${spec.source}-${id}-protected`,
                  source: spec.source,
                  destination: id,
                  viaHookdeck: true,
                }}
              />
              <Flow
                {...common}
                curve={paths.direct}
                clock={branch.clock}
                flights={directDeliveries}
                color={C[spec.source]}
                packageRoute={{
                  id: `${spec.source}-${id}-direct`,
                  source: spec.source,
                  destination: id,
                  viaHookdeck: false,
                }}
              />
            </group>
          );
        })}
    </>
  );
}

function fitCamera(locations: Vec[], aspect: number, ceiling = 5.9) {
  const lens = new THREE.PerspectiveCamera(42, aspect, 0.1, 240);
  const target = new THREE.Box3()
    .setFromPoints(locations.map((p) => new THREE.Vector3(...p)))
    .getCenter(new THREE.Vector3());
  target.y = (ceiling - 0.8) / 2;
  const direction = new THREE.Vector3(0.26, 0.63, 1).normalize();
  const points = locations.flatMap((p) =>
    [-3.2, 3.2].flatMap((x) =>
      [-2.4, 3.8].flatMap((z) =>
        [-0.8, ceiling].map((y) => new THREE.Vector3(p[0] + x, y, p[2] + z)),
      ),
    ),
  );
  const projected = new THREE.Vector3();
  const bounds = (distance: number) => {
    lens.position.copy(direction).multiplyScalar(distance).add(target);
    lens.lookAt(target);
    lens.updateMatrixWorld();
    let x0 = Infinity,
      x1 = -Infinity,
      y0 = Infinity,
      y1 = -Infinity;
    for (const p of points) {
      projected.copy(p).project(lens);
      x0 = Math.min(x0, projected.x);
      x1 = Math.max(x1, projected.x);
      y0 = Math.min(y0, projected.y);
      y1 = Math.max(y1, projected.y);
    }
    return { x0, x1, y0, y1 };
  };
  let distance = 40;
  for (let pass = 0; pass < 3; pass++) {
    let low = 15,
      high = 180;
    for (let i = 0; i < 24; i++) {
      const mid = (low + high) / 2,
        b = bounds(mid);
      if (
        Math.max(Math.abs(b.x0), Math.abs(b.x1)) > 0.95 ||
        Math.max(Math.abs(b.y0), Math.abs(b.y1)) > 0.94
      )
        low = mid;
      else high = mid;
    }
    distance = high;
    const b = bounds(distance),
      halfHeight = Math.tan(THREE.MathUtils.degToRad(21)) * distance;
    target.addScaledVector(
      new THREE.Vector3(1, 0, 0).applyQuaternion(lens.quaternion),
      ((b.x0 + b.x1) / 2) * halfHeight * aspect,
    );
    target.addScaledVector(
      new THREE.Vector3(0, 1, 0).applyQuaternion(lens.quaternion),
      ((b.y0 + b.y1) / 2) * halfHeight,
    );
  }
  return {
    target,
    position: direction.multiplyScalar(distance * 1.02).add(target),
  };
}
function Camera({
  reduceMotion,
  layout,
  town,
  panCamera,
  cameraZoom,
  run,
  locked,
}: {
  reduceMotion: boolean;
  layout: TownLayout;
  town: TownSnapshot;
  panCamera: boolean;
  cameraZoom: number;
  run: number;
  locked: boolean;
}) {
  const { camera, size, invalidate } = useThree();
  const controls = useRef<ComponentRef<typeof OrbitControls>>(null);
  const zoomDistance = useRef<number | null>(null);
  const lastZoom = useRef(cameraZoom);
  const selected = town.automation;
  const overview = town.mode !== "lobby";
  const frame = useMemo(() => {
    const aspect = size.width / size.height;
    return {
      town: fitCamera(
        [
          ...layout.providers,
          layout.app,
          [0, 0, 0],
          ...(selected ? [layout.automations[selected]] : []),
        ],
        aspect,
      ),
      app: fitCamera([layout.app], aspect, 4.2),
    };
  }, [size.width, size.height, selected, layout]);
  const mounted = useRef(false);
  const flight = useRef<{
    elapsed: number;
    fromPosition: THREE.Vector3;
    fromTarget: THREE.Vector3;
    toPosition: THREE.Vector3;
    toTarget: THREE.Vector3;
  } | null>(null);
  useLayoutEffect(() => {
    if (!controls.current) return;
    zoomDistance.current = null;
    const view = overview ? frame.town : frame.app;
    if (!mounted.current || reduceMotion) {
      camera.position.copy(view.position);
      controls.current.target.copy(view.target);
      controls.current.update();
      flight.current = null;
    } else {
      flight.current = {
        elapsed: 0,
        fromPosition: camera.position.clone(),
        fromTarget: controls.current.target.clone(),
        toPosition: view.position,
        toTarget: view.target,
      };
    }
    mounted.current = true;
    invalidate();
  }, [camera, frame, overview, run, reduceMotion, invalidate]);
  useEffect(() => {
    const delta = cameraZoom - lastZoom.current;
    lastZoom.current = cameraZoom;
    if (!delta || !controls.current) return;
    flight.current = null;
    zoomDistance.current = THREE.MathUtils.clamp(
      (zoomDistance.current ?? controls.current.getDistance()) *
        Math.pow(0.85, delta),
      4,
      180,
    );
    invalidate();
  }, [cameraZoom, invalidate]);
  useFrame((_, dt) => {
    if (locked) return;
    if (zoomDistance.current !== null && controls.current) {
      const target = controls.current.target;
      const distance = camera.position.distanceTo(target);
      const desired = zoomDistance.current;
      const next = reduceMotion
        ? desired
        : THREE.MathUtils.damp(distance, desired, 14, Math.min(dt, 0.05));
      const settled = Math.abs(next - desired) < 0.002;
      camera.position
        .sub(target)
        .multiplyScalar((settled ? desired : next) / Math.max(0.001, distance))
        .add(target);
      controls.current.update();
      if (settled) zoomDistance.current = null;
      else invalidate();
      return;
    }
    const move = flight.current;
    if (!move || !controls.current) return;
    move.elapsed = Math.min(1, move.elapsed + Math.min(dt, 0.05) / 1.15);
    const progress = THREE.MathUtils.smootherstep(move.elapsed, 0, 1);
    camera.position.lerpVectors(move.fromPosition, move.toPosition, progress);
    controls.current.target.lerpVectors(
      move.fromTarget,
      move.toTarget,
      progress,
    );
    camera.lookAt(controls.current.target);
    if (move.elapsed === 1) flight.current = null;
    else invalidate();
  });
  const mouseButtons = useMemo(
    () => ({
      LEFT: panCamera ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE,
      MIDDLE: THREE.MOUSE.DOLLY,
      RIGHT: THREE.MOUSE.PAN,
    }),
    [panCamera],
  );
  const touches = useMemo(
    () => ({
      ONE: panCamera ? THREE.TOUCH.PAN : THREE.TOUCH.ROTATE,
      TWO: THREE.TOUCH.DOLLY_PAN,
    }),
    [panCamera],
  );
  return (
    <OrbitControls
      ref={controls}
      enabled={!locked}
      makeDefault
      enablePan
      enableZoom
      screenSpacePanning
      mouseButtons={mouseButtons}
      touches={touches}
      onStart={() => {
        flight.current = null;
        zoomDistance.current = null;
      }}
      enableDamping={!reduceMotion}
      dampingFactor={0.07}
      minPolarAngle={0.25}
      maxPolarAngle={1.45}
      minDistance={4}
      maxDistance={180}
      rotateSpeed={0.6}
      zoomSpeed={0.75}
      panSpeed={0.75}
    />
  );
}
function World(props: Props) {
  const { town, snapshot, reduceMotion } = props;
  const narrow = useThree((state) => state.size.width < 560);
  const layout = narrow ? phoneLayout : desktopLayout;
  const {
    providers: positions,
    app: appPosition,
    automations: automationPositions,
  } = layout;
  useEffect(() => {
    const id = requestAnimationFrame(() => props.onReady());
    return () => cancelAnimationFrame(id);
  }, [props.onReady]);
  const queueSnapshot = useMemo(() => {
    const branches = town.automation
      ? [town.destinations[town.automation]]
      : [];
    return {
      ...snapshot,
      waiting: town.waiting,
      flights: [...snapshot.flights, ...branches.flatMap((d) => d.flights)],
      online: snapshot.online || branches.some((d) => d.online),
      attemptRate:
        snapshot.attemptRate + branches.reduce((n, d) => n + d.attemptRate, 0),
      waitingBySource: Object.fromEntries(
        sources.map((source) => [
          source,
          snapshot.waitingBySource[source] +
            branches.reduce((n, d) => n + d.waitingBySource[source], 0),
        ]),
      ) as Record<Source, number>,
    };
  }, [snapshot, town]);
  return (
    <>
      <Camera
        layout={layout}
        key={props.cameraReset}
        reduceMotion={reduceMotion}
        town={town}
        panCamera={props.panCamera}
        cameraZoom={props.cameraZoom}
        run={props.run}
        locked={!!props.selectedParcel}
      />
      <StudioReflections />
      <SoftShadows size={20} samples={10} />
      <ambientLight intensity={0.32} />
      <hemisphereLight args={["#bed5ff", "#111722", 0.55]} />
      <directionalLight
        position={[-4, 18, 8]}
        intensity={3.4}
        color="#ffffff"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-34}
        shadow-camera-right={34}
        shadow-camera-top={34}
        shadow-camera-bottom={-34}
        shadow-camera-far={80}
        shadow-normalBias={0.03}
      />
      <directionalLight position={[5, 8, -6]} color="#89b7ff" intensity={1.6} />
      <group position={[0, -0.4, 0]}>
        {positions.map(
          (position, i) =>
            visibleAt(town, ARRIVAL[sources[i]]) && (
              <Plot key={i} position={position} />
            ),
        )}
        <Plot position={appPosition} />
        {snapshot.enabled && <Plot position={[0, 0, 0]} large />}
        {town.automation &&
          AUTOMATIONS.map(
            (id) =>
              town.automation === id &&
              visibleAt(town, ARRIVAL[id]) && (
                <Plot key={id} position={automationPositions[id]} />
              ),
          )}
        {sources.map((source, i) => (
          <BuildReveal
            key={source}
            town={town}
            at={ARRIVAL[source]}
            reduceMotion={reduceMotion}
            paused={snapshot.paused}
          >
            <Provider
              source={source}
              position={positions[i]}
              snapshot={snapshot}
              reduceMotion={reduceMotion}
              onClick={() => props.onProvider(source)}
              interactive={
                !props.readOnly && !props.selectedParcel && town.mode !== "demo"
              }
              showLabel={
                !props.readOnly &&
                !props.selectedParcel &&
                visibleAt(town, ARRIVAL[source] + 1)
              }
            />
          </BuildReveal>
        ))}
        <Gateway
          cinematic={false}
          reset={props.run}
          snapshot={queueSnapshot}
          reduceMotion={reduceMotion}
        />
        <BuildReveal
          key="app"
          town={town}
          at={ARRIVAL.app}
          alwaysVisible
          reduceMotion={reduceMotion}
          paused={snapshot.paused}
        >
          <AppBuilding
            position={appPosition}
            snapshot={snapshot}
            reduceMotion={reduceMotion}
            onClick={props.onPower}
            interactive={
              !props.readOnly && !props.selectedParcel && town.mode !== "demo"
            }
            showLabel={!props.readOnly && !props.selectedParcel}
          />
        </BuildReveal>
        {town.automation &&
          AUTOMATIONS.map((id) => (
            <BuildReveal
              key={id}
              town={town}
              at={ARRIVAL[id]}
              enabled={town.automation === id}
              reduceMotion={reduceMotion}
              paused={snapshot.paused}
            >
              <AutomationBuilding
                position={automationPositions[id]}
                id={id}
                readOnly={props.readOnly || !!props.selectedParcel}
                snapshot={town.destinations[id]}
                town={town}
                reduceMotion={reduceMotion}
                paused={snapshot.paused}
                onClick={() => props.onAutomation(id)}
              />
            </BuildReveal>
          ))}
        <Streets
          onFlowHover={props.onFlowHover}
          playbackSpeed={props.playbackSpeed}
          layout={layout}
          snapshot={snapshot}
          town={town}
          reduceMotion={reduceMotion}
          run={props.run}
          onInspect={props.onInspect}
          selectedParcel={props.selectedParcel}
          inspectRequest={props.inspectRequest}
          readOnly={props.readOnly}
        />
        <mesh
          rotation={[-Math.PI / 2, 0, 0]}
          position={[0, -0.4, 0]}
          receiveShadow
        >
          <planeGeometry args={[200, 200]} />
          <shadowMaterial opacity={0.25} transparent />
        </mesh>
      </group>
      {props.selectedParcel && (
        <PackageOpening
          selection={props.selectedParcel}
          reduceMotion={reduceMotion}
          onClose={props.onClosePackage}
        />
      )}
    </>
  );
}
function Fallback() {
  return (
    <div className="world-fallback">
      Your playground is in low-power mode.
      <span>Providers → Hookdeck → your app</span>
      <small>The controls and counters still work.</small>
    </div>
  );
}
class Boundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? <Fallback /> : this.props.children;
  }
}
export default function Scene(props: Props) {
  return (
    <Boundary>
      <Canvas
        shadows
        camera={initialCamera}
        frameloop={
          props.snapshot.paused ||
          props.reduceMotion ||
          props.town.mode === "lobby"
            ? "demand"
            : "always"
        }
        dpr={[1, 1.75]}
        gl={{
          alpha: true,
          antialias: true,
          powerPreference: "high-performance",
          localClippingEnabled: true,
        }}
        fallback={
          <div aria-hidden="true">
            <Fallback />
          </div>
        }
      >
        <Suspense fallback={null}>
          <World {...props} />
        </Suspense>
      </Canvas>
    </Boundary>
  );
}
