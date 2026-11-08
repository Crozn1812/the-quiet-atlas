"""Original palette-only trees. Blender -b --factory-startup -P this.py -- <raw-dir>.

Then: node tools/assets/optimize.mjs <raw.glb> <public.glb> --texture=none
Metres, Z up; runtime moves the root to crown-local Y=-5. No external assets.
"""
import math
import os
import random
import sys
import bpy
from mathutils import Vector


def linear(value):
    return tuple((c / 12.92 if c <= 0.04045 else ((c + .055) / 1.055) ** 2.4)
                 for c in (int(value[i:i + 2], 16) / 255 for i in (0, 2, 4)))


DEEP, LIGHT, GRASS = map(linear, ("2F5446", "5E8C6A", "7BA44A"))
BARK, DARK = map(linear, ("8C8476", "5A554E"))


def mix(a, b, t):
    return tuple(x * (1 - t) + y * t for x, y in zip(a, b))


def tube(points, radii, sides=6):
    vertices, faces = [], []
    axis = (Vector(points[-1]) - Vector(points[0])).normalized()
    side = axis.cross(Vector((0, 1, 0))).normalized()
    up = axis.cross(side).normalized()
    for point, radius in zip(points, radii):
        for j in range(sides):
            angle = j * math.tau / sides
            vertices.append(Vector(point) + radius * (side * math.cos(angle) + up * math.sin(angle)))
    for ring in range(len(points) - 1):
        for j in range(sides):
            a, b = ring * sides + j, ring * sides + (j + 1) % sides
            faces.extend(((a, b, a + sides), (b, b + sides, a + sides)))
    mesh = bpy.data.meshes.new("wood")
    mesh.from_pydata(vertices, [], faces)
    obj = bpy.data.objects.new("wood", mesh)
    bpy.context.collection.objects.link(obj)


def tree(kind, variant, output):
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    rng = random.Random(4302 + variant + (100 if kind == "pine" else 0))
    pine = kind == "pine"
    height = 15 + variant if pine else 8.7 + variant * .25
    phase = variant * .71
    # Broad root flare, gentle bend and a taper that reaches into the crown.
    tube([(0, 0, 0), (.04, -.03, 1.2), (.12, .02, height * .55),
          (.18, .06, height * .91)], [.49, .29, .20, .045])
    for branch in range(4):
        a = phase + branch * math.tau / 4
        z = height * (.70 + branch * .035) if pine else 4.3 + branch * .38
        reach = 1.4 if pine else 2.0
        end = (math.cos(a) * reach, math.sin(a) * reach, z + (-.20 if pine else 1.4))
        tube([(.10, 0, z), (end[0] * .5, end[1] * .5, z + .35), end], [.16, .10, .035], 4)
    # Scalloped sprays replace the old identical icospheres. Forty faces each;
    # wide, separated lobes leave genuine sky gaps between the main limbs.
    for bunch in range(9 if pine else 7):
        if pine:
            tier, arm = divmod(bunch, 3)
            a = phase + arm * math.tau / 3 + tier * 1.1
            r = (1.05, .75, .38)[tier]
            center = (math.cos(a) * r, math.sin(a) * r, height * .68 + tier * height * .115)
            width, depth, thickness = 1.32 - tier * .32, .83 - tier * .19, .55 - tier * .08
        else:
            tier = int(bunch >= 4)
            a = phase + (bunch if not tier else bunch - 4) * math.tau / (3 if tier else 4)
            r = (1.45 if not tier else .77) + rng.uniform(-.14, .14)
            center = (math.cos(a) * r, math.sin(a) * r, (5.85 if not tier else 7.28) + rng.uniform(-.24, .24))
            width, depth, thickness = 1.30 + rng.random() * .17, 1.05 + rng.random() * .15, .90 + rng.random() * .12
        vertices = [(center[0], center[1], center[2] - thickness * .65)]
        for ring in range(2):
            for j in range(10):
                angle = j * math.tau / 10
                scallop = (1 if j % 2 == 0 else .72) * rng.uniform(.94, 1.06)
                x = math.cos(angle) * width * scallop * (1 if ring == 0 else .65)
                y = math.sin(angle) * depth * scallop * (1 if ring == 0 else .65)
                droop = -.45 * max(0, math.cos(angle)) if pine else -.12 * abs(math.sin(angle))
                z = center[2] + droop + (thickness * .50 if ring else -thickness * .18)
                vertices.append((center[0] + x * math.cos(a) - y * math.sin(a),
                                 center[1] + x * math.sin(a) + y * math.cos(a), z))
        vertices.append((center[0] - .12 * math.cos(a), center[1] - .12 * math.sin(a), center[2] + thickness))
        faces = []
        for j in range(10):
            u, v = 1 + j, 1 + (j + 1) % 10
            faces.extend(((0, v, u), (u, v, u + 10), (v, v + 10, u + 10), (u + 10, v + 10, 21)))
        mesh = bpy.data.meshes.new("scalloped-leaf-spray")
        mesh.from_pydata(vertices, [], faces)
        mesh.update()
        obj = bpy.data.objects.new("leaves", mesh)
        bpy.context.collection.objects.link(obj)
        for polygon in mesh.polygons:
            polygon.use_smooth = True
    bpy.context.view_layer.update()
    depsgraph = bpy.context.evaluated_depsgraph_get()
    # Deterministic hemispherical ray AO, baked into linear vertex colour.
    for obj in list(bpy.context.scene.objects):
        if obj.type != "MESH":
            continue
        colors = obj.data.color_attributes.new(name="Color", type="FLOAT_COLOR", domain="POINT")
        obj.data.color_attributes.active_color_index = 0
        obj.data.color_attributes.render_color_index = 0
        leaf = obj.name.startswith("leaves")
        for v in obj.data.vertices:
            point = obj.matrix_world @ v.co
            normal = (obj.matrix_world.to_3x3() @ v.normal).normalized()
            blocked = 0
            for sample in range(24):
                z = (sample + .5) / 24
                angle = sample * 2.39996323
                direction = Vector((math.sqrt(1 - z * z) * math.cos(angle),
                                    math.sqrt(1 - z * z) * math.sin(angle), z))
                if direction.dot(normal) < 0:
                    direction = -direction
                hit = bpy.context.scene.ray_cast(depsgraph, point + normal * .018, direction, distance=2.4)[0]
                blocked += int(hit)
            ao = 1 - .30 * blocked / 24
            t = min(1, max(0, (point.z / height - .52) / .48))
            pigment = mix(mix(DEEP, LIGHT, .38 + .62 * t), GRASS, .10 * t) if leaf else mix(DARK, BARK, .40)
            colors.data[v.index].color = (*(c * ao for c in pigment), 1)
        mat = bpy.data.materials.get("vertex-pigment") or bpy.data.materials.new("vertex-pigment")
        mat.diffuse_color = (1, 1, 1, 1)
        mat.use_nodes = True
        shader = mat.node_tree.nodes.get("Principled BSDF")
        shader.inputs["Roughness"].default_value = 1
        obj.data.materials.append(mat)
    path = os.path.join(output, f"tree-{kind}-{variant + 1}.glb")
    bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", export_yup=True,
                              export_vertex_color="ACTIVE",
                              export_animations=False, export_cameras=False, export_lights=False)
    triangles = sum(len(p.vertices) - 2 for obj in bpy.context.scene.objects if obj.type == "MESH" for p in obj.data.polygons)
    print(f"G-02 {kind}-{variant + 1}: {triangles} triangles; ray AO 24 samples/vertex")


args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
if len(args) != 1:
    raise SystemExit("Expected raw output directory")
os.makedirs(args[0], exist_ok=True)
for species in ("broadleaf", "pine"):
    for seed in range(3):
        tree(species, seed, args[0])
