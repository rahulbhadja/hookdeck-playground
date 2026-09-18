import { useLayoutEffect, useMemo, useRef, type ReactNode } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

type Mode = "idle" | "active" | "healthy" | "overloaded" | "offline";
type LitSurface = {
  material: THREE.MeshStandardMaterial;
  role: string;
  height: number;
};
const warmWhite = new THREE.Color("#fff1cf");

const lightPool = (() => {
  const size = 64;
  const pixels = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const radius = Math.hypot(
        (x / (size - 1) - 0.5) * 2,
        (y / (size - 1) - 0.5) * 2,
      );
      const i = (y * size + x) * 4;
      pixels[i] = pixels[i + 1] = pixels[i + 2] = 255;
      pixels[i + 3] = Math.round(Math.max(0, 1 - radius) ** 2 * 255);
    }
  }
  const texture = new THREE.DataTexture(pixels, size, size);
  texture.magFilter = texture.minFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
})();

/** Light the architecture itself without rebuilding it or adding status overlays. */
export function BuildingLighting({
  children,
  color,
  mode,
  reduceMotion,
  size = 6.8,
  facadeZ = 1.9,
  activity = 1,
  staggerRecovery = false,
  paused = false,
}: {
  children: ReactNode;
  color: string;
  mode: Mode;
  reduceMotion: boolean;
  size?: number;
  facadeZ?: number;
  activity?: number;
  staggerRecovery?: boolean;
  paused?: boolean;
}) {
  const root = useRef<THREE.Group>(null);
  const invalidate = useThree((state) => state.invalidate);
  const surfaces = useRef<LitSurface[]>([]);
  const light = useRef<THREE.PointLight>(null);
  const pool = useRef<THREE.MeshBasicMaterial>(null);
  const previousMode = useRef(mode);
  const recoveryAge = useRef(10);
  const targetColor = useMemo(() => new THREE.Color(color), [color]);
  const tint = useRef(new THREE.Color(color));
  const windowTint = useRef(new THREE.Color());
  const strength = useRef(
    mode === "active" || mode === "overloaded"
      ? activity
      : mode === "healthy"
        ? 0.55
        : 0,
  );
  const target =
    mode === "active" || mode === "overloaded"
      ? activity
      : mode === "healthy"
        ? 0.55
        : 0;
  const idle = mode === "offline" ? 0 : 0.1;

  useLayoutEffect(() => {
    const materials = new Map<THREE.MeshStandardMaterial, number>();
    root.current?.updateWorldMatrix(true, true);
    const point = new THREE.Vector3();
    root.current?.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      for (const material of Array.isArray(object.material)
        ? object.material
        : [object.material]) {
        if (
          material instanceof THREE.MeshStandardMaterial &&
          material.name.startsWith("building-")
        ) {
          object.getWorldPosition(point);
          root.current!.worldToLocal(point);
          materials.set(material, point.y);
        }
      }
    });
    surfaces.current = [...materials].map(([material, height]) => ({
      material,
      role: material.name,
      height,
    }));
  }, []);

  useFrame((_, dt) => {
    if (
      staggerRecovery &&
      previousMode.current === "offline" &&
      mode !== "offline"
    )
      recoveryAge.current = 0;
    previousMode.current = mode;
    if (reduceMotion) recoveryAge.current = 10;
    else if (!paused) recoveryAge.current += Math.min(dt, 0.1);
    // The short response still runs while paused so user actions are visible.
    const blend = reduceMotion ? 1 : 1 - Math.exp(-12 * Math.min(dt, 0.1));
    strength.current = THREE.MathUtils.lerp(strength.current, target, blend);
    tint.current.lerp(targetColor, blend);
    const unsettled =
      Math.abs(strength.current - target) > 0.001 ||
      Math.abs(tint.current.r - targetColor.r) +
        Math.abs(tint.current.g - targetColor.g) +
        Math.abs(tint.current.b - targetColor.b) >
        0.001;
    if (unsettled) invalidate();
    else {
      strength.current = target;
      tint.current.copy(targetColor);
    }
    windowTint.current.copy(tint.current).lerp(warmWhite, 0.22);
    for (const { material, role, height } of surfaces.current) {
      const window = role === "building-window" || role === "building-lantern";
      const floorLight =
        staggerRecovery && window && mode !== "offline"
          ? THREE.MathUtils.smoothstep(
              recoveryAge.current - Math.max(0, height) * 0.24,
              0,
              0.45,
            )
          : 1;
      material.emissive.copy(window ? windowTint.current : tint.current);
      material.emissiveIntensity = window
        ? (idle + strength.current * 2.1) * floorLight
        : role === "building-roof"
          ? strength.current * 0.32
          : role === "building-accent"
            ? idle + strength.current * 2.4
            : strength.current * 0.085;
    }
    if (
      staggerRecovery &&
      recoveryAge.current < 1.7 &&
      !paused &&
      !reduceMotion
    )
      invalidate();
    if (light.current) {
      light.current.color.copy(tint.current);
      light.current.intensity = strength.current * 9;
    }
    if (pool.current) {
      pool.current.color.copy(tint.current);
      pool.current.opacity = strength.current * 0.64;
    }
  });

  return (
    <group ref={root}>
      {children}
      <pointLight
        ref={light}
        position={[0, 1.1, facadeZ]}
        intensity={0}
        distance={6}
        decay={2}
      />
      <mesh
        position={[0, -0.375, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        raycast={() => {}}
      >
        <planeGeometry args={[size, size]} />
        <meshBasicMaterial
          ref={pool}
          map={lightPool}
          transparent
          opacity={0}
          depthWrite={false}
          toneMapped={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
    </group>
  );
}
