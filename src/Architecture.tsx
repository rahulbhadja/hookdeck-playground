import { memo } from "react";
import { Environment, Lightformer, RoundedBox } from "@react-three/drei";
import * as THREE from "three";

type Vec = [number, number, number];

// Fine surface grain breaks up the perfectly smooth plastic appearance.
const surfaceGrain = (() => {
  const bytes = new Uint8Array(128 * 128 * 4);
  let seed = 1973;
  for (let i = 0; i < bytes.length; i += 4) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const value = 185 + (seed % 70);
    bytes[i] = bytes[i + 1] = bytes[i + 2] = value;
    bytes[i + 3] = 255;
  }
  const texture = new THREE.DataTexture(bytes, 128, 128);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(3, 3);
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
})();

export function Solid({
  at = [0, 0, 0],
  size,
  color,
  round = 0.04,
  metal = 0.04,
  rough = 0.62,
  glow = 0,
  lighting,
}: {
  at?: Vec;
  size: Vec;
  color: string;
  round?: number;
  metal?: number;
  rough?: number;
  glow?: number;
  lighting?: "accent";
}) {
  return (
    <RoundedBox
      position={at}
      args={size}
      radius={Math.max(0.001, Math.min(round, Math.min(...size) / 2 - 0.001))}
      smoothness={3}
      bevelSegments={3}
      castShadow
      receiveShadow
    >
      <meshPhysicalMaterial
        name={lighting ? `building-${lighting}` : undefined}
        color={color}
        metalness={metal}
        roughness={rough}
        bumpMap={rough > 0.35 ? surfaceGrain : null}
        bumpScale={metal > 0.4 ? 0.004 : 0.018}
        clearcoat={metal > 0.4 ? 0.22 : 0.04}
        clearcoatRoughness={0.4}
        emissive={color}
        emissiveIntensity={glow}
      />
    </RoundedBox>
  );
}

export const StudioReflections = memo(function StudioReflections() {
  return (
    <Environment resolution={128} frames={1} environmentIntensity={0.65}>
      <Lightformer
        form="rect"
        intensity={3}
        color="#f1f5ff"
        position={[-6, 9, 5]}
        scale={[8, 6, 1]}
        target={[0, 0, 0]}
      />
      <Lightformer
        form="rect"
        intensity={2}
        color="#90b4f9"
        position={[8, 5, -6]}
        scale={[5, 9, 1]}
        target={[0, 0, 0]}
      />
      <Lightformer
        form="rect"
        intensity={1.8}
        color="#ffffff"
        position={[2, 8, 9]}
        scale={[2, 8, 1]}
        target={[0, 0, 0]}
      />
    </Environment>
  );
});
