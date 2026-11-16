import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { Line2 } from "three/addons/lines/Line2.js";
import { LineGeometry } from "three/addons/lines/LineGeometry.js";
import { LineMaterial } from "three/addons/lines/LineMaterial.js";
import { createRope } from "./rope.js";

export const ROD_LENGTH = 3.3;
const ROD_SEGMENTS = 12;
const ROPE_POINTS = 28;
const ARC_DOTS = 9;
const NET_FLOATS = 9;
const NET_SPAN = 9;
const NET_DROP = 1.8;
const NET_MESH = 0.3;
const SPRAY = 96;
const FLOAT_NEAR = 4.2;
const FLOAT_SIZE = 1.3;
const UP = new THREE.Vector3(0, 1, 0);
const SLACK = new THREE.Color(0xf2f6f8);
const TIGHT = new THREE.Color(0xf0b04a);
const BREAKING = new THREE.Color(0xff4a3a);

const a = new THREE.Vector3();
const b = new THREE.Vector3();
const mid = new THREE.Vector3();
const axis = new THREE.Vector3();
const q = new THREE.Quaternion();
const s = new THREE.Vector3();
const m = new THREE.Matrix4();

function strand(scene, segments, material) {
  const mesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1, 1, 7, 1, true), material, segments);
  mesh.frustumCulled = false;
  mesh.visible = false;
  scene.add(mesh);
  return {
    set(pointAt, radiusAt) {
      mesh.visible = true;
      for (let i = 0; i < segments; i++) {
        pointAt(i / segments, a);
        pointAt((i + 1) / segments, b);
        axis.subVectors(b, a);
        const length = Math.max(axis.length(), 1e-5);
        q.setFromUnitVectors(UP, axis.divideScalar(length));
        const r = radiusAt((i + 0.5) / segments);
        m.compose(mid.addVectors(a, b).multiplyScalar(0.5), q, s.set(r, length, r));
        mesh.setMatrixAt(i, m);
      }
      mesh.instanceMatrix.needsUpdate = true;
    },
    hide() {
      mesh.visible = false;
    },
  };
}

function pencilFloat(make) {
  const float = new THREE.Group();
  const paint = make({ color: 0xe6ecd8, roughness: 0.45 });
  const profile = (points) => new THREE.LatheGeometry(points.map(([r, y]) => new THREE.Vector2(r, y)), 14);
  const body = new THREE.Mesh(profile([[0.0015, -0.1], [0.006, -0.085], [0.008, -0.04], [0.007, -0.01], [0.004, 0], [0.0025, 0.004]]), paint);
  const stub = new THREE.Mesh(profile([[0.0045, -0.012], [0.0045, 0], [0.0025, 0.004]]), paint);
  const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.0025, 0.0025, 0.06, 10).translate(0, 0.034, 0), make({ color: 0xff6a12, roughness: 0.4, emissive: 0x4a1800 }));
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.0027, 0.0027, 0.008, 10).translate(0, 0.04, 0), make({ color: 0x111111, roughness: 0.5 }));
  const bead = new THREE.Mesh(new THREE.SphereGeometry(0.005, 12, 8).translate(0, 0.066, 0), make({ color: 0xffd84a, roughness: 0.35, emissive: 0x4a3a00 }));
  float.add(body, stub, antenna, band, bead);
  float.visible = false;
  float.userData = { body, stub };
  return float;
}

function shadowTexture() {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size * 2;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  ctx.filter = "blur(9px)";
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.ellipse(size * 1.1, size / 2, size * 0.55, size * 0.17, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(size * 0.62, size / 2);
  ctx.lineTo(size * 0.26, size * 0.24);
  ctx.lineTo(size * 0.34, size / 2);
  ctx.lineTo(size * 0.26, size * 0.76);
  ctx.closePath();
  ctx.fill();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function fishShape(material) {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.5, 14, 10).scale(1, 0.3, 0.13), material);
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.3, 4).rotateZ(-Math.PI / 2).scale(1, 1, 0.2), material);
  tail.position.x = -0.6;
  mesh.add(tail);
  return mesh;
}

export function createGear({ scene, patchMaterial, baseUrl }) {
  const make = (props) => {
    const material = new THREE.MeshStandardMaterial(props);
    patchMaterial(material);
    return material;
  };
  const blank = make({ color: 0x0f1c2b, roughness: 0.16, metalness: 0.45 });
  const cork = make({ color: 0x9a6a40, roughness: 0.85 });
  const steel = make({ color: 0xc9cdd1, roughness: 0.25, metalness: 1 });
  const gold = make({ color: 0xd9a441, roughness: 0.35, metalness: 0.8 });
  const orange = make({ color: 0xf08a2c, roughness: 0.6 });
  const silver = make({ color: 0xb9cbd6, roughness: 0.3, metalness: 0.4 });
  const timber = make({ color: 0x6b4630, roughness: 0.8 });

  const rodStrand = strand(scene, ROD_SEGMENTS, blank);
  const wrap = make({ color: 0x7a1f1c, roughness: 0.35 });
  const ceramic = make({ color: 0x0c0d0f, roughness: 0.2, metalness: 0.2 });
  const handle = new THREE.Group();
  const parts = { crank: null, rotor: null };
  new GLTFLoader().load(
    `${baseUrl}models/rod-handle.glb`,
    (gltf) => {
      gltf.scene.traverse((node) => {
        if (!node.isMesh) return;
        node.frustumCulled = false;
        for (const material of [node.material].flat()) patchMaterial(material);
      });
      parts.crank = gltf.scene.getObjectByName("crank");
      parts.rotor = gltf.scene.getObjectByName("rotor");
      handle.add(gltf.scene);
    },
    undefined,
    (error) => console.error("rod handle failed to load", error),
  );
  const guideGeometry = mergeGeometries([
    new THREE.TorusGeometry(0.011, 0.0016, 6, 16).translate(0, 0, 0.02),
    new THREE.CylinderGeometry(0.0009, 0.0009, 0.024, 5).rotateX(0.55).translate(0, 0.006, 0.011),
    new THREE.CylinderGeometry(0.0009, 0.0009, 0.024, 5).rotateX(-0.55).translate(0, -0.006, 0.011),
  ]);
  const insertGeometry = new THREE.TorusGeometry(0.0088, 0.0014, 6, 16).translate(0, 0, 0.02);
  const wrapGeometry = mergeGeometries([
    new THREE.CylinderGeometry(1, 1, 0.05, 10),
    new THREE.CylinderGeometry(1.12, 1.12, 0.004, 10).translate(0, 0.027, 0),
    new THREE.CylinderGeometry(1.12, 1.12, 0.004, 10).translate(0, -0.027, 0),
  ]);
  const guides = Array.from({ length: 7 }, () => {
    const guide = new THREE.Group();
    guide.add(new THREE.Mesh(guideGeometry, steel), new THREE.Mesh(insertGeometry, ceramic), new THREE.Mesh(wrapGeometry, wrap));
    scene.add(guide);
    return guide;
  });
  scene.add(handle);

  const rope = createRope(ROPE_POINTS);
  const linePositions = new Float32Array(ROPE_POINTS * 3);
  const lineGeometry = new LineGeometry();
  lineGeometry.setPositions(linePositions);
  const lineMaterial = new LineMaterial({ color: 0xffffff, linewidth: 1.4 });
  const line = new Line2(lineGeometry, lineMaterial);
  line.frustumCulled = false;
  line.visible = false;
  scene.add(line);

  const float = pencilFloat(make);
  scene.add(float);

  const ringMaterial = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xf0c37a).multiplyScalar(2.2), side: THREE.DoubleSide });
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.62, 40).rotateX(-Math.PI / 2), ringMaterial);
  ring.add(new THREE.Mesh(new THREE.CircleGeometry(0.1, 20).rotateX(-Math.PI / 2), ringMaterial));
  ring.visible = false;
  scene.add(ring);
  const dots = new THREE.InstancedMesh(new THREE.SphereGeometry(0.05, 8, 6), ringMaterial, ARC_DOTS);
  dots.frustumCulled = false;
  dots.visible = false;
  scene.add(dots);

  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(2, 1).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0x031014, alphaMap: shadowTexture(), transparent: true, opacity: 0, depthWrite: false }),
  );
  shadow.visible = false;
  scene.add(shadow);

  const sprayPositions = new Float32Array(SPRAY * 3);
  const sprayGeometry = new THREE.BufferGeometry();
  sprayGeometry.setAttribute("position", new THREE.BufferAttribute(sprayPositions, 3));
  const spray = new THREE.Points(sprayGeometry, new THREE.PointsMaterial({ color: new THREE.Color(0xffffff).multiplyScalar(1.6), size: 0.07, sizeAttenuation: true }));
  spray.frustumCulled = false;
  scene.add(spray);
  const drops = Array.from({ length: SPRAY }, () => ({ life: 0, vx: 0, vy: 0, vz: 0 }));
  for (let i = 0; i < SPRAY; i++) sprayPositions[i * 3 + 1] = -500;
  let nextDrop = 0;

  const trophy = fishShape(silver);
  trophy.visible = false;
  scene.add(trophy);
  const chest = new THREE.Group();
  chest.add(
    new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.4, 0.45), timber),
    new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.44, 0.47).translate(-0.22, 0, 0), gold),
    new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.44, 0.47).translate(0.22, 0, 0), gold),
  );
  chest.visible = false;
  scene.add(chest);

  const net = new THREE.Group();
  net.visible = false;
  scene.add(net);
  const buoys = Array.from({ length: NET_FLOATS }, () => {
    const buoy = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), orange);
    net.add(buoy);
    return buoy;
  });
  const netSpots = buoys.map(() => new THREE.Vector3());
  const meshCanvas = document.createElement("canvas");
  meshCanvas.width = meshCanvas.height = 64;
  const meshInk = meshCanvas.getContext("2d");
  meshInk.strokeStyle = "#e9dcc0";
  meshInk.lineWidth = 5;
  meshInk.beginPath();
  for (const [x0, y0, x1, y1] of [[0, 0, 64, 64], [64, 0, 0, 64], [-32, 32, 32, 96], [32, -32, 96, 32]]) {
    meshInk.moveTo(x0, y0);
    meshInk.lineTo(x1, y1);
  }
  meshInk.stroke();
  const meshTexture = new THREE.CanvasTexture(meshCanvas);
  meshTexture.wrapS = meshTexture.wrapT = THREE.RepeatWrapping;
  meshTexture.repeat.set(NET_SPAN / NET_MESH, NET_DROP / NET_MESH);
  meshTexture.colorSpace = THREE.SRGBColorSpace;
  const curtain = new THREE.Mesh(new THREE.PlaneGeometry(1, 1, NET_FLOATS - 1, 1), make({ map: meshTexture, alphaTest: 0.35, side: THREE.DoubleSide, roughness: 0.9 }));
  curtain.frustumCulled = false;
  net.add(curtain);
  const markers = [0, NET_FLOATS - 1].map((index) => {
    const marker = new THREE.Group();
    marker.add(new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.3, 6).translate(0, 0.65, 0), cork), new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.22).translate(0.19, 1.18, 0), make({ color: 0xd8402c, roughness: 0.8, side: THREE.DoubleSide })));
    net.add(marker);
    return { marker, index };
  });
  const ropeStrand = strand(scene, NET_FLOATS - 1, cork);

  const tip = new THREE.Vector3();
  const rodBase = new THREE.Vector3();
  const rodDir = new THREE.Vector3();
  const rodBend = new THREE.Vector3();
  const tint = new THREE.Color();
  let bendAmount = 0;
  const rodPoint = (t, out) => out.copy(rodBase).addScaledVector(rodDir, ROD_LENGTH * t).addScaledVector(rodBend, bendAmount * t * t);

  return {
    tip,
    setResolution(width, height) {
      lineMaterial.resolution.set(width, height);
    },
    showRod(visible) {
      handle.visible = visible;
      for (const guide of guides) guide.visible = visible;
      if (!visible) rodStrand.hide();
    },
    setRod(base, direction, bendToward, bend, crankAngle) {
      rodBase.copy(base);
      rodDir.copy(direction).normalize();
      rodBend.copy(bendToward).addScaledVector(rodDir, -bendToward.dot(rodDir));
      if (rodBend.lengthSq() > 1e-6) rodBend.normalize();
      bendAmount = bend;
      rodStrand.set(rodPoint, (t) => 0.0115 - 0.009 * t);
      rodPoint(1, tip);
      handle.position.copy(base);
      b.set(0, -1, 0).addScaledVector(rodDir, rodDir.y);
      if (b.lengthSq() < 1e-4) b.set(0, 0, 1);
      b.normalize();
      handle.quaternion.setFromRotationMatrix(m.makeBasis(a.crossVectors(rodDir, b), rodDir, b));
      if (parts.crank) parts.crank.rotation.x = crankAngle;
      if (parts.rotor) parts.rotor.rotation.y = crankAngle * 4.6;
      guides.forEach((guide, i) => {
        const t = 0.2 + (i / (guides.length - 1)) ** 0.8 * 0.8;
        rodPoint(t, guide.position);
        rodPoint(Math.max(0, t - 0.02), a);
        axis.subVectors(guide.position, a).normalize();
        mid.set(0, -1, 0).addScaledVector(axis, axis.y);
        if (mid.lengthSq() < 1e-4) mid.set(0, 0, 1);
        mid.normalize();
        guide.quaternion.setFromRotationMatrix(m.makeBasis(b.crossVectors(axis, mid), axis, mid));
        const girth = 0.0115 - 0.009 * t;
        guide.scale.set(1, 1, 1).multiplyScalar(1.5 - 0.95 * t);
        guide.children[2].scale.set((girth * 1.25) / guide.scale.x, 1, (girth * 1.25) / guide.scale.x);
      });
    },
    setLine(end, length, floor, taut, strain, dt) {
      if (!end) {
        line.visible = false;
        rope.clear();
        return;
      }
      rope.step(dt, tip, end, length, floor, taut);
      for (let i = 0; i < ROPE_POINTS; i++) {
        linePositions[i * 3] = rope.x[i];
        linePositions[i * 3 + 1] = rope.y[i];
        linePositions[i * 3 + 2] = rope.z[i];
      }
      lineGeometry.setPositions(linePositions);
      tint.copy(SLACK).lerp(TIGHT, THREE.MathUtils.smoothstep(strain, 0.55, 0.9)).lerp(BREAKING, THREE.MathUtils.smoothstep(strain, 0.92, 1.1));
      lineMaterial.color.copy(tint);
      lineMaterial.linewidth = 1.4 + 1.2 * THREE.MathUtils.smoothstep(strain, 0.9, 1.1);
      line.visible = true;
    },
    setFloat(position, distance, lean, flat, dip) {
      float.visible = Boolean(position);
      if (!position) return;
      const scale = Math.min(4, Math.max(1.2, distance / FLOAT_NEAR)) * FLOAT_SIZE;
      float.scale.setScalar(scale);
      float.userData.body.visible = flat > 0.45;
      float.userData.stub.visible = flat <= 0.45;
      float.position.set(position.x, position.y - dip * scale, position.z);
      a.set(lean.x, 1 - flat, lean.z);
      if (flat > 0) a.addScaledVector(b.set(lean.x, 0, lean.z).lengthSq() > 1e-4 ? b.normalize() : b.set(1, 0, 0), flat * 1.4);
      float.quaternion.setFromUnitVectors(UP, a.normalize());
    },
    setAim(target, pulse) {
      ring.visible = dots.visible = Boolean(target);
      if (!target) return;
      ring.position.set(target.x, target.y + 0.12, target.z);
      ring.scale.setScalar((1 + 0.08 * Math.sin(pulse)) * Math.max(1, a.subVectors(target, tip).length() / 8));
      for (let i = 0; i < ARC_DOTS; i++) {
        const t = (i + 1) / (ARC_DOTS + 1);
        a.lerpVectors(tip, target, t);
        a.y += Math.sin(t * Math.PI) * 2.4;
        m.makeTranslation(a.x, a.y, a.z);
        dots.setMatrixAt(i, m);
      }
      dots.instanceMatrix.needsUpdate = true;
    },
    setShadow(position, heading, size, strength) {
      shadow.visible = strength > 0.01;
      if (!shadow.visible) return;
      shadow.position.copy(position);
      shadow.rotation.y = heading;
      shadow.scale.setScalar(size);
      shadow.material.opacity = 0.42 * strength;
    },
    burst(position, count, power) {
      for (let i = 0; i < count; i++) {
        const drop = drops[nextDrop];
        const angle = Math.random() * Math.PI * 2;
        const out = (0.4 + Math.random()) * power;
        drop.life = 0.5 + Math.random() * 0.5;
        drop.vx = Math.cos(angle) * out;
        drop.vz = Math.sin(angle) * out;
        drop.vy = (1.6 + Math.random() * 2.2) * power;
        sprayPositions[nextDrop * 3] = position.x;
        sprayPositions[nextDrop * 3 + 1] = position.y + 0.05;
        sprayPositions[nextDrop * 3 + 2] = position.z;
        nextDrop = (nextDrop + 1) % SPRAY;
      }
    },
    stepSpray(dt) {
      for (let i = 0; i < SPRAY; i++) {
        const drop = drops[i];
        if (drop.life <= 0) continue;
        drop.life -= dt;
        drop.vy -= 9.81 * dt;
        sprayPositions[i * 3] += drop.vx * dt;
        sprayPositions[i * 3 + 1] += drop.vy * dt;
        sprayPositions[i * 3 + 2] += drop.vz * dt;
        if (drop.life <= 0) sprayPositions[i * 3 + 1] = -500;
      }
      sprayGeometry.attributes.position.needsUpdate = true;
    },
    setTrophy(kind, position, scale, spin) {
      trophy.visible = kind === "fish";
      chest.visible = kind === "chest";
      const shown = kind === "fish" ? trophy : kind === "chest" ? chest : null;
      if (!shown) return;
      shown.position.copy(position);
      shown.scale.setScalar(scale);
      shown.rotation.set(0, spin, kind === "fish" ? -Math.PI / 2 : 0);
    },
    placeNet(origin, side, forward, level) {
      for (let i = 0; i < NET_FLOATS; i++) {
        const t = i / (NET_FLOATS - 1);
        const out = 2.2 + Math.sin(t * Math.PI) * 4.2;
        netSpots[i].set(origin.x + side.x * out + forward.x * (t - 0.5) * 7.5, level, origin.z + side.z * out + forward.z * (t - 0.5) * 7.5);
      }
    },
    setNet(visible, time, level) {
      net.visible = visible;
      if (!visible) return ropeStrand.hide();
      buoys.forEach((buoy, i) => buoy.position.set(netSpots[i].x, level + Math.sin(time * 1.3 + i * 0.9) * 0.06 + 0.04, netSpots[i].z));
      const corners = curtain.geometry.attributes.position;
      buoys.forEach((buoy, i) => {
        corners.setXYZ(i, buoy.position.x, buoy.position.y - 0.08, buoy.position.z);
        corners.setXYZ(i + NET_FLOATS, buoy.position.x, buoy.position.y - NET_DROP, buoy.position.z);
      });
      corners.needsUpdate = true;
      for (const { marker, index } of markers) {
        marker.position.copy(buoys[index].position);
        marker.rotation.z = Math.sin(time * 1.1 + index) * 0.12;
      }
      ropeStrand.set((t, out) => out.lerpVectors(buoys[Math.min(NET_FLOATS - 2, Math.floor(t * (NET_FLOATS - 1)))].position, buoys[Math.min(NET_FLOATS - 1, Math.floor(t * (NET_FLOATS - 1)) + 1)].position, (t * (NET_FLOATS - 1)) % 1), () => 0.02);
    },
  };
}
