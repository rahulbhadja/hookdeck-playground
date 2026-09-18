import { memo, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Html, useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { Solid } from "./Architecture";
import { BRAND } from "./brands";

type Vec = [number, number, number];
export type HardwareState =
  | "online"
  | "busy"
  | "overload"
  | "offline"
  | "disconnected";
type DisplayProps = {
  brand: string;
  color: string;
  state: HardwareState;
  paused: boolean;
  reduceMotion: boolean;
  role?: string;
};
const MODEL = "/models/classic-laptop/classic_laptop.gltf";
const svgSources = import.meta.glob("../public/logos/*.svg", {
  eager: true,
  query: "?raw",
  import: "default",
}) as Record<string, string>;
const labels: Record<string, string> = {
  shopify: "Shopify",
  stripe: "Stripe",
  whatsapp: "WhatsApp",
  app: "Your app",
  n8n: "n8n",
  zapier: "Zapier",
  make: "Make",
  hookdeck: "Hookdeck",
};
const providerMessages: Record<string, string> = {
  shopify: "ORDER PLACED",
  stripe: "PAYMENT RECEIVED",
  whatsapp: "MESSAGE RECEIVED",
};
const unit = new THREE.Object3D();
const blockGeometry = new RoundedBoxGeometry(1, 1, 1, 2, 0.06);

/** Shared geometry for small hardware details: a whole vent bank is one draw. */
const Details = memo(function Details({
  pieces,
  color,
  metal = 0.35,
}: {
  pieces: { at: Vec; size: Vec }[];
  color: string;
  metal?: number;
}) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    if (!mesh.current) return;
    pieces.forEach((piece, i) => {
      unit.position.set(...piece.at);
      unit.rotation.set(0, 0, 0);
      unit.scale.set(...piece.size);
      unit.updateMatrix();
      mesh.current!.setMatrixAt(i, unit.matrix);
    });
    mesh.current.instanceMatrix.needsUpdate = true;
    mesh.current.computeBoundingSphere();
  }, [pieces]);
  return (
    <instancedMesh
      ref={mesh}
      args={[blockGeometry, undefined, pieces.length]}
      castShadow
      receiveShadow
    >
      <meshStandardMaterial color={color} metalness={metal} roughness={0.46} />
    </instancedMesh>
  );
});

function useDisplay({
  brand,
  color,
  state,
  paused,
  reduceMotion,
  role = "EVENT SOURCE",
}: DisplayProps) {
  const invalidate = useThree((s) => s.invalidate);
  const display = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 640;
    canvas.height = 480;
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    const logo = new Image();
    return { canvas, texture, logo, loaded: false, age: 0, lastFrame: -1 };
  }, []);
  const latest = useRef({ brand, color, state, role });
  latest.current = { brand, color, state, role };
  const draw = () => {
    const { brand, color, state, role } = latest.current;
    const ctx = display.canvas.getContext("2d")!;
    const offline = state === "offline" || state === "disconnected";
    const stressed = state === "overload";
    const ink = stressed ? "#ff8e76" : offline ? "#8795a5" : "#f3f7ff";
    ctx.fillStyle = offline ? "#080d14" : stressed ? "#34171d" : "#0c182b";
    ctx.fillRect(0, 0, 640, 480);
    const glow = ctx.createRadialGradient(320, 205, 10, 320, 240, 390);
    glow.addColorStop(0, offline ? "#101823" : `${color}75`);
    glow.addColorStop(1, "#07101e00");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, 640, 480);
    ctx.fillStyle = ink;
    ctx.globalAlpha = 0.65;
    ctx.font = "18px monospace";
    ctx.textAlign = "left";
    ctx.fillText(role, 38, 47);
    ctx.fillRect(38, 65, 564, 1);
    ctx.globalAlpha = offline ? 0.28 : 1;
    if (display.loaded && brand !== "app") {
      const ratio = display.logo.naturalWidth / display.logo.naturalHeight;
      const width = Math.min(390, 135 * ratio);
      const height = width / ratio;
      ctx.drawImage(
        display.logo,
        (640 - width) / 2,
        215 - height / 2,
        width,
        height,
      );
      if (ratio < 2.2) {
        ctx.textAlign = "center";
        ctx.font = "600 34px sans-serif";
        ctx.fillText(labels[brand] ?? brand, 320, 325);
      }
    } else {
      ctx.textAlign = "center";
      ctx.font = "500 104px monospace";
      ctx.fillText(offline ? "×  ×" : stressed ? "!  !" : "{ }", 320, 244);
      ctx.font = "600 38px sans-serif";
      ctx.fillText(labels[brand] ?? brand, 320, 320);
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = "center";
    ctx.font = "20px monospace";
    ctx.fillStyle = ink;
    const status =
      state === "disconnected"
        ? "DISCONNECTED"
        : offline
          ? "OFFLINE"
          : stressed
            ? "OVERLOADED"
            : brand === "hookdeck"
              ? "BUFFER · PACE · DELIVER"
              : (providerMessages[brand] ??
                (state === "busy" ? "SENDING EVENTS" : "SYSTEM ONLINE"));
    ctx.fillText(status, 320, 391);
    for (let i = 0; i < 34; i++) {
      const level = offline
        ? 2
        : 4 +
          (Math.sin(i * 0.9 + display.age * (state === "busy" ? 8 : 3)) + 1) *
            (stressed || state === "busy" ? 13 : 5);
      ctx.fillStyle = offline ? "#233342" : stressed ? "#ff7e6d" : color;
      ctx.fillRect(48 + i * 16.2, 438 - level, 9, level);
    }
    // Fine LCD rows are part of the screen texture, never a page overlay.
    ctx.fillStyle = "#00000016";
    for (let y = 0; y < 480; y += 4) ctx.fillRect(0, y, 640, 1);
    display.texture.needsUpdate = true;
  };
  useEffect(() => {
    let live = true;
    display.loaded = false;
    const svg = svgSources[`../public/logos/${brand}.svg`];
    if (svg) {
      display.logo.onload = () => {
        if (!live) return;
        display.loaded = true;
        draw();
        invalidate();
      };
      // Preserve multi-color marks and use a legible variant for single-color marks.
      const screenSvg = ["shopify", "whatsapp", "make", "zapier"].includes(
        brand,
      )
        ? svg
        : svg.replace(
            /fill="(?!none)[^"]*"/g,
            `fill="${brand === "n8n" ? color : "#f4f7ff"}"`,
          );
      display.logo.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(screenSvg)}`;
    }
    draw();
    invalidate();
    return () => {
      live = false;
      display.logo.onload = null;
    };
  }, [brand, display, invalidate]);
  useEffect(() => {
    draw();
    invalidate();
  }, [color, state, role, invalidate]);
  useEffect(() => () => display.texture.dispose(), [display]);
  useFrame((_, dt) => {
    if (
      paused ||
      reduceMotion ||
      state === "offline" ||
      state === "disconnected"
    )
      return;
    display.age += Math.min(dt, 0.05);
    const frame = Math.floor(display.age * 8);
    if (frame !== display.lastFrame) {
      display.lastFrame = frame;
      draw();
    }
  });
  return display.texture;
}

/** Reuse adjacent casing texels for the two baked-in manufacturer badges.
 * Apply the same UV correction to every surface map so the label doesn't remain
 * visible as a shiny patch or a raised normal-map outline. The shared source
 * textures, keyboard legends, hardware details and live screen stay intact.
 */
function removeCaseBadges(material: THREE.MeshStandardMaterial) {
  material.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <common>",
      `#include <common>
      vec2 plainCasingUv(vec2 uv) {
        // glTF image coordinates: front bezel, then outer lid.
        if (uv.x > 0.450 && uv.x < 0.492 && uv.y > 0.478 && uv.y < 0.501)
          return uv - vec2(0.0, 0.09);
        if (uv.x > 0.556 && uv.x < 0.584 && uv.y > 0.752 && uv.y < 0.808)
          return uv - vec2(0.0, 0.12);
        return uv;
      }`,
    );
    const maps = {
      map_fragment: "vMapUv",
      normal_fragment_maps: "vNormalMapUv",
      roughnessmap_fragment: "vRoughnessMapUv",
      metalnessmap_fragment: "vMetalnessMapUv",
    } as const;
    for (const [chunk, uv] of Object.entries(maps)) {
      shader.fragmentShader = shader.fragmentShader.replace(
        `#include <${chunk}>`,
        THREE.ShaderChunk[chunk as keyof typeof maps].replaceAll(
          uv,
          `plainCasingUv(${uv})`,
        ),
      );
    }
  };
  material.customProgramCacheKey = () => "laptop-plain-casing-v1";
}

/** Real CC0 glTF, with shared textures and independent materials/lid pivots. */
export function Laptop({
  onClick,
  ariaLabel,
  interactive = true,
  showControl = true,
  ...props
}: DisplayProps & {
  onClick: () => void;
  ariaLabel: string;
  interactive?: boolean;
  showControl?: boolean;
}) {
  const gltf = useGLTF(MODEL);
  const screen = useDisplay(props);
  const lid = useRef<THREE.Group>(null);
  const invalidate = useThree((s) => s.invalidate);
  const inactive = props.state === "disconnected";
  const offline = props.state === "offline";
  const model = useMemo(() => {
    const clone = gltf.scene.clone(true);
    const materials = new Map<THREE.Material, THREE.Material>();
    const ownedGeometry: THREE.BufferGeometry[] = [];
    clone.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      object.castShadow = true;
      object.receiveShadow = true;
      const original = object.material as THREE.MeshStandardMaterial;
      if (original.name === "classic_laptop_screen") {
        const geometry = object.geometry.clone();
        geometry.computeBoundingBox();
        const bounds = geometry.boundingBox!;
        const pos = geometry.attributes.position;
        const uv = new Float32Array(pos.count * 2);
        for (let i = 0; i < pos.count; i++) {
          uv[i * 2] =
            (pos.getX(i) - bounds.min.x) / (bounds.max.x - bounds.min.x);
          uv[i * 2 + 1] =
            (pos.getY(i) - bounds.min.y) / (bounds.max.y - bounds.min.y);
        }
        geometry.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
        object.geometry = geometry;
        ownedGeometry.push(geometry);
        const material = new THREE.MeshBasicMaterial({
          map: screen,
          toneMapped: false,
        });
        materials.set(original, material);
        object.material = material;
      } else {
        if (!materials.has(original)) {
          const material = original.clone();
          material.color
            .set(props.color)
            .lerp(new THREE.Color("#ffffff"), 0.48);
          material.roughness = 0.85;
          material.metalness = 0.18;
          material.side = THREE.FrontSide;
          removeCaseBadges(material);
          materials.set(original, material);
        }
        object.material = materials.get(original)!;
      }
    });
    const display = clone.getObjectByName("classic_laptop_screen")!;
    const pivot = display.position.clone();
    display.position.set(0, 0, 0);
    clone.remove(display);
    return { base: clone, display, pivot, materials, ownedGeometry };
  }, [gltf, screen, props.color]);
  useEffect(
    () => () => {
      model.materials.forEach((material) => material.dispose());
      model.ownedGeometry.forEach((geometry) => geometry.dispose());
    },
    [model],
  );
  useFrame((_, dt) => {
    if (!lid.current) return;
    const target = inactive ? 1.16 : offline ? 0.34 : -0.13;
    lid.current.rotation.x = props.reduceMotion
      ? target
      : THREE.MathUtils.damp(
          lid.current.rotation.x,
          target,
          7,
          Math.min(dt, 0.05),
        );
    if (Math.abs(lid.current.rotation.x - target) > 0.001) invalidate();
  });
  return (
    <group scale={6.3} position={[0, 0.16, 0.15]} dispose={null}>
      <primitive object={model.base} />
      <group ref={lid} position={model.pivot} rotation={[-0.13, 0, 0]}>
        <primitive object={model.display} />
        {showControl && (
          <Html
            transform
            wrapperClass="hardware-screen-overlay"
            distanceFactor={1}
            position={[0, 0.2416, 0.012]}
            zIndexRange={[10, 0]}
          >
            <button
              className="hardware-screen-control"
              aria-label={ariaLabel}
              aria-disabled={!interactive}
              onClick={interactive ? onClick : undefined}
              title={ariaLabel}
            >
              <span className="sr-only">{ariaLabel}</span>
            </button>
          </Html>
        )}
      </group>
    </group>
  );
}

function Cable({
  points,
  color = "#101724",
  radius = 0.045,
}: {
  points: Vec[];
  color?: string;
  radius?: number;
}) {
  const curve = useMemo(
    () =>
      new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p))),
    [points],
  );
  return (
    <mesh castShadow>
      <tubeGeometry args={[curve, 32, radius, 8, false]} />
      <meshStandardMaterial color={color} metalness={0.2} roughness={0.55} />
    </mesh>
  );
}

const keyboardKeys = Array.from({ length: 48 }, (_, i) => ({
  at: [
    -0.96 + (i % 12) * 0.175,
    0.085,
    -0.28 + Math.floor(i / 12) * 0.18,
  ] as Vec,
  size: [0.14, 0.13, 0.14] as Vec,
}));
const vents = Array.from({ length: 15 }, (_, i) => ({
  at: [0, 0.35 + i * 0.23, 0] as Vec,
  size: [0.62, 0.07, 0.04] as Vec,
}));
const rackSlots = Array.from({ length: 5 }, (_, i) => ({
  at: [0, 0.88 + i * 0.35, 0.97] as Vec,
  size: [2.65, 0.29, 0.18] as Vec,
}));

function RackLights({
  state,
  paused,
  reduceMotion,
}: Pick<DisplayProps, "state" | "paused" | "reduceMotion">) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const age = useRef(0);
  const color = useMemo(() => new THREE.Color(), []);
  useFrame((_, dt) => {
    if (!ref.current) return;
    if (!paused && !reduceMotion) age.current += Math.min(dt, 0.05);
    for (let i = 0; i < 20; i++) {
      unit.position.set(
        -1.02 + (i % 4) * 0.16,
        0.88 + Math.floor(i / 4) * 0.35,
        1.072,
      );
      unit.scale.set(0.065, 0.045, 0.025);
      unit.rotation.set(0, 0, 0);
      unit.updateMatrix();
      ref.current.setMatrixAt(i, unit.matrix);
      color.set(
        state === "offline"
          ? "#152131"
          : (Math.floor(age.current * 5) + i * 7) % 6 < 2
            ? "#78bfff"
            : "#2458b5",
      );
      ref.current.setColorAt(i, color);
    }
    ref.current.instanceMatrix.needsUpdate = true;
    if (ref.current.instanceColor) ref.current.instanceColor.needsUpdate = true;
  });
  return (
    <instancedMesh
      ref={ref}
      args={[blockGeometry, undefined, 20]}
      frustumCulled={false}
    >
      <meshBasicMaterial toneMapped={false} />
    </instancedMesh>
  );
}

/** A purpose-built central machine with a console, rack blades and a visible buffer bay. */
export function HookdeckComputer(props: Omit<DisplayProps, "brand" | "color">) {
  const color = BRAND.hookdeck.primary;
  const screen = useDisplay({
    ...props,
    brand: "hookdeck",
    color,
    role: "EVENT GATEWAY",
  });
  return (
    <group>
      <Solid
        at={[0, 0.35, -0.1]}
        size={[4.9, 0.46, 3.3]}
        color="#121c2c"
        round={0.12}
        metal={0.7}
      />
      <Solid
        at={[0, 2.45, -0.48]}
        size={[3.38, 3.85, 1.8]}
        color="#122d5e"
        round={0.19}
        metal={0.6}
        rough={0.35}
      />
      <Solid
        at={[0, 2.48, 0.48]}
        size={[3.1, 3.6, 0.2]}
        color="#0a1220"
        round={0.08}
        metal={0.6}
      />
      {[-1, 1].map((side) => (
        <group key={side}>
          <Solid
            at={[side * 1.96, 2.63, -0.38]}
            size={[0.6, 4.35, 2.12]}
            color={color}
            round={0.14}
            metal={0.45}
            rough={0.4}
          />
          <Solid
            at={[side * 1.96, 2.59, 0.708]}
            size={[0.38, 3.9, 0.055]}
            color="#111e35"
            round={0.04}
          />
          <group position={[side * 1.96, 0.62, 0.752]} scale={[0.43, 1, 1]}>
            <Details pieces={vents} color="#425878" />
          </group>
          <Solid
            at={[side * 2.08, 2.6, 0.75]}
            size={[0.035, 3.77, 0.025]}
            color="#78aaff"
            glow={1.2}
            lighting="accent"
            round={0.008}
          />
          {[0.64, 4.53].map((y) => (
            <mesh
              key={y}
              position={[side * 1.96, y, 0.77]}
              rotation={[Math.PI / 2, 0, 0]}
            >
              <cylinderGeometry args={[0.055, 0.055, 0.025, 10]} />
              <meshStandardMaterial
                color="#9dafc3"
                metalness={0.85}
                roughness={0.28}
              />
            </mesh>
          ))}
        </group>
      ))}
      <Solid
        at={[0, 4.48, -0.36]}
        size={[3.55, 0.4, 2.03]}
        color="#385f9d"
        round={0.13}
        metal={0.65}
      />
      <Solid
        at={[0, 3.48, 0.7]}
        size={[2.98, 1.77, 0.42]}
        color="#7890ab"
        round={0.16}
        metal={0.68}
        rough={0.28}
      />
      <Solid
        at={[0, 3.48, 0.93]}
        size={[2.7, 1.5, 0.08]}
        color="#060e1c"
        round={0.13}
        rough={0.2}
      />
      <mesh position={[0, 3.48, 0.98]}>
        <planeGeometry args={[2.52, 1.34]} />
        <meshBasicMaterial map={screen} toneMapped={false} />
      </mesh>
      <Details pieces={rackSlots} color="#34485f" metal={0.75} />
      <RackLights {...props} />
      {[0.88, 1.23, 1.58, 1.93, 2.28].map((y) => (
        <group key={y}>
          <Solid
            at={[0.35, y, 1.075]}
            size={[1.4, 0.065, 0.025]}
            color="#101c29"
            round={0.01}
          />
          <Solid
            at={[1.16, y, 1.1]}
            size={[0.11, 0.14, 0.035]}
            color="#96a7b7"
            metal={0.85}
            round={0.02}
          />
        </group>
      ))}
      <group position={[0, 0.58, 1.59]} rotation={[0.1, 0, 0]}>
        <Solid
          size={[2.52, 0.17, 1.05]}
          color="#6a7c93"
          metal={0.45}
          rough={0.4}
          round={0.08}
        />
        <Details pieces={keyboardKeys} color="#182437" />
        <Solid
          at={[0, 0.09, 0.46]}
          size={[0.95, 0.1, 0.12]}
          color="#9aaabc"
          round={0.02}
        />
      </group>
      <Cable
        points={[
          [-1.1, 0.55, 1.9],
          [-1.8, 0.45, 2.2],
          [-2.4, 0.17, 1.4],
          [-2.25, 0.3, 0],
        ]}
      />
      <Cable
        color="#477aca"
        points={[
          [1.54, 3.9, -1.43],
          [2.42, 3.9, -1.5],
          [2.46, 0.5, -1.4],
          [1.5, 0.3, -1.38],
        ]}
      />
    </group>
  );
}

useGLTF.preload(MODEL);
