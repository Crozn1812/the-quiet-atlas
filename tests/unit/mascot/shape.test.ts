import { afterEach, describe, expect, it, vi } from "vitest";
import { Box3, Group, Mesh, MeshToonMaterial, ShaderLib, Vector3, type WebGLProgramParametersWithUniforms, type WebGLRenderer } from "three";
import { createMascotMesh } from "../../../src/features/mascot/shape";
import { hex, PALETTE } from "../../../src/features/world/art/palette";
import { disposeRampGradients } from "../../../src/features/world/materials/ramp";

afterEach(disposeRampGradients);

describe("procedural mascot", () => {
  it("is 0.35 m tall and stays within 300 triangles, with two leaves and a thin halo", () => {
    const root = createMascotMesh();
    let triangles = 0;
    root.traverse(object => {
      if (!(object instanceof Mesh)) return;
      triangles += (object.geometry.index?.count ?? object.geometry.getAttribute("position").count) / 3;
      const positions = object.geometry.getAttribute("position");
      for (let i = 0; i < positions.count; i++) {
        expect([positions.getX(i), positions.getY(i), positions.getZ(i)].every(Number.isFinite)).toBe(true);
      }
    });
    expect(triangles).toBe(224);
    expect(triangles).toBeLessThanOrEqual(300);
    expect(new Box3().setFromObject(root).getSize(new Vector3()).y).toBeCloseTo(0.35, 6);
    expect(root.children.map(child => child.name)).toEqual(["droplet", "leaf-0", "leaf-1", "halo"]);
    const halo = root.getObjectByName("halo") as Mesh;
    expect(new Box3().setFromObject(halo).getSize(new Vector3()).y).toBeLessThan(0.006);
    root.dispose();
  });

  it("uses palette-only base, emissive and shadow hues with the soft toon ramp", () => {
    const root = createMascotMesh();
    const allowed = Object.keys(PALETTE).map(key => hex(key as keyof typeof PALETTE));
    const expected = [hex("mist"), hex("forestLight"), hex("forestLight"), hex("dusk")];
    root.children.forEach((object, i) => {
      const mesh = object as Mesh;
      const material = mesh.material as MeshToonMaterial;
      expect(material).toBeInstanceOf(MeshToonMaterial);
      expect(material.color.getHex()).toBe(expected[i]);
      expect(allowed).toContain(material.color.getHex());
      if (material.emissiveIntensity > 0 && material.emissive.getHex() !== 0) {
        expect(allowed).toContain(material.emissive.getHex());
      }
      expect(material.gradientMap).not.toBeNull();
      expect(mesh.geometry.getAttribute("color")).toBeUndefined();
      const shader = { fragmentShader: ShaderLib.toon!.fragmentShader, uniforms: {} } as WebGLProgramParametersWithUniforms;
      material.onBeforeCompile(shader, {} as WebGLRenderer);
      const shadow = shader.uniforms.rampShadowTint!.value;
      expect(allowed).toContain(shadow.getHex());
      if (i === 0) expect(shadow.getHex()).toBe(hex("water"));
    });
    root.dispose();
  });

  it("disposes owned resources once while leaving the shared ramp alive", () => {
    const root = createMascotMesh();
    const scene = new Group();
    scene.add(root);
    const geometries = root.children.map(child => (child as Mesh).geometry);
    const materials = [...new Set(root.children.map(child => (child as Mesh).material as MeshToonMaterial))];
    const spies = [...geometries, ...materials].map(resource => vi.spyOn(resource, "dispose"));
    const rampSpy = vi.spyOn(materials[0]!.gradientMap!, "dispose");
    root.dispose();
    root.dispose();
    expect(root.parent).toBeNull();
    spies.forEach(spy => expect(spy).toHaveBeenCalledTimes(1));
    expect(rampSpy).not.toHaveBeenCalled();
  });
});
