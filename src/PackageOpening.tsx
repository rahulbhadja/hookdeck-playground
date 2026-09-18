import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import { Solid as Box } from "./Architecture";
import {
  PROVIDER_NAMES,
  parcelDestination,
  type OpenParcel,
  type Parcel,
} from "./parcel";

function receiptTexture(parcel: Parcel) {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 1180;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fffdf6";
  ctx.fillRect(0, 0, 1024, 1180);
  ctx.fillStyle = "#0044cc";
  ctx.fillRect(0, 0, 1024, 16);
  ctx.fillStyle = "#717b8c";
  ctx.font = "500 28px monospace";
  ctx.fillText("WEBHOOK ENCLOSED", 64, 88);
  ctx.fillStyle = "#182131";
  ctx.font = "600 78px sans-serif";
  ctx.fillText(PROVIDER_NAMES[parcel.route.source], 58, 187);
  ctx.font = "500 47px sans-serif";
  ctx.fillText(parcel.title, 64, 256);
  ctx.fillStyle = "#53677f";
  ctx.font = "32px monospace";
  ctx.fillText(parcel.event, 64, 310);
  ctx.fillStyle = "#d9dddF";
  ctx.fillRect(64, 350, 896, 2);
  ctx.fillStyle = "#64738a";
  ctx.font = "29px monospace";
  ctx.fillText("PACKAGE / " + parcel.id, 64, 414);
  const lines = JSON.stringify(parcel.payload, null, 2).split("\n");
  ctx.font = "46px monospace";
  lines.forEach((line, i) => {
    ctx.fillStyle = i === 0 || i === lines.length - 1 ? "#66758a" : "#142b4a";
    ctx.fillText(line, 64, 498 + i * 66);
  });
  ctx.fillStyle = "#d9dddf";
  ctx.fillRect(64, 924, 896, 2);
  ctx.font = "30px sans-serif";
  ctx.fillStyle = "#69778a";
  ctx.fillText("SOURCE", 64, 983);
  ctx.fillText("DESTINATION", 512, 983);
  ctx.font = "500 44px sans-serif";
  ctx.fillStyle = "#182131";
  ctx.fillText(PROVIDER_NAMES[parcel.route.source], 64, 1046);
  ctx.fillText(parcelDestination(parcel.route.destination), 512, 1046);
  ctx.font = "27px monospace";
  ctx.fillStyle = "#7c8694";
  ctx.fillText("SIMULATED WEBHOOK / SAMPLE PAYLOAD", 64, 1129);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

/** The clicked parcel travels from its exact scene position, unfolds, then
 * returns to the same slot. Camera and simulation remain untouched underneath.
 */
export function PackageOpening({
  selection,
  reduceMotion,
  onClose,
}: {
  selection: OpenParcel;
  reduceMotion: boolean;
  onClose: () => void;
}) {
  const { camera, size, invalidate } = useThree();
  const root = useRef<THREE.Group>(null);
  const shade = useRef<THREE.Mesh>(null);
  const shadeMaterial = useRef<THREE.MeshBasicMaterial>(null);
  const flapLeft = useRef<THREE.Group>(null),
    flapRight = useRef<THREE.Group>(null);
  const flapBack = useRef<THREE.Group>(null),
    flapFront = useRef<THREE.Group>(null);
  const paper = useRef<THREE.Group>(null);
  const time = useRef(0);
  const dialog = useRef<HTMLDivElement>(null);
  const [closing, setClosing] = useState(false);
  const receipt = useMemo(
    () => receiptTexture(selection.parcel),
    [selection.parcel],
  );
  const origin = useMemo(
    () => new THREE.Vector3(...selection.position),
    [selection],
  );
  const rotation = useMemo(
    () => new THREE.Quaternion(...selection.rotation),
    [selection],
  );
  const target = useMemo(() => new THREE.Vector3(), []);
  const targetRotation = useMemo(() => new THREE.Quaternion(), []);
  const angle = useMemo(
    () => new THREE.Quaternion().setFromEuler(new THREE.Euler(0.18, -0.25, 0)),
    [],
  );
  useEffect(() => () => receipt.dispose(), [receipt]);
  useEffect(() => {
    invalidate();
  }, [closing, invalidate]);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.focus({ preventScroll: true });
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setClosing(true);
      }
      if (event.key === "Tab") {
        event.preventDefault();
        dialog.current?.focus({ preventScroll: true });
      }
    };
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("keydown", key);
      previous?.focus({ preventScroll: true });
    };
  }, []);
  useFrame((_, dt) => {
    if (!root.current || !paper.current) return;
    const direction = closing ? -1 : 1;
    time.current = reduceMotion
      ? closing
        ? 0
        : 1.5
      : THREE.MathUtils.clamp(
          time.current + direction * Math.min(dt, 0.05) * (closing ? 1.6 : 1),
          0,
          1.5,
        );
    const lift = THREE.MathUtils.smoothstep(time.current, 0, 0.65);
    const open = THREE.MathUtils.smoothstep(time.current, 0.4, 1.1);
    const reveal = THREE.MathUtils.smoothstep(time.current, 0.72, 1.45);
    const distance = 9;
    const height = 2 * distance * Math.tan(THREE.MathUtils.degToRad(42 / 2));
    const scale = Math.min(
      1,
      height / 6.7,
      (height * size.width) / size.height / 6.2,
    );
    target
      .set(0, -1.8 * scale, -distance)
      .applyQuaternion(camera.quaternion)
      .add(camera.position);
    targetRotation.copy(camera.quaternion).multiply(angle);
    root.current.position.lerpVectors(origin, target, lift);
    root.current.quaternion.copy(rotation).slerp(targetRotation, lift);
    root.current.scale.setScalar(THREE.MathUtils.lerp(0.14, scale, lift));
    if (flapLeft.current) flapLeft.current.rotation.z = -open * 2.25;
    if (flapRight.current) flapRight.current.rotation.z = open * 2.25;
    if (flapBack.current) flapBack.current.rotation.x = open * 2.3;
    if (flapFront.current) flapFront.current.rotation.x = -open * 2.3;
    paper.current.position.y = -0.65 + reveal * 3.5;
    paper.current.scale.setScalar(0.6 + reveal * 0.4);
    paper.current.visible = reveal > 0.04;
    if (shade.current) {
      shade.current.position
        .set(0, 0, -13)
        .applyQuaternion(camera.quaternion)
        .add(camera.position);
      shade.current.quaternion.copy(camera.quaternion);
    }
    if (shadeMaterial.current) shadeMaterial.current.opacity = lift * 0.92;
    if (closing && time.current === 0) onClose();
    else if (time.current < 1.5 || closing) invalidate();
  });
  const inside = new THREE.Color(selection.color)
    .lerp(new THREE.Color("#192638"), 0.35)
    .getStyle();
  return (
    <>
      <mesh
        ref={shade}
        onBeforeRender={(renderer) => renderer.clearDepth()}
        renderOrder={25}
        onClick={(e) => {
          e.stopPropagation();
          setClosing(true);
        }}
      >
        <planeGeometry args={[250, 250]} />
        <meshBasicMaterial
          ref={shadeMaterial}
          color="#141412"
          toneMapped={false}
          transparent
          depthWrite={false}
          depthTest={false}
        />
      </mesh>
      <group ref={root} renderOrder={30} onClick={(e) => e.stopPropagation()}>
        <group
          onUpdate={(group) =>
            group.traverse((object) => {
              object.renderOrder = 30;
              if (object instanceof THREE.Mesh) {
                for (const material of Array.isArray(object.material)
                  ? object.material
                  : [object.material]) {
                  material.transparent = true;
                  material.needsUpdate = true;
                }
              }
            })
          }
        >
          <Box
            at={[0, -0.69, 0]}
            size={[2.8, 0.13, 2.8]}
            color={inside}
            round={0.035}
          />
          <Box
            at={[-1.35, 0, 0]}
            size={[0.12, 1.38, 2.8]}
            color={selection.color}
            round={0.035}
          />
          <Box
            at={[1.35, 0, 0]}
            size={[0.12, 1.38, 2.8]}
            color={selection.color}
            round={0.035}
          />
          <Box
            at={[0, 0, -1.35]}
            size={[2.8, 1.38, 0.12]}
            color={selection.color}
            round={0.035}
          />
          <Box
            at={[0, 0, 1.35]}
            size={[2.8, 1.38, 0.12]}
            color={selection.color}
            round={0.035}
          />
          <Box
            at={[0, 0, 1.422]}
            size={[0.34, 1.36, 0.016]}
            color="#f5ead4"
            round={0}
          />
          <group ref={flapLeft} position={[-1.38, 0.7, 0]}>
            <Box
              at={[0.7, 0, 0]}
              size={[1.4, 0.055, 2.72]}
              color={selection.color}
              round={0.02}
            />
          </group>
          <group ref={flapRight} position={[1.38, 0.7, 0]}>
            <Box
              at={[-0.7, 0, 0]}
              size={[1.4, 0.055, 2.72]}
              color={selection.color}
              round={0.02}
            />
          </group>
          <group ref={flapBack} position={[0, 0.75, -1.38]}>
            <Box
              at={[0, 0, 0.69]}
              size={[2.8, 0.06, 1.39]}
              color={selection.color}
              round={0.02}
            />
          </group>
          <group ref={flapFront} position={[0, 0.75, 1.38]}>
            <Box
              at={[0, 0, -0.69]}
              size={[2.8, 0.06, 1.39]}
              color={selection.color}
              round={0.02}
            />
            <Box
              at={[0, 0.039, -0.69]}
              size={[0.34, 0.012, 1.39]}
              color="#f5ead4"
              round={0}
            />
          </group>
          <group ref={paper} position={[0, -0.65, 0.1]}>
            <mesh renderOrder={32} position={[0.04, -0.04, -0.02]}>
              <planeGeometry args={[3.5, 4.0]} />
              <meshBasicMaterial color="#071021" transparent opacity={0.22} />
            </mesh>
            <mesh renderOrder={33}>
              <planeGeometry args={[3.5, 4.0]} />
              <meshBasicMaterial
                map={receipt}
                toneMapped={false}
                side={THREE.DoubleSide}
              />
            </mesh>
          </group>
        </group>
      </group>
      <Html
        fullscreen
        calculatePosition={() => [size.width / 2, size.height / 2]}
        zIndexRange={[50, 40]}
        style={{ pointerEvents: "none" }}
      >
        <div
          ref={dialog}
          className="parcel-controls"
          tabIndex={-1}
          role="dialog"
          aria-modal="true"
          aria-label={`${PROVIDER_NAMES[selection.parcel.route.source]} package ${selection.parcel.id}`}
        >
          <div className="sr-only">
            <h2>{selection.parcel.title}</h2>
            <p>{selection.parcel.event}</p>
            <pre>{JSON.stringify(selection.parcel.payload, null, 2)}</pre>
            <p>
              Source: {PROVIDER_NAMES[selection.parcel.route.source]}.
              Destination:{" "}
              {parcelDestination(selection.parcel.route.destination)}. Simulated
              sample payload.
            </p>
            <p>Press Escape or click outside the package to close.</p>
          </div>
        </div>
      </Html>
    </>
  );
}
