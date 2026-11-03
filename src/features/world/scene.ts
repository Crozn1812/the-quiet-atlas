import { BoxGeometry, Mesh, MeshBasicMaterial, Quaternion, Vector3 } from "three";
export const RADIUS = 0.35;
export const HALF_HEIGHT = 0.55;
export const HEIGHT = RADIUS + HALF_HEIGHT;
export const SLOPE_LIMIT = Math.PI / 4;
export const steepRamp = {
  position: [-4, 1.65, 0],
  size: [3, 0.3, 4],
  angle: Math.PI / 3,
};
export const boxes = [
  steepRamp,
  { position: [0, -0.25, 0], size: [30, 0.5, 30], angle: 0 },
  { position: [0, 0.65, -4], size: [4, 0.3, 6], angle: Math.PI / 12 },
  ...[-3, 3, 5].map((x) => ({ position: [x, 1, -2], size: [0.8, 2, 0.8], angle: 0 })),
];
export function createObstacles(items = boxes) {
  return items.map((box) => {
    const mesh = new Mesh(new BoxGeometry(box.size[0], box.size[1], box.size[2]), new MeshBasicMaterial({ color: box.angle > 0 ? 0x9caa71 : 0x667b80 }));
    mesh.position.fromArray(box.position);
    mesh.rotation.x = box.angle;
    mesh.updateMatrixWorld(true);
    return mesh;
  });
}
export const rotation = (angle: number) => new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), angle);
export interface Controller {
  position: Vector3;
  readonly grounded: boolean;
  readonly verticalVelocity: number;
  teleport(position: { x: number; y: number; z: number }): void;
  step(x: number, z: number, dt: number): void;
  resetVelocity(): void;
  dispose(): void;
}
