import { memo, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { SVGLoader } from "three/examples/jsm/loaders/SVGLoader.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import hookdeckSvg from "../public/logos/hookdeck.svg?raw";
import { BRAND } from "./brands";

type Vec = [number, number, number];
type Placement = { at: Vec; size: Vec };
const stone = "#b5afa0";
const paleStone = "#d5ceba";

// Repeatable, locally generated masonry and slate. Courses keep world-space
// proportions on every face, including the sides seen when orbiting the town.
function courses(rows: number, columns: number, mortar: number) {
  const n = 256;
  const data = new Uint8Array(n * n * 4);
  for (let y = 0; y < n; y++) {
    const row = Math.floor((y * rows) / n);
    for (let x = 0; x < n; x++) {
      const bx = (x + ((row % 2) * n) / columns / 2) % n;
      const col = Math.floor((bx * columns) / n);
      const seam =
        ((y * rows) / n) % 1 < mortar || ((bx * columns) / n) % 1 < mortar / 2;
      const noise = ((x * 73 + y * 59 + x * y * 17) % 23) - 11;
      const block = ((row * 13 + col * 19) % 7) * 4;
      const value = seam ? 128 + noise / 2 : 234 - block + noise;
      const i = (y * n + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = value;
      data[i + 3] = 255;
    }
  }
  const map = new THREE.DataTexture(data, n, n);
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.magFilter = THREE.LinearFilter;
  map.minFilter = THREE.LinearMipmapLinearFilter;
  map.generateMipmaps = true;
  map.anisotropy = 4;
  map.needsUpdate = true;
  return map;
}
const stoneMap = courses(8, 4, 0.055);
const brickMap = courses(16, 7, 0.07);
const slateMap = courses(14, 8, 0.045);
const unitBox = new THREE.BoxGeometry(1, 1, 1);

function Block({
  at = [0, 0, 0],
  size,
  color = stone,
}: {
  at?: Vec;
  size: Vec;
  color?: string;
}) {
  return (
    <mesh
      position={at}
      scale={size}
      geometry={unitBox}
      castShadow
      receiveShadow
    >
      <meshStandardMaterial color={color} roughness={0.88} />
    </mesh>
  );
}
function Masonry({
  at,
  size,
  color,
  brick = false,
}: {
  at: Vec;
  size: Vec;
  color: string;
  brick?: boolean;
}) {
  const [w, h, d] = size;
  const geometry = useMemo(() => {
    const g = new THREE.BoxGeometry(w, h, d);
    const uv = g.attributes.uv;
    const faces = [
      [d, h],
      [d, h],
      [w, d],
      [w, d],
      [w, h],
      [w, h],
    ];
    for (let i = 0; i < uv.count; i++) {
      const face = faces[Math.floor(i / 4)];
      uv.setXY(i, (uv.getX(i) * face[0]) / 2, (uv.getY(i) * face[1]) / 2);
    }
    return g;
  }, [w, h, d]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <mesh position={at} geometry={geometry} castShadow receiveShadow>
      <meshStandardMaterial
        name="building-facade"
        color={color}
        map={brick ? brickMap : stoneMap}
        bumpMap={brick ? brickMap : stoneMap}
        bumpScale={0.028}
        roughness={0.95}
      />
    </mesh>
  );
}
// Small architectural repeats are one draw call per material, not one per stone.
function Repeats({
  pieces,
  color = stone,
}: {
  pieces: Placement[];
  color?: string;
}) {
  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    if (!ref.current) return;
    const object = new THREE.Object3D();
    pieces.forEach(({ at, size }, i) => {
      object.position.set(...at);
      object.scale.set(...size);
      object.updateMatrix();
      ref.current!.setMatrixAt(i, object.matrix);
    });
    ref.current.instanceMatrix.needsUpdate = true;
    ref.current.computeBoundingSphere();
  }, [pieces]);
  return (
    <instancedMesh
      ref={ref}
      args={[unitBox, undefined, pieces.length]}
      castShadow
      receiveShadow
    >
      <meshStandardMaterial color={color} roughness={0.85} />
    </instancedMesh>
  );
}
function Cornice({
  y,
  w,
  d,
  color = paleStone,
  dentils = false,
}: {
  y: number;
  w: number;
  d: number;
  color?: string;
  dentils?: boolean;
}) {
  const pieces: Placement[] = [
    { at: [0, y, 0], size: [w, 0.07, d] },
    { at: [0, y + 0.07, 0], size: [w + 0.09, 0.07, d + 0.09] },
    { at: [0, y + 0.14, 0], size: [w + 0.21, 0.065, d + 0.21] },
  ];
  if (dentils) {
    for (let x = -w / 2 + 0.1; x < w / 2; x += 0.19) {
      for (const z of [-1, 1])
        pieces.push({
          at: [x, y - 0.07, (z * d) / 2],
          size: [0.085, 0.15, 0.12],
        });
    }
    for (let z = -d / 2 + 0.1; z < d / 2; z += 0.19) {
      for (const x of [-1, 1])
        pieces.push({
          at: [(x * w) / 2, y - 0.07, z],
          size: [0.12, 0.15, 0.085],
        });
    }
  }
  return <Repeats pieces={pieces} color={color} />;
}
function Quoins({
  w,
  d,
  height,
  color = paleStone,
}: {
  w: number;
  d: number;
  height: number;
  color?: string;
}) {
  const pieces: Placement[] = [];
  for (let y = 0.28, i = 0; y < height; y += 0.25, i++) {
    for (const x of [-1, 1])
      for (const z of [-1, 1]) {
        pieces.push({
          at: [x * (w / 2 - 0.09), y, z * (d / 2 - 0.025)],
          size: [i % 2 ? 0.22 : 0.34, 0.22, 0.12],
        });
        pieces.push({
          at: [x * (w / 2 - 0.025), y, z * (d / 2 - 0.09)],
          size: [0.12, 0.22, i % 2 ? 0.34 : 0.22],
        });
      }
  }
  return <Repeats pieces={pieces} color={color} />;
}
function archShape(w: number, h: number, pointed = false) {
  const r = w / 2;
  const spring = h - r;
  const s = new THREE.Shape().moveTo(-r, 0).lineTo(r, 0).lineTo(r, spring);
  if (pointed)
    s.quadraticCurveTo(r * 0.85, h - r * 0.25, 0, h).quadraticCurveTo(
      -r * 0.85,
      h - r * 0.25,
      -r,
      spring,
    );
  else s.absarc(0, spring, r, 0, Math.PI, false);
  return s.lineTo(-r, 0).closePath();
}
function ArchWindow({
  at,
  w = 0.42,
  h = 0.7,
  side = 0,
  trim = paleStone,
  pointed = false,
  lit = true,
}: {
  at: Vec;
  w?: number;
  h?: number;
  side?: number;
  trim?: string;
  pointed?: boolean;
  lit?: boolean;
}) {
  const parts = useMemo(() => {
    const t = 0.07;
    const outer = archShape(w + t * 2, h + t * 2, pointed);
    const inner = archShape(w, h, pointed);
    outer.holes.push(
      new THREE.Path(
        inner
          .getPoints(20)
          .reverse()
          .map((p) => p.add(new THREE.Vector2(0, t))),
      ),
    );
    const frame = new THREE.ExtrudeGeometry(outer, {
      depth: 0.12,
      bevelEnabled: true,
      bevelSize: 0.012,
      bevelThickness: 0.012,
      bevelSegments: 1,
      curveSegments: 16,
    });
    frame.translate(0, -t, 0);
    const glass = new THREE.ShapeGeometry(inner, 16);
    const a = new THREE.BoxGeometry(0.027, h - w * 0.23, 0.028).translate(
      0,
      (h - w * 0.23) / 2,
      0.09,
    );
    const b = new THREE.BoxGeometry(w, 0.026, 0.028).translate(
      0,
      h * 0.42,
      0.09,
    );
    const sash = mergeGeometries([a, b]);
    a.dispose();
    b.dispose();
    return { frame, glass, sash };
  }, [w, h, pointed]);
  useEffect(
    () => () => Object.values(parts).forEach((p) => p.dispose()),
    [parts],
  );
  return (
    <group position={at} rotation={[0, side, 0]}>
      <mesh geometry={parts.frame} castShadow receiveShadow>
        <meshStandardMaterial color={trim} roughness={0.82} />
      </mesh>
      <mesh geometry={parts.glass} position={[0, 0, 0.015]}>
        <meshStandardMaterial
          name="building-window"
          color={lit ? "#514c37" : "#18212b"}
          roughness={0.25}
          metalness={0.35}
          emissive={lit ? "#dcac57" : "#000000"}
          emissiveIntensity={0.24}
        />
      </mesh>
      <mesh geometry={parts.sash} castShadow>
        <meshStandardMaterial color="#313436" roughness={0.68} />
      </mesh>
      <Block
        at={[0, -0.07, 0.09]}
        size={[w + 0.24, 0.085, 0.27]}
        color={trim}
      />
      <Block at={[0, h + 0.055, 0.09]} size={[0.12, 0.15, 0.16]} color={trim} />
    </group>
  );
}
function HipRoof({
  at,
  w,
  d,
  h,
  color,
  top = 0.32,
}: {
  at: Vec;
  w: number;
  d: number;
  h: number;
  color: string;
  top?: number;
}) {
  const geometry = useMemo(() => {
    const corners = [
      [-w / 2, 0, d / 2],
      [w / 2, 0, d / 2],
      [w / 2, 0, -d / 2],
      [-w / 2, 0, -d / 2],
    ];
    const g = new THREE.BufferGeometry();
    const verts: number[] = [],
      uvs: number[] = [];
    for (let i = 0; i < 4; i++) {
      const a = corners[i],
        b = corners[(i + 1) % 4];
      const c = [b[0] * top, h, b[2] * top],
        e = [a[0] * top, h, a[2] * top];
      verts.push(...a, ...b, ...c, ...a, ...c, ...e);
      const len = i % 2 ? d : w;
      uvs.push(
        0,
        0,
        len / 2,
        0,
        (len * (1 + top)) / 4,
        h / 2,
        0,
        0,
        (len * (1 + top)) / 4,
        h / 2,
        (len * (1 - top)) / 4,
        h / 2,
      );
    }
    // The flat ridge cap closes the model when viewed from above.
    const tw = (w * top) / 2,
      td = (d * top) / 2;
    verts.push(
      -tw,
      h,
      td,
      tw,
      h,
      td,
      tw,
      h,
      -td,
      -tw,
      h,
      td,
      tw,
      h,
      -td,
      -tw,
      h,
      -td,
    );
    uvs.push(
      0,
      0,
      (w * top) / 2,
      0,
      (w * top) / 2,
      (d * top) / 2,
      0,
      0,
      (w * top) / 2,
      (d * top) / 2,
      0,
      (d * top) / 2,
    );
    g.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    g.computeVertexNormals();
    return g;
  }, [w, d, h, top]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <mesh position={at} geometry={geometry} castShadow receiveShadow>
      <meshStandardMaterial
        name="building-roof"
        color={color}
        map={slateMap}
        bumpMap={slateMap}
        bumpScale={0.045}
        roughness={0.78}
        metalness={0.08}
      />
    </mesh>
  );
}
function Pediment({
  at,
  w,
  h,
  color = paleStone,
}: {
  at: Vec;
  w: number;
  h: number;
  color?: string;
}) {
  const geometry = useMemo(
    () =>
      new THREE.ExtrudeGeometry(
        new THREE.Shape()
          .moveTo(-w / 2, 0)
          .lineTo(w / 2, 0)
          .lineTo(0, h)
          .closePath(),
        {
          depth: 0.17,
          bevelEnabled: true,
          bevelThickness: 0.035,
          bevelSize: 0.025,
          bevelSegments: 1,
        },
      ),
    [w, h],
  );
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <mesh position={at} geometry={geometry} castShadow receiveShadow>
      <meshStandardMaterial color={color} roughness={0.88} />
    </mesh>
  );
}
function Steps({ w, z }: { w: number; z: number }) {
  return (
    <Repeats
      color={stone}
      pieces={[0, 1, 2].map((i) => ({
        at: [0, 0.11 + i * 0.075, z - i * 0.11],
        size: [w - i * 0.12, 0.08, 0.38],
      }))}
    />
  );
}
function Chimney({ at, color = stone }: { at: Vec; color?: string }) {
  return (
    <group position={at}>
      <Masonry at={[0, 0.22, 0]} size={[0.25, 0.6, 0.32]} color={color} brick />
      <Block at={[0, 0.51, 0]} size={[0.33, 0.085, 0.4]} color={paleStone} />
      <Block at={[0, 0.558, 0]} size={[0.17, 0.02, 0.24]} color="#27292c" />
    </group>
  );
}
function Lantern({ at, off = false }: { at: Vec; off?: boolean }) {
  return (
    <group position={at}>
      <Block size={[0.14, 0.22, 0.14]} color="#252a2b" />
      <mesh position={[0, 0, 0.074]}>
        <planeGeometry args={[0.095, 0.14]} />
        <meshStandardMaterial
          name="building-lantern"
          color="#f6d38d"
          emissive="#ffb64c"
          emissiveIntensity={off ? 0 : 1.1}
        />
      </mesh>
      <HipRoof
        at={[0, 0.11, 0]}
        w={0.2}
        d={0.2}
        h={0.12}
        color="#313d40"
        top={0.02}
      />
    </group>
  );
}
function Dormer({
  x,
  y,
  z,
  color,
}: {
  x: number;
  y: number;
  z: number;
  color: string;
}) {
  return (
    <group position={[x, y, z]}>
      <Masonry
        at={[0, 0.26, -0.04]}
        size={[0.52, 0.54, 0.34]}
        color={paleStone}
      />
      <ArchWindow at={[0, 0.03, 0.142]} w={0.25} h={0.39} />
      <HipRoof
        at={[0, 0.53, 0]}
        w={0.72}
        d={0.64}
        h={0.34}
        color={color}
        top={0.02}
      />
    </group>
  );
}

export const ShopifyBuilding = memo(function ShopifyBuilding() {
  return (
    <group>
      <Masonry at={[0, 1.47, 0]} size={[2.16, 2.73, 1.92]} color="#a69d80" />
      <Cornice y={0.17} w={2.2} d={1.96} color="#807b65" />
      <Quoins w={2.16} d={1.92} height={2.8} color="#c4c5a4" />
      <Cornice y={1.32} w={2.2} d={1.95} color="#c4c5a4" />
      <Cornice y={2.74} w={2.26} d={2.01} color="#d3d0b1" dentils />
      {[-0.65, 0, 0.65].map((x, i) => (
        <ArchWindow
          key={x}
          at={[x, 1.74, 0.972]}
          w={0.36}
          h={0.71}
          lit={i !== 2}
          trim="#d3d0b1"
        />
      ))}
      {[-0.53, 0.53].map((z) => (
        <ArchWindow
          key={z}
          at={[1.09, 1.73, z]}
          w={0.43}
          h={0.72}
          side={Math.PI / 2}
          trim="#d3d0b1"
        />
      ))}
      <ArchWindow at={[0, 0.32, 0.975]} w={0.62} h={0.92} trim="#ced2ab" />
      {[-0.72, 0.72].map((x) => (
        <ArchWindow
          key={x}
          at={[x, 0.4, 0.976]}
          w={0.32}
          h={0.75}
          trim="#d3d0b1"
        />
      ))}
      <Block at={[0, 1.47, 1.025]} size={[1.7, 0.18, 0.14]} color="#588125" />
      <HipRoof
        at={[0, 2.94, 0]}
        w={2.62}
        d={2.38}
        h={0.97}
        top={0.5}
        color="#668f32"
      />
      <HipRoof
        at={[0, 3.91, 0]}
        w={1.31}
        d={1.19}
        h={0.22}
        top={0.06}
        color="#507329"
      />
      {[-0.58, 0.58].map((x) => (
        <Dormer key={x} x={x} y={3.04} z={0.85} color="#729a3b" />
      ))}
      <Chimney at={[-0.84, 3.42, -0.55]} color="#98947d" />
      <Steps w={1.1} z={1.21} />
      {[-0.97, 0.97].map((x) => (
        <Lantern key={x} at={[x, 1.08, 1.04]} />
      ))}
      {[0.43, 1.74].flatMap((y) =>
        [-0.58, 0.58].map((x) => (
          <ArchWindow
            key={`back-${x}-${y}`}
            at={[x, y, -0.973]}
            w={0.4}
            h={0.7}
            side={Math.PI}
            trim="#d3d0b1"
            lit={x > 0}
          />
        )),
      )}
      {[-0.53, 0.53].map((z) => (
        <ArchWindow
          key={`left-${z}`}
          at={[-1.09, 1.73, z]}
          w={0.43}
          h={0.72}
          side={-Math.PI / 2}
          trim="#d3d0b1"
        />
      ))}
    </group>
  );
});

export const StripeBuilding = memo(function StripeBuilding() {
  return (
    <group>
      <Masonry at={[0, 1.77, 0]} size={[2.22, 3.33, 1.98]} color="#b8afbb" />
      <Quoins w={2.22} d={1.98} height={3.4} color="#ccc4d1" />
      <Cornice y={0.17} w={2.29} d={2.03} />
      <Cornice y={1.28} w={2.26} d={2.02} color="#c4bacb" />
      <Cornice y={3.38} w={2.35} d={2.12} color="#d4cddd" dentils />
      {[1.62, 2.58].flatMap((y) =>
        [-0.65, 0, 0.65].map((x) => (
          <ArchWindow
            key={`${x}${y}`}
            at={[x, y, 1.0]}
            w={0.34}
            h={0.58}
            trim="#d6cddd"
            lit={x !== 0 || y < 2}
          />
        )),
      )}
      {[1.62, 2.58].flatMap((y) =>
        [-0.55, 0.55].map((z) => (
          <ArchWindow
            key={`${z}${y}`}
            at={[1.124, y, z]}
            w={0.4}
            h={0.58}
            side={Math.PI / 2}
            trim="#d6cddd"
          />
        )),
      )}
      <ArchWindow at={[0, 0.29, 1.007]} w={0.66} h={0.89} trim="#d6cddd" />
      {[-0.78, 0.78].map((x) => (
        <group key={x}>
          <Block
            at={[x, 0.8, 1.075]}
            size={[0.18, 0.98, 0.22]}
            color="#bdb1cc"
          />
          <Block
            at={[x, 0.34, 1.075]}
            size={[0.3, 0.16, 0.32]}
            color="#d6cddd"
          />
          <Block
            at={[x, 1.25, 1.075]}
            size={[0.31, 0.16, 0.33]}
            color="#d6cddd"
          />
        </group>
      ))}
      <HipRoof
        at={[0, 3.59, 0]}
        w={2.68}
        d={2.43}
        h={0.93}
        top={0.45}
        color="#6350ad"
      />
      <HipRoof
        at={[0, 4.52, 0]}
        w={1.22}
        d={1.11}
        h={0.23}
        top={0.05}
        color="#453b76"
      />
      <Dormer x={0} y={3.74} z={0.86} color="#7763c8" />
      <Chimney at={[-0.9, 4, -0.48]} color="#a9a0b2" />
      <Steps w={1.32} z={1.22} />
      <Block at={[0, 1.42, 1.02]} size={[1.7, 0.16, 0.15]} color="#635bff" />
      <Lantern at={[-0.46, 0.99, 1.16]} />
      <Lantern at={[0.46, 0.99, 1.16]} />
      {[0.43, 1.62, 2.58].flatMap((y) =>
        [-0.61, 0, 0.61].map((x) => (
          <ArchWindow
            key={`back-${x}-${y}`}
            at={[x, y, -1.005]}
            w={0.34}
            h={0.58}
            side={Math.PI}
            trim="#d6cddd"
            lit={x < 0}
          />
        )),
      )}
      {[1.62, 2.58].flatMap((y) =>
        [-0.55, 0.55].map((z) => (
          <ArchWindow
            key={`left-${z}-${y}`}
            at={[-1.124, y, z]}
            w={0.4}
            h={0.58}
            side={-Math.PI / 2}
            trim="#d6cddd"
          />
        )),
      )}
    </group>
  );
});

export const WhatsAppBuilding = memo(function WhatsAppBuilding() {
  return (
    <group>
      <Masonry at={[0, 1.42, 0]} size={[2.18, 2.62, 1.96]} color="#719787" />
      <Cornice y={0.16} w={2.26} d={2.04} color="#9cb6a8" />
      <Quoins w={2.18} d={1.96} height={2.6} color="#bfd3c2" />
      <Cornice y={1.17} w={2.22} d={2.02} color="#bfd3c2" />
      <Cornice y={2.66} w={2.33} d={2.12} color="#d9e1cf" dentils />
      {[-0.59, 0.59].map((x) => (
        <ArchWindow
          key={x}
          at={[x, 1.53, 0.997]}
          w={0.53}
          h={0.89}
          trim="#e0e4d2"
        />
      ))}
      {[-0.53, 0.53].map((z) => (
        <ArchWindow
          key={z}
          at={[1.104, 1.54, z]}
          w={0.45}
          h={0.9}
          trim="#c6d6c7"
          side={Math.PI / 2}
        />
      ))}
      <ArchWindow at={[0, 0.27, 1.01]} w={0.67} h={0.95} trim="#d0ddcf" />
      <HipRoof
        at={[0, 2.88, 0]}
        w={2.68}
        d={2.45}
        h={1.1}
        top={0.12}
        color={BRAND.whatsapp.primary}
      />
      <Dormer x={0} y={2.89} z={0.86} color="#189d61" />
      {[-1, 1].map((x) => (
        <group key={x} position={[x * 1.03, 0, -0.6]}>
          <Masonry
            at={[0, 1.51, 0]}
            size={[0.42, 2.85, 0.54]}
            color="#789c8a"
          />
          <Block at={[0, 2.99, 0]} size={[0.6, 0.17, 0.7]} color="#c4d7c8" />
          <HipRoof
            at={[0, 3.075, 0]}
            w={0.67}
            d={0.77}
            h={0.98}
            color={BRAND.whatsapp.dark}
            top={0.02}
          />
          <mesh position={[0, 4.09, 0]}>
            <sphereGeometry args={[0.045, 8, 8]} />
            <meshStandardMaterial
              color="#dfd7ac"
              metalness={0.55}
              roughness={0.4}
            />
          </mesh>
        </group>
      ))}
      <Steps w={1.17} z={1.23} />
      <Lantern at={[-0.73, 0.94, 1.045]} />
      <Lantern at={[0.73, 0.94, 1.045]} />
      {[-0.56, 0.56].map((x) => (
        <ArchWindow
          key={`back-${x}`}
          at={[x, 1.53, -0.997]}
          w={0.46}
          h={0.89}
          side={Math.PI}
          trim="#bbcbbb"
          lit={false}
        />
      ))}
      {[-0.53, 0.53].map((z) => (
        <ArchWindow
          key={`left-${z}`}
          at={[-1.104, 1.54, z]}
          w={0.45}
          h={0.9}
          trim="#c6d6c7"
          side={-Math.PI / 2}
        />
      ))}
    </group>
  );
});

export const AppArchitecture = memo(function AppArchitecture({
  offline,
  stress,
}: {
  offline: boolean;
  stress: boolean;
}) {
  const brick = offline ? "#5d6065" : stress ? "#965145" : "#a06b4e";
  const trim = offline ? "#82888d" : "#d2b894";
  const roof = offline ? "#4d585c" : "#785b42";
  return (
    <group>
      <Masonry
        at={[0, 1.68, 0]}
        size={[2.34, 3.14, 2.06]}
        color={brick}
        brick
      />
      <Quoins w={2.34} d={2.06} height={3.17} color={trim} />
      <Cornice y={0.17} w={2.41} d={2.13} color={trim} />
      <Cornice y={1.25} w={2.39} d={2.11} color={trim} />
      <Cornice y={3.16} w={2.48} d={2.23} color={trim} dentils />
      <ArchWindow
        at={[0, 0.29, 1.043]}
        w={0.68}
        h={0.91}
        trim={trim}
        lit={!offline}
      />
      {[-0.83, 0.83].map((x) => (
        <ArchWindow
          key={x}
          at={[x, 0.45, 1.042]}
          w={0.29}
          h={0.59}
          trim={trim}
          lit={!offline}
        />
      ))}
      {[0.42, 1.55, 2.48].flatMap((y) =>
        [-0.57, 0.57].map((z) => (
          <ArchWindow
            key={`${z}${y}`}
            at={[1.182, y, z]}
            w={0.42}
            h={0.59}
            side={Math.PI / 2}
            trim={trim}
            lit={!offline}
          />
        )),
      )}
      {/* A carved surround houses the app's live expression. */}
      <Block at={[0, 2.2, 1.052]} size={[1.78, 1.12, 0.19]} color={trim} />
      <Block at={[0, 2.2, 1.155]} size={[1.52, 0.88, 0.032]} color="#172329" />
      <Pediment at={[0, 2.8, 1.02]} w={1.92} h={0.34} color={trim} />
      <Block at={[0, 1.63, 1.125]} size={[1.96, 0.12, 0.31]} color={trim} />
      <HipRoof
        at={[0, 3.39, 0]}
        w={2.79}
        d={2.52}
        h={1.07}
        top={0.34}
        color={roof}
      />
      {[-0.59, 0.59].map((x) => (
        <Dormer key={x} x={x} y={3.49} z={0.89} color={roof} />
      ))}
      <Chimney at={[-0.91, 3.85, -0.6]} color={brick} />
      <Steps w={1.25} z={1.37} />
      <Lantern at={[-0.78, 1.17, 1.17]} off={offline} />
      <Lantern at={[0.78, 1.17, 1.17]} off={offline} />
      {[0.42, 1.55, 2.48].flatMap((y) =>
        [-0.57, 0.57].map((x) => (
          <ArchWindow
            key={`back-${x}-${y}`}
            at={[x, y, -1.045]}
            w={0.42}
            h={0.59}
            side={Math.PI}
            trim={trim}
            lit={!offline && x > 0}
          />
        )),
      )}
      {[1.55, 2.48].flatMap((y) =>
        [-0.57, 0.57].map((z) => (
          <ArchWindow
            key={`left-${z}-${y}`}
            at={[-1.182, y, z]}
            w={0.42}
            h={0.59}
            side={-Math.PI / 2}
            trim={trim}
            lit={!offline}
          />
        )),
      )}
    </group>
  );
});

function GateArch({ z, color }: { z: number; color: string }) {
  const geometry = useMemo(() => {
    const outer = archShape(3.19, 3.15);
    const inner = archShape(2.52, 2.72);
    outer.holes.push(new THREE.Path(inner.getPoints(28).reverse()));
    return new THREE.ExtrudeGeometry(outer, {
      depth: 0.3,
      bevelEnabled: true,
      bevelSize: 0.03,
      bevelThickness: 0.025,
      bevelSegments: 2,
      curveSegments: 28,
    });
  }, []);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <mesh position={[0, 0.19, z]} geometry={geometry} castShadow receiveShadow>
      <meshStandardMaterial color={color} roughness={0.72} />
    </mesh>
  );
}
export const GatewayShell = memo(function GatewayShell() {
  const logo = useMemo(() => {
    const svg = new SVGLoader().parse(hookdeckSvg);
    const g = new THREE.ExtrudeGeometry(
      svg.paths.flatMap((path) => SVGLoader.createShapes(path)),
      {
        depth: 0.9,
        bevelEnabled: true,
        bevelSize: 0.1,
        bevelThickness: 0.1,
        bevelSegments: 2,
        curveSegments: 16,
      },
    );
    g.computeBoundingBox();
    const center = g.boundingBox!.getCenter(new THREE.Vector3());
    return g.translate(-center.x, -center.y, -center.z);
  }, []);
  useEffect(() => () => logo.dispose(), [logo]);
  const blue = "#0044cc";
  return (
    <group>
      <Block at={[0, 0.16, 0]} size={[4.13, 0.24, 3.46]} color="#9a9ca4" />
      {/* Four piers leave a genuinely open vault for the packages and queue. */}
      {[-1, 1].flatMap((x) =>
        [-1, 1].map((z) => (
          <group key={`${x}${z}`} position={[x * 1.59, 0, z * 1.18]}>
            <Masonry
              at={[0, 1.58, 0]}
              size={[0.67, 2.77, 0.63]}
              color="#71839e"
            />
            <Block at={[0, 0.4, 0]} size={[0.79, 0.27, 0.78]} color="#bfc5cc" />
            <Block at={[0, 2.81, 0]} size={[0.86, 0.24, 0.8]} color="#bcc8d8" />
            <Block
              at={[0, 1.61, z * 0.34]}
              size={[0.25, 2.12, 0.08]}
              color={blue}
            />
          </group>
        )),
      )}
      <GateArch z={1.18} color="#b4c5dd" />
      <GateArch z={-1.45} color="#92a6c4" />
      <Cornice y={3.09} w={3.94} d={3.31} color="#bccce3" dentils />
      <Masonry at={[0, 3.63, 0]} size={[3.69, 0.79, 2.99]} color={blue} />
      <Cornice y={3.98} w={3.92} d={3.23} color="#b4c5dc" />
      <HipRoof
        at={[0, 4.19, 0]}
        w={4.22}
        d={3.53}
        h={0.92}
        top={0.42}
        color={blue}
      />
      <HipRoof
        at={[0, 5.11, 0]}
        w={1.82}
        d={1.53}
        h={0.25}
        top={0.04}
        color="#1849a4"
      />
      {/* Projecting central pediment and solid SVG emblem. */}
      <Block at={[0, 3.68, 1.57]} size={[1.71, 0.83, 0.23]} color={blue} />
      <Pediment at={[0, 4.1, 1.47]} w={2.01} h={0.49} color="#b9cce8" />
      <Pediment at={[0, 4.13, 1.674]} w={1.54} h={0.3} color={blue} />
      <mesh
        geometry={logo}
        position={[0, 3.69, 1.711]}
        scale={[0.028, -0.028, 0.028]}
        castShadow
      >
        <meshStandardMaterial
          color="#f1f5ff"
          metalness={0.32}
          roughness={0.32}
        />
      </mesh>
      {[-1.27, 1.27].map((x) => (
        <ArchWindow
          key={x}
          at={[x, 3.42, 1.51]}
          w={0.24}
          h={0.41}
          trim="#afc4e1"
        />
      ))}
      {[-0.85, 0, 0.85].map((z) => (
        <ArchWindow
          key={z}
          at={[1.854, 3.42, z]}
          side={Math.PI / 2}
          w={0.26}
          h={0.4}
          trim="#aec4e0"
        />
      ))}
      <Lantern at={[-1.59, 1.81, 1.6]} />
      <Lantern at={[1.59, 1.81, 1.6]} />
      <Steps w={2.77} z={1.77} />
      <Block at={[0, 0.303, 0]} size={[2.3, 0.016, 2.97]} color="#738eae" />
    </group>
  );
});

/** Three small civic buildings, built from the same stonework as the town. */
export const AutomationArchitecture = memo(function AutomationArchitecture({
  kind,
  color,
}: {
  kind: "n8n" | "zapier" | "make";
  color: string;
}) {
  const width = kind === "zapier" ? 3 : 2.65;
  const height = kind === "make" ? 3.65 : 3.15;
  const facade =
    kind === "n8n" ? "#a9766c" : kind === "zapier" ? "#bd9879" : "#9290a5";
  return (
    <group>
      <Masonry
        at={[0, height / 2 + 0.12, 0]}
        size={[width, height, 2.35]}
        color={facade}
        brick={kind === "n8n"}
      />
      <Quoins w={width} d={2.35} height={height} color="#d8d0c0" />
      <Cornice y={0.24} w={width + 0.15} d={2.5} />
      <Cornice y={1.3} w={width + 0.12} d={2.48} />
      <Cornice y={height + 0.13} w={width + 0.25} d={2.6} dentils />
      {[-0.82, 0, 0.82].map((x) => (
        <ArchWindow
          key={x}
          at={[x, 1.65, 1.18]}
          w={0.43}
          h={kind === "make" ? 1.15 : 0.85}
          pointed={kind === "make"}
        />
      ))}
      {[-1, 1].flatMap((side) =>
        [0.48, 1.75].flatMap((y) =>
          [-0.62, 0.62].map((z) => (
            <ArchWindow
              key={`${side}:${y}:${z}`}
              at={[side * (width / 2 + 0.012), y, z]}
              w={0.4}
              h={0.77}
              side={(side * Math.PI) / 2}
            />
          )),
        ),
      )}
      <ArchWindow at={[0, 0.25, 1.182]} w={0.75} h={0.96} />
      {[-0.92, 0.92].map((x) => (
        <Lantern key={x} at={[x, 0.94, 1.27]} />
      ))}
      <Steps w={1.35} z={1.52} />
      {kind === "zapier" ? (
        <>
          {[-1.18, 1.18].map((x) => (
            <group key={x} position={[x, 0, 1.37]}>
              <Block
                at={[0, 0.82, 0]}
                size={[0.18, 1.32, 0.21]}
                color={paleStone}
              />
              <Block
                at={[0, 0.2, 0]}
                size={[0.31, 0.16, 0.35]}
                color={paleStone}
              />
            </group>
          ))}
          <Pediment at={[0, 1.36, 1.25]} w={2.85} h={0.55} />
          <HipRoof
            at={[0, 3.44, 0]}
            w={3.4}
            d={2.77}
            h={0.8}
            top={0.62}
            color={color}
          />
          <Chimney at={[-1.05, 3.82, -0.55]} color={facade} />
        </>
      ) : kind === "make" ? (
        <>
          <HipRoof
            at={[0, 3.95, 0]}
            w={3.04}
            d={2.73}
            h={0.9}
            top={0.28}
            color={color}
          />
          <Masonry
            at={[0, 4.77, 0]}
            size={[0.8, 0.66, 0.8]}
            color={paleStone}
          />
          <ArchWindow at={[0, 4.52, 0.415]} w={0.25} h={0.39} />
          <HipRoof
            at={[0, 5.12, 0]}
            w={1.05}
            d={1.05}
            h={0.46}
            top={0.03}
            color={color}
          />
        </>
      ) : (
        <>
          <HipRoof
            at={[0, 3.45, 0]}
            w={3.08}
            d={2.77}
            h={0.95}
            top={0.26}
            color={color}
          />
          {[-0.65, 0.65].map((x) => (
            <Dormer key={x} x={x} y={3.57} z={1} color={color} />
          ))}
          <Chimney at={[0.94, 3.85, -0.55]} color={facade} />
        </>
      )}
    </group>
  );
});
