import { BoxGeometry, Mesh, MeshBasicMaterial, Quaternion, Vector3 } from "three";
export const RADIUS = 0.35;
export const HALF_HEIGHT = 0.55;
export const HEIGHT = RADIUS + HALF_HEIGHT;
export const SLOPE_LIMIT = Math.PI / 4;
export const boxes = [
  { position: [0, -0.25, 0], size: [30, 0.5, 30], angle: 0 },
  { position: [0, 0.65, -4], size: [4, 0.3, 6], angle: Math.PI / 12 },
  ...[-3, 3, 5].map((x) => ({ position: [x, 1, -2], size: [0.8, 2, 0.8], angle: 0 })),
];
export function createObstacles() {
  return boxes.map((box, i) => {
    const mesh = new Mesh(new BoxGeometry(box.size[0], box.size[1], box.size[2]), new MeshBasicMaterial({ color: i === 1 ? 0x9caa71 : 0x667b80 }));
    mesh.position.fromArray(box.position);
    mesh.rotation.x = box.angle;
    mesh.updateMatrixWorld(true);
    return mesh;
  });
}
export const rotation = (angle: number) => new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), angle);
export interface Controller {
  position: Vector3;
  step(x: number, z: number, dt: number): void;
  resetVelocity(): void;
  dispose(): void;
}
