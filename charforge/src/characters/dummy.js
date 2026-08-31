import * as THREE from 'three';

// Minimal rigid-part character that proves the capture loop: a capsule body
// with sphere hands and a bobbing idle clip.
export function build() {
  const root = new THREE.Group();
  root.name = 'dummy';

  const mat = new THREE.MeshStandardMaterial({ color: '#d8804a', roughness: 0.8 });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 0.5, 6, 16), mat);
  body.position.y = 0.7;
  body.name = 'body';
  root.add(body);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 24, 18),
    new THREE.MeshStandardMaterial({ color: '#f0c090', roughness: 0.7 }));
  head.position.y = 1.35;
  head.name = 'head';
  root.add(head);

  for (const side of [-1, 1]) {
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.12, 16, 12), mat);
    hand.position.set(side * 0.45, 0.75, 0.05);
    hand.name = side < 0 ? 'handL' : 'handR';
    root.add(hand);
  }

  const idle = new THREE.AnimationClip('idle', 1.6, [
    new THREE.VectorKeyframeTrack('body.position', [0, 0.8, 1.6],
      [0, 0.7, 0, 0, 0.74, 0, 0, 0.7, 0]),
    new THREE.VectorKeyframeTrack('head.position', [0, 0.8, 1.6],
      [0, 1.35, 0, 0, 1.41, 0, 0, 1.35, 0]),
  ]);

  return { root, clips: [idle], meta: { height: 1.6 } };
}
