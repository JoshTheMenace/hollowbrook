import * as THREE from 'three';

// A neutral presentation stage: gradient backdrop, soft ground shadow,
// three-point light rig. Characters are authored in metres, feet at y=0,
// facing +Z. The stage never competes with the character for attention.
export function buildStage(scene, renderer) {
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  // Gradient backdrop via a big vertex-colored dome.
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(60, 24, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        top: { value: new THREE.Color('#2c3244') },
        bottom: { value: new THREE.Color('#12141a') },
      },
      vertexShader: `varying vec3 vPos; void main(){ vPos = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `varying vec3 vPos; uniform vec3 top; uniform vec3 bottom;
        void main(){ float t = clamp(vPos.y/40.0 + 0.35, 0.0, 1.0); gl_FragColor = vec4(mix(bottom, top, t), 1.0); }`,
    })
  );
  scene.add(sky);

  // Ground disc + shadow catcher.
  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(7, 48),
    new THREE.MeshStandardMaterial({ color: '#23262f', roughness: 1 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // Key light — warm, high, from front-left; the only shadow caster.
  const key = new THREE.DirectionalLight('#fff1dc', 2.6);
  key.position.set(-2.5, 4.5, 3.5);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -3; key.shadow.camera.right = 3;
  key.shadow.camera.top = 4; key.shadow.camera.bottom = -1;
  key.shadow.bias = -0.0004;
  key.shadow.radius = 4;
  scene.add(key);

  // Cool fill from the right, violet-tinted shade rather than black.
  const fill = new THREE.DirectionalLight('#8f9bd4', 0.9);
  fill.position.set(3.5, 2.0, 1.5);
  scene.add(fill);

  // Rim from behind to pop the silhouette.
  const rim = new THREE.DirectionalLight('#cfe4ff', 1.4);
  rim.position.set(0.5, 3.0, -4.0);
  scene.add(rim);

  const hemi = new THREE.HemisphereLight('#3d4356', '#1a1a20', 0.7);
  scene.add(hemi);

  return { key, fill, rim, hemi, ground, sky };
}
