import { Box3, BufferGeometry, Float32BufferAttribute, Vector3 } from "three";

/** Connected solids in an already merged render batch. No simulation data is read. */
export function surfaceComponents(source: BufferGeometry) {
  const p = source.getAttribute("position"), count = p.count / 3;
  const parents = Array.from({ length: count }, (_, i) => i);
  const root = (i: number): number => { while (parents[i] !== i) { parents[i] = parents[parents[i]!]!; i = parents[i]!; } return i; };
  const vertices = new Map<string, number>();
  for (let i = 0; i < p.count; i++) {
    const key = `${Math.round(p.getX(i)*1e5)},${Math.round(p.getY(i)*1e5)},${Math.round(p.getZ(i)*1e5)}`;
    const previous = vertices.get(key), triangle = Math.floor(i / 3);
    if (previous === undefined) vertices.set(key, triangle);
    else parents[root(triangle)] = root(previous);
  }
  const groups = new Map<number, { vertices: number[]; bounds: Box3 }>();
  const point = new Vector3();
  for (let i = 0; i < p.count; i++) {
    const key = root(Math.floor(i/3));
    let group = groups.get(key);
    if (!group) { group = { vertices: [], bounds: new Box3() }; groups.set(key, group); }
    group.vertices.push(i); group.bounds.expandByPoint(point.fromBufferAttribute(p, i));
  }
  return [...groups.values()];
}

/** Metre-based sawn-wood UVs. A whole solid selects its grain axis once;
 * adjacent triangles never refit their UV density or acquire random seams.
 */
export function timberSurfaceGeometry(source: BufferGeometry, grain?: "x" | "y" | "z") {
  const geometry = source.index ? source.toNonIndexed() : source.clone();
  geometry.computeVertexNormals();
  const p = geometry.getAttribute("position"), n = geometry.getAttribute("normal");
  const uv = new Float32Array(p.count*2), tangents = new Float32Array(p.count*4);
  const uAxes = new Float32Array(p.count*3), vAxes = new Float32Array(p.count*3);
  const size = new Vector3(), normal = new Vector3(), tangent = new Vector3(), cross = new Vector3();
  for (const component of surfaceComponents(geometry)) {
    component.bounds.getSize(size);
    const along = grain ?? (size.y > size.x && size.y > size.z ? "y" : size.z > size.x ? "z" : "x");
    for (let triangle = 0; triangle < component.vertices.length; triangle += 3) {
      const index = component.vertices[triangle]!;
      normal.fromBufferAttribute(n, index);
      const face = Math.abs(normal.x) > Math.abs(normal.y) && Math.abs(normal.x) > Math.abs(normal.z) ? "x"
        : Math.abs(normal.y) > Math.abs(normal.z) ? "y" : "z";
      const remaining = (["x", "y", "z"] as const).filter(a => a !== face);
      const vAxis = face === along ? remaining[1]! : along;
      const uAxis = remaining.find(a => a !== vAxis)!;
      for (let j = 0; j < 3; j++) {
        const i = component.vertices[triangle+j]!;
        const point = new Vector3().fromBufferAttribute(p, i);
        uv[i*2] = point[uAxis] / .5; uv[i*2+1] = point[vAxis] / 2;
        uAxes[i*3+(uAxis==="x"?0:uAxis==="y"?1:2)]=1;
        vAxes[i*3+(vAxis==="x"?0:vAxis==="y"?1:2)]=1;
        normal.fromBufferAttribute(n, i);
        tangent.set(uAxis === "x" ? 1 : 0, uAxis === "y" ? 1 : 0, uAxis === "z" ? 1 : 0)
          .addScaledVector(normal, -normal[uAxis]).normalize();
        cross.crossVectors(normal,tangent);
        tangents.set([tangent.x,tangent.y,tangent.z,cross[vAxis] < 0 ? -1 : 1], i*4);
      }
    }
  }
  geometry.setAttribute("uv",new Float32BufferAttribute(uv,2));
  geometry.setAttribute("tangent",new Float32BufferAttribute(tangents,4));
  geometry.setAttribute("surfaceUAxis",new Float32BufferAttribute(uAxes,3));
  geometry.setAttribute("surfaceVAxis",new Float32BufferAttribute(vAxes,3));
  geometry.computeBoundingBox();geometry.computeBoundingSphere();
  return geometry;
}

/** Match all three PBR maps under nonuniform instancing, with a different
 * grain phase per board. The same physical metre scale survives every LOD.
 */
export function bindTimberUv(material: import("three").MeshStandardMaterial, coating: boolean) {
  material.onBeforeCompile=shader=>{
    shader.vertexShader=shader.vertexShader.replace("#include <common>",`#include <common>
attribute vec3 surfaceUAxis;
attribute vec3 surfaceVAxis;
varying vec3 vSurfacePoint;`)
      .replace("#include <uv_vertex>",`#include <uv_vertex>
vSurfacePoint=position;
#ifdef USE_INSTANCING
  vec3 metres=vec3(length(instanceMatrix[0].xyz),length(instanceMatrix[1].xyz),length(instanceMatrix[2].xyz));
  vec2 scaleUv=vec2(dot(surfaceUAxis,metres),dot(surfaceVAxis,metres));
  float seed=dot(instanceMatrix[3].xz,vec2(12.9898,78.233));
  vec2 phase=fract(sin(vec2(seed,seed+3.7))*43758.5453);
  #ifdef USE_MAP
    vMapUv=vMapUv*scaleUv+phase;
  #endif
  #ifdef USE_NORMALMAP
    vNormalMapUv=vNormalMapUv*scaleUv+phase;
  #endif
  #ifdef USE_ROUGHNESSMAP
    vRoughnessMapUv=vRoughnessMapUv*scaleUv+phase;
  #endif
  #ifdef USE_METALNESSMAP
    vMetalnessMapUv=vMetalnessMapUv*scaleUv+phase;
  #endif
  #ifdef USE_EMISSIVEMAP
    vEmissiveMapUv=vEmissiveMapUv*scaleUv+phase;
  #endif
#endif`);
    if(coating) shader.fragmentShader=shader.fragmentShader.replace("#include <common>","#include <common>\nvarying vec3 vSurfacePoint;")
      .replace("#include <color_fragment>",`#include <color_fragment>
float grime=(1.0-smoothstep(.02,.34,vSurfacePoint.y))*.32;
float chip=pow(max(0.0,sin(vSurfacePoint.x*431.0+vSurfacePoint.y*97.0)*sin(vSurfacePoint.z*281.0-vSurfacePoint.y*157.0)),16.0);
diffuseColor.rgb*=1.0-grime-chip*.27;`);
  };
  material.customProgramCacheKey=()=>coating?"coastal-pbr-weathering-v1":"sawn-timber-metre-uv-v1";
}
