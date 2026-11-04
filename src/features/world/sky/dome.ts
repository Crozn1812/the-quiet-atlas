import { BackSide, Color, Mesh, ShaderMaterial, SphereGeometry, Vector3 } from "three";
import { PALETTE } from "../art/palette";
import { lightingAt, type LightingGrade } from "./grade";

/** One camera-centered sphere, no textures; radius must fit inside the camera's far plane. */
export function createSkyDome(initial: LightingGrade = lightingAt(0), radius = 80) {
  if (!Number.isFinite(radius) || radius <= 0) throw new RangeError("Sky radius must be finite and positive");
  const material = new ShaderMaterial({
    uniforms: {
      skyTop: { value: initial.skyTop.clone() },
      skyHorizon: { value: initial.skyHorizon.clone() },
      paper: { value: new Color(PALETTE.paper) },
    },
    vertexShader: `
      varying float skyHeight;
      void main() {
        skyHeight = normalize(position).y;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 skyTop;
      uniform vec3 skyHorizon;
      uniform vec3 paper;
      varying float skyHeight;
      void main() {
        float height = max(skyHeight, 0.0);
        vec3 color = mix(skyHorizon, skyTop, smoothstep(0.0, 0.85, height));
        float paperBand = 1.0 - smoothstep(0.0, 0.12, abs(skyHeight));
        gl_FragColor = vec4(mix(color, paper, 0.06 * paperBand), 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
    side: BackSide,
    depthWrite: false,
    depthTest: false,
  });
  const mesh = new Mesh(new SphereGeometry(radius, 24, 12), material);
  mesh.name = "position-graded-sky";
  mesh.frustumCulled = false;
  mesh.renderOrder = -1000;
  mesh.raycast = () => {};
  const center = new Vector3();
  // Only translation follows the camera: looking around cannot rotate the sky gradient.
  mesh.onBeforeRender = (_renderer, _scene, camera) => {
    mesh.matrixWorld.setPosition(camera.getWorldPosition(center));
  };
  let disposed = false;
  return {
    mesh,
    update(grade: LightingGrade): void {
      material.uniforms.skyTop!.value.copy(grade.skyTop);
      material.uniforms.skyHorizon!.value.copy(grade.skyHorizon);
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      mesh.removeFromParent();
      mesh.geometry.dispose();
      material.dispose();
    },
  };
}
