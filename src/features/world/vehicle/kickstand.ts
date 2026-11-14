import { BoxGeometry, BufferAttribute, Color, CylinderGeometry, Group, Mesh, MeshStandardMaterial, TubeGeometry, CatmullRomCurve3, Vector3, type BufferGeometry } from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

/** Left frame bracket, return spring and pressed steel foot, in metres. */
export function createKickstand(): Group {
  const pivot = new Group();
  pivot.name = "kickstand";
  pivot.position.set(-.14, .275, -.12);
  const parts: BufferGeometry[] = [];
  function add(geometry: BufferGeometry, color = 0x161b1c) {
    const flat = geometry.toNonIndexed();
    geometry.dispose();
    const c = new Color(color), colors = new Float32Array(flat.getAttribute("position").count * 3);
    for (let i = 0; i < colors.length; i += 3) c.toArray(colors, i);
    flat.setAttribute("color", new BufferAttribute(colors, 3));
    parts.push(flat);
  }
  function rod(a: Vector3, b: Vector3, radius: number, color?: number) {
    const geometry = new CylinderGeometry(radius, radius, a.distanceTo(b), 12);
    // Cylinder axis is Y; place the actual welded tube between its contacts.
    const mesh = new Mesh(geometry);
    mesh.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), b.clone().sub(a).normalize());
    mesh.position.copy(a).add(b).multiplyScalar(.5); mesh.updateMatrix();
    geometry.applyMatrix4(mesh.matrix); add(geometry, color);
  }
  const ankle = new Vector3(-.19, -.226, -.08);
  rod(new Vector3(), ankle.clone().add(new Vector3(0, .008, 0)), .009);
  rod(new Vector3(-.01, .008, 0), new Vector3(.017, .008, 0), .018);
  rod(new Vector3(-.025, -.035, -.01), new Vector3(-.070, -.09, -.07), .004);
  const foot = new BoxGeometry(.047, .005, .033);
  foot.rotateZ(-9 * Math.PI / 180); foot.translate(ankle.x, ankle.y + .0025, ankle.z);
  add(foot);
  rod(ankle.clone().add(new Vector3(0, .015, 0)), ankle.clone().add(new Vector3(-.035, .015, .025)), .004);
  const start = new Vector3(.008, .035, -.016), end = new Vector3(-.085, -.105, -.04);
  const axis = end.clone().sub(start), u = new Vector3(0, 0, 1), v = axis.clone().normalize().cross(u);
  const points = Array.from({ length: 145 }, (_, i) => {
    const t = i / 144, a = t * Math.PI * 2 * 12;
    return start.clone().addScaledVector(axis, t).addScaledVector(u, .007 * Math.cos(a)).addScaledVector(v, .007 * Math.sin(a));
  });
  add(new TubeGeometry(new CatmullRomCurve3(points), 144, .0017, 5, false), 0x626968);
  const geometry = mergeGeometries(parts)!;
  parts.forEach(part => part.dispose());
  const mesh = new Mesh(geometry, new MeshStandardMaterial({ vertexColors: true, metalness: .8, roughness: .28 }));
  mesh.name = "black_steel_stand_return_spring";
  mesh.castShadow = mesh.receiveShadow = true;
  pivot.add(mesh);
  return pivot;
}
