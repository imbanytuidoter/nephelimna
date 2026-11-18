import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { FIGHT_RULES } from "./fight.js";
import { ROD } from "./rod.js";

const PALETTE = {
  water: [new THREE.Color("#2b93a6"), new THREE.Color("#176475"), new THREE.Color("#0c4352")],
  deep: new THREE.Color("#04161d"),
  glow: new THREE.Color("#d8fbf3"),
  sand: new THREE.Color("#a88f62"),
  caustic: new THREE.Color("#fff6d8"),
  kelp: new THREE.Color("#2e6a43"),
  kelpTip: new THREE.Color("#6f9a4a"),
  sky: new THREE.Color("#bff3ff"),
  ground: new THREE.Color("#0d3038"),
  line: new THREE.Color("#eef4f2"),
  steel: new THREE.Color("#c4ccd0"),
  worm: new THREE.Color("#c86a6c"),
  spoon: new THREE.Color("#e9edf0"),
  shade: new THREE.Color("#0a2a32"),
  chest: new THREE.Color("#6b4526"),
  band: new THREE.Color("#c9a24a"),
  strain: new THREE.Color("#ff6a52"),
};
const TINT = {
  common: new THREE.Color(1, 1, 1),
  uncommon: new THREE.Color(0.85, 1.05, 0.8),
  rare: new THREE.Color(1.35, 1.1, 0.55),
  mythic: new THREE.Color(0.55, 0.75, 0.7),
};
const LENGTH = { common: 0.42, uncommon: 0.56, rare: 0.75, mythic: 1.35, chest: 0.36 };
const MODEL_LENGTH = 0.5;
const MOUTH_AHEAD = 0.45;
/** Where the line ties on, measured from the middle of the hook bend; hookPos is the bend, so a bait and a hooked lip sit in the curve and the line meets the shank. */
const HOOK_EYE = new THREE.Vector3(0.03, 0.06, 0);
const SURFACE_ABOVE = [0.55, 1.5, 2.6];
const FLOOR_BELOW = [3.2, 1.4, 0.42];
const FOG = [0.4, 0.37, 0.34];
const CAUSTIC = [0.25, 0.35, 0.55];
const SHADOWS = 3;
const BUBBLES = 46;
const RISE = 0.22;
const RADIUS = 16;
const SETTLE = 9;
const TURN = 6;
const CHEST_HALF = 0.1;
const CHEST_LIFT = 0.45;
const APPROACH = 0.8;
const LEAVE = 0.7;
const PECK = 0.12;
const SHADOW_LENGTH = 0.42;
const KELP = 7;
const RAYS = 5;
const LINE_PHASES = new Set(["waiting", "take", "fight", "landed", "lost", "retrieving"]);
const PULLING = new Set(["run", "coil", "jump"]);

const lerp = THREE.MathUtils.lerp;
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const ease = (t) => t * t * (3 - 2 * t);

function swimPatch(material, clock, amount) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uSwim = clock;
    shader.uniforms.uAmount = amount;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nuniform float uSwim;\nuniform float uAmount;")
      .replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\nfloat tailward = clamp(0.5 - transformed.x / 0.5, 0.0, 1.0);\ntransformed.z += sin(uSwim * 9.0 - transformed.x * 14.0) * 0.06 * uAmount * tailward * tailward;",
      );
  };
}

function backdrop() {
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: { uTop: { value: PALETTE.glow.clone() }, uMid: { value: PALETTE.water[0].clone() }, uDeep: { value: PALETTE.deep.clone() }, uTime: { value: 0 } },
    vertexShader: "varying vec3 vDir; void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    fragmentShader: `uniform vec3 uTop; uniform vec3 uMid; uniform vec3 uDeep; uniform float uTime; varying vec3 vDir;
      void main() {
        float h = vDir.y;
        vec3 c = mix(uDeep, uMid, smoothstep(-1.0, -0.15, h));
        c = mix(c, uTop, smoothstep(0.2, 1.0, h) * 0.6);
        float shafts = pow(max(0.0, sin(vDir.x * 9.0 + uTime * 0.3) * sin(vDir.x * 4.0 - uTime * 0.21)), 6.0) * smoothstep(-0.2, 0.8, h);
        gl_FragColor = vec4(c + uTop * shafts * 0.12, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  return new THREE.Mesh(new THREE.SphereGeometry(30, 24, 16), material);
}

function surfaceSheet(clock) {
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: { uTime: clock, uGlow: { value: PALETTE.glow.clone() } },
    vertexShader: "varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    fragmentShader: `uniform float uTime; uniform vec3 uGlow; varying vec2 vUv;
      void main() {
        vec2 p = vUv * 14.0;
        float r = sin(p.x + sin(p.y * 1.3 + uTime) * 1.4) * sin(p.y * 0.9 + sin(p.x * 1.1 - uTime * 0.8) * 1.6);
        float edge = 1.0 - smoothstep(0.25, 0.5, length(vUv - 0.5));
        gl_FragColor = vec4(uGlow, (0.35 + 0.4 * smoothstep(0.2, 0.9, r)) * edge);
        #include <colorspace_fragment>
      }`,
  });
  return new THREE.Mesh(new THREE.PlaneGeometry(14, 14).rotateX(Math.PI / 2), material);
}

function seabed(clock, strength) {
  const material = new THREE.MeshStandardMaterial({ color: PALETTE.sand, roughness: 1 });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = clock;
    shader.uniforms.uCaustic = { value: PALETTE.caustic.clone() };
    shader.uniforms.uStrength = strength;
    shader.vertexShader = shader.vertexShader.replace("#include <common>", "#include <common>\nvarying vec3 vSpot;").replace("#include <begin_vertex>", "#include <begin_vertex>\nvSpot = position;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform float uTime;\nuniform vec3 uCaustic;\nuniform float uStrength;\nvarying vec3 vSpot;")
      .replace(
        "#include <emissivemap_fragment>",
        `#include <emissivemap_fragment>
        vec2 q = vSpot.xz * 3.2;
        float a = sin(q.x + sin(q.y + uTime * 0.9)) + sin(q.y * 1.2 + sin(q.x * 1.1 - uTime * 0.7));
        float caustic = pow(clamp(1.0 - abs(a) * 0.9, 0.0, 1.0), 5.0);
        totalEmissiveRadiance += uCaustic * caustic * uStrength;`,
      );
  };
  const geometry = new THREE.PlaneGeometry(16, 16, 32, 32).rotateX(-Math.PI / 2);
  const pos = geometry.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setY(i, Math.sin(pos.getX(i) * 1.7) * 0.05 + Math.cos(pos.getZ(i) * 2.3) * 0.04);
  geometry.computeVertexNormals();
  return new THREE.Mesh(geometry, material);
}

function kelpBed(clock) {
  const geometry = new THREE.PlaneGeometry(0.2, 1, 1, 10).translate(0, 0.5, 0);
  const taper = geometry.attributes.position;
  for (let i = 0; i < taper.count; i++) taper.setX(i, taper.getX(i) * (1 - 0.7 * taper.getY(i)));
  const colors = new Float32Array(geometry.attributes.position.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < geometry.attributes.position.count; i++) {
    c.copy(PALETTE.kelp).lerp(PALETTE.kelpTip, geometry.attributes.position.getY(i));
    colors.set([c.r, c.g, c.b], i * 3);
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.8, emissive: PALETTE.kelp, emissiveIntensity: 0.35 });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = clock;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nuniform float uTime;")
      .replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\nfloat k = transformed.y * transformed.y;\nfloat seed = instanceMatrix[3].x * 3.1 + instanceMatrix[3].z * 1.7;\ntransformed.x += sin(uTime * 1.3 + seed + transformed.y * 2.0) * 0.18 * k;\ntransformed.z += cos(uTime * 0.9 + seed) * 0.1 * k;",
      );
  };
  const mesh = new THREE.InstancedMesh(geometry, material, KELP);
  const m = new THREE.Matrix4();
  for (let i = 0; i < KELP; i++) {
    const x = -2.4 + (i / (KELP - 1)) * 4.8 + Math.sin(i * 7.3) * 0.25;
    const z = -1.6 - Math.abs(Math.sin(i * 3.1)) * 1.4;
    const tall = 1.1 + Math.abs(Math.sin(i * 5.7)) * 1.3;
    m.compose(new THREE.Vector3(x, 0, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), i), new THREE.Vector3(1, tall, 1));
    mesh.setMatrixAt(i, m);
  }
  return mesh;
}

function lightShafts(clock) {
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    uniforms: { uTime: clock, uGlow: { value: PALETTE.glow.clone() } },
    vertexShader: "varying vec2 vUv; varying float vSeed; void main() { vUv = uv; vSeed = instanceMatrix[3].x; gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0); }",
    fragmentShader: `uniform float uTime; uniform vec3 uGlow; varying vec2 vUv; varying float vSeed;
      void main() {
        float across = 1.0 - abs(vUv.x - 0.5) * 2.0;
        float fade = smoothstep(0.0, 0.7, vUv.y);
        float flicker = 0.6 + 0.4 * sin(uTime * 0.8 + vSeed * 5.0);
        gl_FragColor = vec4(uGlow, across * across * fade * flicker * 0.16);
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.5, 6).translate(0, -3, 0), material, RAYS);
  const m = new THREE.Matrix4();
  for (let i = 0; i < RAYS; i++) {
    const x = -1.8 + i * 0.9 + Math.sin(i * 4.1) * 0.2;
    m.compose(new THREE.Vector3(x, 0, -0.8 - (i % 2) * 0.9), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, -0.32)), new THREE.Vector3(0.6 + (i % 3) * 0.4, 1, 1));
    mesh.setMatrixAt(i, m);
  }
  return mesh;
}

function bubbles() {
  const positions = new Float32Array(BUBBLES * 3);
  const sizes = new Float32Array(BUBBLES);
  for (let i = 0; i < BUBBLES; i++) {
    positions.set([Math.sin(i * 12.9898) * 2.4, Math.sin(i * 78.233) * 2.2, -Math.abs(Math.sin(i * 39.42)) * 2.6 + 0.6], i * 3);
    sizes[i] = 0.5 + Math.abs(Math.sin(i * 17.31)) * 0.5;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("size", new THREE.BufferAttribute(sizes, 1));
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { uGlow: { value: PALETTE.glow.clone() }, uScale: { value: 1 } },
    vertexShader: `attribute float size; uniform float uScale; varying float vFade;
      void main() {
        vec4 view = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * view;
        gl_PointSize = max(1.5, size * uScale * 0.05 / -view.z);
        vFade = clamp(1.4 - (-view.z) * 0.35, 0.0, 1.0);
      }`,
    fragmentShader: `uniform vec3 uGlow; varying float vFade;
      void main() {
        vec2 p = gl_PointCoord * 2.0 - 1.0;
        float r = length(p);
        if (r > 1.0) discard;
        float rim = smoothstep(0.55, 0.92, r) * (1.0 - smoothstep(0.92, 1.0, r));
        float shine = 1.0 - smoothstep(0.0, 0.32, length(p - vec2(-0.35, 0.35)));
        gl_FragColor = vec4(uGlow, (rim * 0.55 + shine * 0.7 + 0.05) * vFade);
        #include <colorspace_fragment>
      }`,
  });
  return new THREE.Points(geometry, material);
}

function frameMaterial(texture) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthTest: false,
    depthWrite: false,
    uniforms: { uScene: { value: texture }, uSize: { value: new THREE.Vector2(1, 1) }, uRadius: { value: 16 }, uRim: { value: PALETTE.glow.clone() } },
    vertexShader: "varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }",
    fragmentShader: `uniform sampler2D uScene; uniform vec2 uSize; uniform float uRadius; uniform vec3 uRim; varying vec2 vUv;
      float box(vec2 p, vec2 b, float r) { vec2 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }
      void main() {
        vec2 p = (vUv - 0.5) * uSize;
        float d = box(p, uSize * 0.5, uRadius);
        float inside = 1.0 - smoothstep(-1.0, 0.5, d);
        vec3 c = texture2D(uScene, vUv).rgb;
        float vignette = smoothstep(0.85, 0.25, length((vUv - 0.5) * vec2(1.0, 1.15)));
        c *= 0.62 + 0.38 * vignette;
        float rim = 1.0 - smoothstep(0.0, 2.0, abs(d + 1.5));
        c = mix(c, uRim, rim * 0.45);
        gl_FragColor = vec4(c, inside);
        #include <colorspace_fragment>
      }`,
  });
}

function wormCurve() {
  const points = [new THREE.Vector3(-0.03, 0.02, 0), new THREE.Vector3(0.0, -0.03, 0.01), new THREE.Vector3(0.035, 0.0, 0), new THREE.Vector3(0.02, -0.06, -0.01), new THREE.Vector3(-0.02, -0.08, 0)];
  return new THREE.CatmullRomCurve3(points);
}

function chestMesh() {
  const group = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: PALETTE.chest, roughness: 0.8, emissive: PALETTE.chest, emissiveIntensity: 0.45 });
  const metal = new THREE.MeshStandardMaterial({ color: PALETTE.band, roughness: 0.35, metalness: 0.8 });
  group.add(new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.2, 0.22), wood));
  const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.36, 12, 1, false, 0, Math.PI).rotateZ(Math.PI / 2), wood);
  lid.position.y = 0.1;
  group.add(lid);
  for (const x of [-0.12, 0.12]) {
    const band = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.33, 0.235), metal);
    band.position.set(x, 0.03, 0);
    group.add(band);
  }
  return group;
}

export function createUnderwater({ baseUrl, reducedMotion }) {
  const frame = document.getElementById("underwater");
  const caption = frame.querySelector("p");
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(48, 4 / 3, 0.05, 40);
  const clock = { value: 0 };
  const swim = { value: 1 };
  const shadowSwim = { value: 1.4 };
  scene.fog = new THREE.FogExp2(PALETTE.water[0].clone(), FOG[0]);

  const sky = backdrop();
  const surface = surfaceSheet(clock);
  const causticStrength = { value: CAUSTIC[0] };
  const floor = seabed(clock, causticStrength);
  const kelp = kelpBed(clock);
  const rays = lightShafts(clock);
  const specks = bubbles();
  scene.add(sky, surface, floor, kelp, rays, specks);
  scene.add(new THREE.HemisphereLight(PALETTE.sky, PALETTE.ground, 2.2));
  const sun = new THREE.DirectionalLight(PALETTE.glow, 1.4);
  sun.position.set(0.6, 4, 1.2);
  scene.add(sun);

  const lineMaterial = new THREE.MeshBasicMaterial({ color: PALETTE.line, transparent: true, opacity: 0.8 });
  const line = new THREE.Mesh(new THREE.CylinderGeometry(0.0035, 0.0035, 1, 5).translate(0, 0.5, 0), lineMaterial);
  const steel = new THREE.MeshStandardMaterial({ color: PALETTE.steel, roughness: 0.25, metalness: 0.9 });
  const hook = new THREE.Group();
  const bend = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.004, 6, 16, Math.PI * 1.3).rotateZ(Math.PI * 0.85), steel);
  bend.position.set(-HOOK_EYE.x, -HOOK_EYE.y, 0);
  const shank = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, HOOK_EYE.y + 0.01, 5).translate(0, -(HOOK_EYE.y + 0.01) / 2, 0), steel);
  const eye = new THREE.Mesh(new THREE.TorusGeometry(0.008, 0.003, 5, 12), steel);
  hook.add(bend, shank, eye);
  const worm = new THREE.Mesh(new THREE.TubeGeometry(wormCurve(), 24, 0.011, 6), new THREE.MeshStandardMaterial({ color: PALETTE.worm, roughness: 0.5 }));
  const spoon = new THREE.Mesh(new THREE.SphereGeometry(0.03, 16, 10).scale(0.55, 1.3, 0.18), new THREE.MeshStandardMaterial({ color: PALETTE.spoon, roughness: 0.15, metalness: 1 }));
  spoon.position.set(-HOOK_EYE.x, -HOOK_EYE.y - 0.03, 0);
  worm.position.set(-HOOK_EYE.x, -HOOK_EYE.y + 0.03, 0);
  const baits = [worm, spoon, new THREE.Group()];
  hook.add(...baits);
  scene.add(line, hook);

  const chest = chestMesh();
  chest.visible = false;
  scene.add(chest);

  let fishModel = null;
  const fishSkin = new THREE.MeshStandardMaterial({ roughness: 0.35, metalness: 0.35 });
  swimPatch(fishSkin, clock, swim);
  const shadowSkin = new THREE.MeshStandardMaterial({ color: PALETTE.shade, roughness: 1, metalness: 0 });
  swimPatch(shadowSkin, clock, shadowSwim);
  const actor = new THREE.Mesh(new THREE.SphereGeometry(0.25, 12, 8).scale(1, 0.3, 0.15), fishSkin);
  actor.visible = false;
  const shadowMeshes = Array.from({ length: SHADOWS }, () => new THREE.Mesh(actor.geometry, shadowSkin));
  const bait = new THREE.Mesh(actor.geometry, fishSkin);
  bait.scale.setScalar(0.22);
  bait.rotation.z = -1.2;
  bait.position.y = -0.06;
  baits[2].add(bait);
  scene.add(actor, ...shadowMeshes);
  new GLTFLoader().load(
    `${baseUrl}models/school-fish.glb`,
    (gltf) => {
      gltf.scene.traverse((node) => {
        if (node.isMesh && !fishModel) fishModel = node;
      });
      if (!fishModel) return;
      fishSkin.map = fishModel.material.map;
      fishSkin.emissiveMap = fishModel.material.map;
      fishSkin.emissive = PALETTE.glow.clone();
      fishSkin.emissiveIntensity = 0.3;
      fishSkin.needsUpdate = true;
      for (const mesh of [actor, bait, ...shadowMeshes]) mesh.geometry = fishModel.geometry;
    },
    undefined,
    (error) => console.error("underwater fish model failed to load", error),
  );

  const shadows = shadowMeshes.map((mesh, i) => ({ mesh, angle: (i / SHADOWS) * Math.PI * 2, radius: 0.55 + i * 0.22, speed: 0.45 + i * 0.13, y: -0.25 + i * 0.14 }));
  const facing = new THREE.Vector3();
  const mouth = new THREE.Vector3();
  const top = new THREE.Vector3();
  const spot = new THREE.Vector3();
  const goal = new THREE.Vector3();
  const rect = { x: 0, y: 0, w: 0, h: 0 };
  const target = new THREE.WebGLRenderTarget(1, 1, { samples: 4 });
  const composite = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), frameMaterial(target.texture));
  composite.frustumCulled = false;
  const flat = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  let shown = false;
  let jiggle = 0;
  let visitor = null;
  let fish = null;
  let away = 0;
  let lastText = "";
  let depthNow = -1;

  const setDepth = (depth) => {
    if (depth === depthNow) return;
    depthNow = depth;
    floor.position.y = -FLOOR_BELOW[depth];
    kelp.position.y = -FLOOR_BELOW[depth];
    surface.position.y = SURFACE_ABOVE[depth];
    rays.position.y = SURFACE_ABOVE[depth];
    scene.fog.color.copy(PALETTE.water[depth]);
    scene.fog.density = FOG[depth];
    causticStrength.value = CAUSTIC[depth];
    sky.material.uniforms.uMid.value.copy(PALETTE.water[depth]);
  };

  const place = (mesh, position, yaw, length, roll = 0, pitch = 0) => {
    mesh.position.copy(position);
    mesh.rotation.set(roll, yaw, pitch, "YXZ");
    mesh.scale.setScalar(length / MODEL_LENGTH);
  };

  const progressOf = (rod) => {
    if (!rod.fight) return 0;
    fish.startLine ??= rod.fight.line;
    const span = Math.max(0.5, fish.startLine - FIGHT_RULES.minLine);
    return clamp01(1 - (rod.fight.line - FIGHT_RULES.minLine) / span);
  };

  const settle = (body, dt, yaw, roll, pitch, scale) => {
    const k = 1 - Math.exp(-SETTLE * dt);
    if (!fish.placed) {
      fish.view.copy(goal);
      fish.yaw = yaw;
      fish.placed = true;
    }
    fish.view.lerp(goal, k);
    const turn = Math.atan2(Math.sin(yaw - fish.yaw), Math.cos(yaw - fish.yaw));
    fish.yaw += turn * (1 - Math.exp(-TURN * dt));
    body.position.copy(fish.view);
    body.rotation.set(roll, fish.yaw, pitch, "YXZ");
    body.scale.setScalar(scale);
  };

  const stageChest = (dt, t, rod, depth, hookPos, shake) => {
    const ground = -FLOOR_BELOW[depth] + CHEST_HALF;
    const rest = hookPos.y - 0.55;
    chest.visible = true;
    let roll = 0;
    goal.set(fish.from * 0.15, Math.max(ground, rest), -0.3);
    if (rod.phase === "waiting") {
      const near = ease(clamp01(rod.time / Math.max(0.1, rod.wait)));
      hookPos.lerp(spot.set(goal.x, goal.y + CHEST_HALF + 0.06, goal.z), near);
    } else if (rod.phase === "take") {
      roll = Math.sin(t * 18) * 0.06 * shake;
    } else if (rod.phase === "fight" && rod.fight) {
      const lift = progressOf(rod);
      goal.y = lerp(Math.max(ground, rest), hookPos.y + CHEST_LIFT, lift);
      goal.z = lerp(-0.3, 0.1, lift);
      goal.x += Math.sin(t * 1.7) * 0.06 * shake;
      roll = Math.sin(t * 1.7 + 0.6) * (0.12 + 0.2 * clamp01(rod.fight.tension)) * shake;
    } else if (rod.phase === "landed") {
      goal.y = hookPos.y + clamp01(rod.time) * (SURFACE_ABOVE[depth] + 0.8);
    } else {
      goal.y = Math.max(ground, rest);
    }
    settle(chest, dt, 0, roll, 0, 1);
    if (rod.phase !== "waiting") hookPos.copy(fish.view).add(spot.set(0, CHEST_HALF + 0.06, 0));
  };

  const stageCatch = (dt, t, rod, depth, hookPos, shake) => {
    if (fish.rarity === "chest") return stageChest(dt, t, rod, depth, hookPos, shake);
    const length = LENGTH[fish.rarity] ?? LENGTH.common;
    fishSkin.color.copy(TINT[fish.rarity] ?? TINT.common);
    actor.visible = true;
    let dir = -fish.from;
    let roll = 0;
    let pitch = 0;
    goal.copy(hookPos);
    swim.value = 1;
    if (rod.phase === "waiting") {
      const arrive = (rod.nibbles > 0 ? rod.nibbleAt : rod.wait) - APPROACH;
      const near = ease(clamp01(rod.time / Math.max(0.1, arrive)));
      const peck = catchPeck(rod);
      const gap = lerp(2.4, 0.1, near) - peck * 0.09;
      goal.x = hookPos.x + fish.from * (length * 0.5 + gap);
      goal.y = hookPos.y + lerp(-0.45, -0.01, near) + Math.sin(t * 2) * 0.012;
      goal.z = lerp(-1.1, 0, near);
      pitch = lerp(-0.25, 0, near) * dir;
      swim.value = 1.4 - near * 0.9 + peck;
    } else if (rod.phase === "take") {
      goal.x = hookPos.x + fish.from * length * 0.47;
      goal.y = hookPos.y - Math.min(0.12, rod.time * 0.4);
      roll = Math.sin(t * 22) * 0.12 * shake;
      swim.value = 2;
    } else if (rod.phase === "fight" && rod.fight) {
      const pulling = PULLING.has(rod.fight.mode);
      const tension = clamp01(rod.fight.tension ?? 0);
      const near = progressOf(rod);
      const side = Math.sin(rod.fight.bearing ?? 0) >= 0 ? 1 : -1;
      dir = pulling ? side : -side * 0.6;
      goal.x = side * lerp(0.75, 0.25, near) + Math.sin(t * (pulling ? 17 : 6)) * (0.015 + 0.04 * tension) * shake;
      goal.y = lerp(-0.55, 0.05, near) + Math.sin(t * 3) * 0.05 * shake;
      goal.z = lerp(-1.3, 0.1, near) - (pulling ? 0.25 : 0);
      roll = Math.sin(t * (pulling ? 15 : 5)) * (0.12 + 0.3 * tension) * shake;
      pitch = (pulling ? -0.15 : 0.25) * Math.sign(dir || 1);
      swim.value = pulling ? 2.6 : 0.9;
    } else if (rod.phase === "landed") {
      goal.y = hookPos.y + clamp01(rod.time) * (SURFACE_ABOVE[depth] + 0.8);
      pitch = 1.1 * Math.sign(dir);
      swim.value = 2.2;
    } else {
      dir = fish.from;
      goal.x = hookPos.x + fish.from * (0.4 + rod.time * 2);
      goal.z = -rod.time;
      swim.value = 2;
    }
    const yaw = dir > 0 ? 0 : Math.PI;
    settle(actor, dt, yaw, roll, pitch, length / MODEL_LENGTH);
    const hooked = rod.phase === "take" || rod.phase === "fight" || rod.phase === "landed";
    if (hooked) hookPos.copy(facing.set(MODEL_LENGTH * MOUTH_AHEAD, 0, 0).applyEuler(actor.rotation).multiplyScalar(length / MODEL_LENGTH)).add(fish.view);
  };

  const describe = (rod) => {
    if (rod.pending) return "Decrypting your catch";
    const heavy = rod.catch?.species?.rarity === "chest";
    if (rod.phase === "take") return heavy ? "Something caught your hook. Strike now!" : "It took the bait. Strike now!";
    if (heavy && rod.phase === "fight") return "Heavy. Keep reeling";
    if (heavy && rod.phase === "waiting") return "Something heavy lies here";
    if (rod.phase === "fight") return rod.fight && PULLING.has(rod.fight.mode) ? "It pulls hard" : "Reel it in";
    if (rod.phase === "landed") return "Landed";
    if (rod.phase === "waiting" && rod.catch) return "A fish is coming";
    return "Under your float";
  };

  const pickVisitor = (hookPos) => {
    let best = shadows[0];
    for (const shadow of shadows) if (Math.abs(shadow.y) < Math.abs(best.y)) best = shadow;
    const x = best.mesh.position.x - hookPos.x;
    return { shadow: best, side: x >= 0 ? 1 : -1, hitAt: null };
  };

  const visitWeight = (rod, t) => {
    if (!visitor) return { weight: 0, peck: 0 };
    if (visitor.hitAt === null) {
      const ahead = Math.max(0, rod.nibbleAt - rod.time);
      return { weight: ease(1 - clamp01(ahead / APPROACH)), peck: Math.exp(-((ahead / PECK) ** 2)) };
    }
    const after = t - visitor.hitAt;
    return { weight: ease(1 - clamp01((after - 0.15) / LEAVE)), peck: Math.exp(-((after / PECK) ** 2)) };
  };

  const stepShadows = (dt, rod, hookPos, t) => {
    const pending = rod.pending;
    if (!pending) visitor = null;
    if (pending && !visitor && rod.nibbleAt - rod.time < APPROACH) visitor = pickVisitor(hookPos);
    const visit = pending ? visitWeight(rod, t) : { weight: 0, peck: 0 };
    if (visitor && visitor.hitAt !== null && visit.weight <= 0) visitor = null;
    for (const shadow of shadows) {
      shadow.angle += dt * shadow.speed * (pending ? 1 : 2.2);
      const reach = shadow.radius * (1 + away * 2.5);
      const x = hookPos.x + Math.cos(shadow.angle) * reach;
      const z = -0.7 + Math.sin(shadow.angle) * reach * 0.8;
      let heading = Math.atan2(-Math.cos(shadow.angle) * 0.8, -Math.sin(shadow.angle));
      spot.set(x, hookPos.y + shadow.y + Math.sin(t * 0.7 + shadow.angle) * 0.04, z);
      if (visitor?.shadow === shadow) {
        const gap = 0.02 + (1 - visit.peck) * 0.1;
        goal.set(hookPos.x + visitor.side * (SHADOW_LENGTH * 0.5 + gap), hookPos.y - 0.01, 0);
        spot.lerp(goal, visit.weight);
        const face = visitor.side > 0 ? Math.PI : 0;
        heading += Math.atan2(Math.sin(face - heading), Math.cos(face - heading)) * visit.weight;
      }
      shadow.mesh.visible = !fish;
      place(shadow.mesh, spot, heading, SHADOW_LENGTH, Math.sin(t * 1.3 + shadow.radius) * 0.08);
    }
  };

  const catchPeck = (rod) => {
    let peck = 0;
    for (let j = 0; j < rod.nibbles; j++) peck = Math.max(peck, Math.exp(-(((rod.time - (rod.nibbleAt + j * ROD.nibbleGap)) / PECK) ** 2)));
    return peck;
  };

  return {
    update(dt, { active, rod, depth, bait: baitIndex, events }) {
      const visible = active && LINE_PHASES.has(rod.phase) && rod.distance > 0 && rod.phase !== "flying";
      if (visible !== shown) {
        shown = visible;
        frame.hidden = !visible;
        document.body.classList.toggle("line-out", visible);
        if (!visible) {
          fish = null;
          visitor = null;
          away = 0;
        }
      }
      if (!visible) return;
      clock.value += dt;
      const t = clock.value;
      setDepth(depth);
      for (const event of events) {
        if (event !== "nibble") continue;
        jiggle = 0.45;
        if (rod.pending && visitor) visitor.hitAt = t;
      }
      jiggle = Math.max(0, jiggle - dt);
      if (rod.catch && !fish) fish = { rarity: rod.catch.species.rarity, from: Math.sin(t * 3.7) > 0 ? 1 : -1, view: new THREE.Vector3(), yaw: 0, placed: false, startLine: null };
      if (!rod.catch && !rod.pending && rod.phase !== "landed") away = Math.min(1, away + dt);
      const shake = reducedMotion ? 0 : 1;

      const hookPos = top.set(Math.sin(t * 1.1) * 0.03 + (jiggle > 0 ? Math.sin(t * 40) * 0.012 * shake : 0), Math.sin(t * 1.6) * 0.02, 0);
      if (rod.phase === "retrieving" || rod.phase === "lost") hookPos.y += clamp01(rod.time / 1.1) * (SURFACE_ABOVE[depth] + 0.4);
      baits.forEach((mesh, i) => (mesh.visible = i === baitIndex && (!fish || rod.phase === "waiting")));
      worm.rotation.z = Math.sin(t * 5) * 0.25;
      spoon.rotation.y = t * 3;
      bait.rotation.y = Math.sin(t * 7) * 0.3;

      actor.visible = false;
      chest.visible = false;
      if (fish) stageCatch(dt, t, rod, depth, hookPos, shake);
      shadowSwim.value = rod.pending ? 1.2 : 2.2;
      stepShadows(dt, rod, hookPos, t);

      hook.position.copy(hookPos).add(HOOK_EYE);
      const fighting = rod.phase === "fight" && rod.fight;
      const strain = fighting ? clamp01((rod.fight.tension - 0.45) / 0.5) : 0;
      lineMaterial.color.copy(PALETTE.line).lerp(PALETTE.strain, strain);
      lineMaterial.opacity = fighting ? 1 : 0.8;
      const lineTop = mouth.set(fighting ? hookPos.x * 0.15 : hookPos.x * 0.4, SURFACE_ABOVE[depth] + 0.2, 0);
      line.position.copy(hook.position);
      const span = lineTop.sub(hook.position);
      const thick = fighting ? 1.8 + strain : 1;
      line.scale.set(thick, span.length(), thick);
      line.quaternion.setFromUnitVectors(THREE.Object3D.DEFAULT_UP, span.normalize());

      const pos = specks.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        let y = pos.getY(i) + dt * RISE * (0.6 + (i % 5) * 0.12);
        if (y > SURFACE_ABOVE[depth]) y = -FLOOR_BELOW[depth];
        pos.setY(i, y);
        pos.setX(i, pos.getX(i) + Math.sin(t * 2.2 + i) * dt * 0.05);
      }
      pos.needsUpdate = true;
      sky.material.uniforms.uTime.value = t;

      camera.position.set(Math.sin(t * 0.21) * 0.08, 0.12 + Math.sin(t * 0.33) * 0.04, 1.75);
      const focus = fish?.placed ? spot.copy(hookPos).lerp(fish.view, 0.5) : spot.copy(hookPos);
      camera.lookAt(focus.x * 0.4, focus.y * 0.6 - 0.05, focus.z * 0.5 - 0.2);

      const text = describe(rod);
      if (text !== lastText) {
        lastText = text;
        caption.textContent = text;
      }
    },
    render(renderer) {
      if (!shown) return;
      const canvas = renderer.domElement;
      const box = frame.getBoundingClientRect();
      const host = canvas.getBoundingClientRect();
      if (!box.width || !host.width) return;
      const ratio = renderer.getPixelRatio();
      const scale = canvas.width / host.width / ratio;
      rect.x = (box.left - host.left) * scale;
      rect.y = (host.bottom - box.bottom) * scale;
      rect.w = box.width * scale;
      rect.h = box.height * scale;
      const width = Math.round(rect.w * ratio);
      const height = Math.round(rect.h * ratio);
      if (target.width !== width || target.height !== height) target.setSize(width, height);
      camera.aspect = box.width / box.height;
      camera.updateProjectionMatrix();
      specks.material.uniforms.uScale.value = height;
      composite.material.uniforms.uSize.value.set(width, height);
      composite.material.uniforms.uRadius.value = RADIUS * ratio * scale;
      const autoClear = renderer.autoClear;
      renderer.autoClear = true;
      renderer.setRenderTarget(target);
      renderer.render(scene, camera);
      renderer.setRenderTarget(null);
      renderer.autoClear = false;
      renderer.setViewport(rect.x, rect.y, rect.w, rect.h);
      renderer.render(composite, flat);
      renderer.setViewport(0, 0, canvas.width / ratio, canvas.height / ratio);
      renderer.autoClear = autoClear;
    },
  };
}
