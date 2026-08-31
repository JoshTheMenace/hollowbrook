import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { VRMLoaderPlugin, VRMUtils } from "@pixiv/three-vrm";

const duration = {
  nod: 650, wave: 1800, point: 1400, bow: 1500, walk_forward: 2300, walk_back: 2300,
  strafe_left: 2000, strafe_right: 2000, turn_left: 1500, turn_right: 1500, jump: 950, dance: 3000
};
const faceByViseme = { A: "aa", E: "ee", O: "oh", U: "ou", M: "", F: "ih", S: "ih", L: "aa", rest: "" };
const expressionByEmotion = { happy: "happy", amused: "relaxed", skeptical: "angry", confused: "surprised", concerned: "sad", embarrassed: "relaxed", excited: "happy" };
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const ease = value => .5 - Math.cos(Math.PI * clamp(value, 0, 1)) / 2;

export class VrmActorRenderer {
  constructor(root) {
    this.root = root;
    this.canvas = root.querySelector("#actor-canvas");
    this.loading = root.querySelector("#model-loading");
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, alpha: true, antialias: true, powerPreference: "high-performance" });
    Object.assign(this.renderer, { outputColorSpace: THREE.SRGBColorSpace, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.08 });
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(27, 1, .1, 30);
    this.camera.position.set(0, 1.18, 4.5);
    this.controls = new OrbitControls(this.camera, this.canvas);
    Object.assign(this.controls, { enablePan: false, enableDamping: true, dampingFactor: .08, minDistance: 2.7, maxDistance: 6.5, minPolarAngle: .72, maxPolarAngle: 1.68 });
    this.controls.target.set(0, 1.05, 0);
    this.avatarRoot = new THREE.Group();
    this.scene.add(this.avatarRoot);
    this.addStudio();
    this.state = null;
    this.vrm = null;
    this.bones = {};
    this.motion = { name: "none", startedAt: 0, from: new THREE.Vector3(), yaw: 0 };
    this.position = new THREE.Vector3();
    this.yaw = 0;
    this.load();
  }

  addStudio() {
    this.scene.add(new THREE.HemisphereLight(0xd9efff, 0x182038, 2.2));
    const key = new THREE.DirectionalLight(0xffffff, 3.4);
    key.position.set(2.6, 4.5, 3.4); key.castShadow = true; key.shadow.mapSize.set(1024, 1024); this.scene.add(key);
    const rim = new THREE.DirectionalLight(0x6b8cff, 4.2);
    rim.position.set(-3, 2.8, -2.2); this.scene.add(rim);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(2.8, 64), new THREE.MeshStandardMaterial({ color: 0x0a1224, roughness: .58, metalness: .3, transparent: true, opacity: .9 }));
    floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; this.scene.add(floor);
    const ring = new THREE.Mesh(new THREE.RingGeometry(1.1, 1.12, 96), new THREE.MeshBasicMaterial({ color: 0x55ddd8, transparent: true, opacity: .34, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = .005; this.scene.add(ring);
  }

  async load() {
    try {
      const loader = new GLTFLoader();
      loader.register(parser => new VRMLoaderPlugin(parser));
      const gltf = await loader.loadAsync("models/mira.vrm");
      this.vrm = gltf.userData.vrm;
      VRMUtils.rotateVRM0(this.vrm);
      this.armSign = this.vrm.meta.metaVersion === "0" ? -1 : 1;
      const box = new THREE.Box3().setFromObject(this.vrm.scene);
      const scale = 1.72 / box.getSize(new THREE.Vector3()).y;
      this.vrm.scene.scale.setScalar(scale);
      const scaledBox = new THREE.Box3().setFromObject(this.vrm.scene);
      this.vrm.scene.position.y = -scaledBox.min.y;
      this.vrm.scene.traverse(object => { object.castShadow = object.isMesh; object.frustumCulled = false; });
      this.avatarRoot.add(this.vrm.scene);
      ["hips", "spine", "chest", "upperChest", "neck", "head", "leftUpperArm", "leftLowerArm", "rightUpperArm", "rightLowerArm", "leftUpperLeg", "leftLowerLeg", "rightUpperLeg", "rightLowerLeg", "leftFoot", "rightFoot"].forEach(name => { this.bones[name] = this.vrm.humanoid.getNormalizedBoneNode(name); });
      this.loading.hidden = true;
    } catch (error) {
      this.loading.querySelector("span").textContent = "Unable to load the humanoid rig";
      console.error(error);
    }
  }

  reset() { this.position.set(0, 0, 0); this.yaw = 0; this.motion.name = "none"; this.setCameraPreset("full"); }

  setCameraPreset(name) {
    const preset = { full: [4.5, 1.18, 1.05], medium: [3.15, 1.35, 1.25], portrait: [2.05, 1.5, 1.47] }[name] || [4.5, 1.18, 1.05];
    this.camera.position.set(this.avatarRoot.position.x, preset[1], this.avatarRoot.position.z + preset[0]);
    this.controls.target.set(this.avatarRoot.position.x, preset[2], this.avatarRoot.position.z);
    this.controls.update();
  }

  render(state) {
    this.state = state;
    this.resize();
    this.controls.update();
    if (this.vrm) this.animate(state, performance.now());
    this.renderer.render(this.scene, this.camera);
  }

  resize() {
    const width = this.canvas.clientWidth, height = this.canvas.clientHeight;
    const ratio = Math.min(devicePixelRatio, 2);
    if (this.canvas.width !== Math.round(width * ratio) || this.canvas.height !== Math.round(height * ratio)) {
      this.renderer.setPixelRatio(ratio); this.renderer.setSize(width, height, false); this.camera.aspect = width / height; this.camera.updateProjectionMatrix();
    }
  }

  animate(state, now) {
    if (state.gesture !== this.motion.name) {
      if (state.gesture !== "none") this.motion = { name: state.gesture, startedAt: now, from: this.position.clone(), yaw: this.yaw };
      else this.motion.name = "none";
    }
    const elapsed = (now - this.motion.startedAt) / 1000;
    const progress = clamp((now - this.motion.startedAt) / (duration[this.motion.name] || 1), 0, 1);
    const phase = Math.sin(elapsed * 8.5);
    const pose = {
      hips: { x: 0, y: 0, z: 0 }, spine: { x: 0, y: 0, z: 0 }, chest: { x: 0, y: 0, z: 0 }, upperChest: { x: 0, y: 0, z: 0 }, neck: { x: 0, y: 0, z: 0 }, head: { x: 0, y: 0, z: 0 },
      leftUpperArm: { x: .05, y: 0, z: -1.18 * this.armSign }, rightUpperArm: { x: .05, y: 0, z: 1.18 * this.armSign }, leftLowerArm: { x: 0, y: 0, z: -.12 * this.armSign }, rightLowerArm: { x: 0, y: 0, z: .12 * this.armSign },
      leftUpperLeg: { x: 0, y: 0, z: 0 }, rightUpperLeg: { x: 0, y: 0, z: 0 }, leftLowerLeg: { x: 0, y: 0, z: 0 }, rightLowerLeg: { x: 0, y: 0, z: 0 }, leftFoot: { x: 0, y: 0, z: 0 }, rightFoot: { x: 0, y: 0, z: 0 }
    };
    const breath = Math.sin(now / 900) * (.012 + state.energy * .008);
    pose.upperChest.x = breath;
    pose.head.y = ({ left: .34, right: -.34, away: .24 }[state.gaze] || 0) * state.gazeIntensity;
    pose.head.x = state.gaze === "down" ? .22 * state.gazeIntensity : 0;
    if (state.conversation === "speaking" && this.motion.name === "none") { pose.leftUpperArm.x += Math.sin(now / 520) * .08; pose.rightUpperArm.x -= Math.sin(now / 610) * .1; }

    const name = this.motion.name;
    if (["walk_forward", "walk_back", "strafe_left", "strafe_right"].includes(name)) {
      pose.leftUpperLeg.x = phase * .62; pose.rightUpperLeg.x = -phase * .62;
      pose.leftLowerLeg.x = Math.max(0, -phase) * .72; pose.rightLowerLeg.x = Math.max(0, phase) * .72;
      pose.leftUpperArm.x = -phase * .42; pose.rightUpperArm.x = phase * .42;
      this.position.copy(this.motion.from);
      const travel = ease(progress) * .48;
      if (name === "walk_forward") this.position.z += travel;
      if (name === "walk_back") this.position.z -= travel;
      if (name === "strafe_left") this.position.x -= travel;
      if (name === "strafe_right") this.position.x += travel;
      this.position.x = clamp(this.position.x, -.72, .72); this.position.z = clamp(this.position.z, -.45, .62);
      this.avatarRoot.position.y = Math.abs(Math.sin(elapsed * 8.5)) * .035;
    } else if (name === "turn_left" || name === "turn_right") {
      this.yaw = this.motion.yaw + ease(progress) * (name === "turn_left" ? .82 : -.82);
    } else if (name === "wave") {
      pose.rightUpperArm.z = -.2 * this.armSign; pose.rightUpperArm.x = -.12; pose.rightLowerArm.z = (-1.25 + Math.sin(elapsed * 10) * .22) * this.armSign;
    } else if (name === "point") {
      pose.rightUpperArm.y = 1.18; pose.rightUpperArm.z = .18; pose.rightLowerArm.z = 0;
    } else if (name === "bow") {
      pose.spine.x = Math.sin(Math.PI * progress) * .58; pose.head.x = -.16;
    } else if (name === "jump") {
      this.avatarRoot.position.y = Math.sin(Math.PI * progress) * .42; pose.leftUpperLeg.x = pose.rightUpperLeg.x = -.28; pose.leftLowerLeg.x = pose.rightLowerLeg.x = .48;
    } else if (name === "dance") {
      this.avatarRoot.position.y = Math.abs(Math.sin(elapsed * 5)) * .06; pose.hips.z = Math.sin(elapsed * 5) * .2; pose.leftUpperLeg.x = phase * .28; pose.rightUpperLeg.x = -phase * .28; pose.leftUpperArm.z = (-1.5 + Math.sin(elapsed * 4) * .45) * this.armSign; pose.rightUpperArm.z = (1.5 + Math.sin(elapsed * 4 + Math.PI) * .45) * this.armSign;
    } else if (name === "nod") pose.head.x = Math.sin(Math.PI * progress) * .35;
    else this.avatarRoot.position.y *= .78;

    this.avatarRoot.position.x = THREE.MathUtils.lerp(this.avatarRoot.position.x, this.position.x, .16);
    this.avatarRoot.position.z = THREE.MathUtils.lerp(this.avatarRoot.position.z, this.position.z, .16);
    this.avatarRoot.rotation.y = THREE.MathUtils.lerp(this.avatarRoot.rotation.y, this.yaw, .12);
    Object.entries(pose).forEach(([bone, rotation]) => this.poseBone(bone, rotation));
    this.setExpressions(state);
    this.vrm.update(1 / 60);
  }

  poseBone(name, target) {
    const bone = this.bones[name]; if (!bone) return;
    bone.rotation.x = THREE.MathUtils.lerp(bone.rotation.x, target.x, .22);
    bone.rotation.y = THREE.MathUtils.lerp(bone.rotation.y, target.y, .22);
    bone.rotation.z = THREE.MathUtils.lerp(bone.rotation.z, target.z, .22);
  }

  setExpressions(state) {
    const manager = this.vrm.expressionManager; if (!manager) return;
    ["aa", "ih", "ou", "ee", "oh", "blinkLeft", "blinkRight", "happy", "relaxed", "angry", "sad", "surprised"].forEach(name => { if (manager.getExpression(name)) manager.setValue(name, 0); });
    const viseme = faceByViseme[state.viseme];
    if (viseme && manager.getExpression(viseme)) manager.setValue(viseme, state.mouth * .85);
    if (state.blink) ["blinkLeft", "blinkRight"].forEach(name => { if (manager.getExpression(name)) manager.setValue(name, 1); });
    const emotion = expressionByEmotion[state.emotion];
    if (emotion && manager.getExpression(emotion)) manager.setValue(emotion, state.emotionIntensity * .65);
  }
}
