"""Original character study. Blender -b -P this.py -- <output-directory>.

Metres, Z up, facing -Y. No rig; separate visual approval precedes production.
"""
import math
import os
import sys

import bpy
from mathutils import Matrix, Vector


# Source: src/features/world/art/palette.ts (sRGB).
PAPER = "#EEE8D8"
INK = "#2B2A26"
FOREST_LIGHT = "#5E8C6A"
DUSK = "#E2B65C"
# Character-only cloth and warm skin colors, outside the environment palette.
CREAM_WHITE = "#F4F0E6"
SKIN = "#D9B48F"
HEIGHT = 1.72
NECK_LENGTH = 0.125
NECK_RADIUS = 0.056
LEG_WIDTH_SCALE = 1.35
ARM_WIDTH_SCALE = 1.20
SHOE_SCALE = 1.12
STRAP_WIDTH = 0.011
HAIR_CROWN_HEIGHT = 0.045
MAX_TRIANGLES = 12000
MAX_BYTES = 600000


def linear_color(value):
    srgb = [int(value[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    return tuple(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
                 for c in srgb)


def material(name, value, tint=None, amount=0):
    color = linear_color(value)
    if tint:
        color = tuple(a * (1 - amount) + b * amount
                      for a, b in zip(color, linear_color(tint)))
    result = bpy.data.materials.new(name)
    result.diffuse_color = (*color, 1)
    result.use_nodes = True
    shader = result.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = (*color, 1)
    shader.inputs["Roughness"].default_value = 1
    shader.inputs["Metallic"].default_value = 0
    return result


def finish(name, mat):
    obj = bpy.context.object
    obj.name = name
    obj.data.materials.append(mat)
    for polygon in obj.data.polygons:
        polygon.use_smooth = False
    return obj


def oval(name, center, scale, mat):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=12, ring_count=8, location=center)
    obj = finish(name, mat)
    obj.scale = scale
    return obj


def box(name, center, size, mat, bevel=0.01):
    bpy.ops.mesh.primitive_cube_add(size=1, location=center)
    obj = finish(name, mat)
    obj.scale = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    modifier = obj.modifiers.new("soft cloth edges", "BEVEL")
    modifier.width = bevel
    modifier.segments = 1
    return obj


def segment(name, start, end, radius, mat, end_radius=None):
    direction = Vector(end) - Vector(start)
    bpy.ops.mesh.primitive_cone_add(
        vertices=10, radius1=radius,
        radius2=radius if end_radius is None else end_radius,
        depth=direction.length, location=(Vector(start) + Vector(end)) / 2)
    obj = finish(name, mat)
    obj.rotation_euler = direction.to_track_quat("Z", "Y").to_euler()
    return obj


def ring(name, center, radius, thickness, mat, axis=(0, -1, 0)):
    bpy.ops.mesh.primitive_torus_add(
        major_segments=24, minor_segments=6, major_radius=radius,
        minor_radius=thickness, location=center)
    obj = finish(name, mat)
    obj.rotation_euler = Vector(axis).to_track_quat("Z", "Y").to_euler()
    return obj


def collar(name, points, mat):
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(points, [], [(0, 1, 2)])
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    mesh.materials.append(mat)
    modifier = obj.modifiers.new("fold thickness", "SOLIDIFY")
    modifier.thickness = 0.004
    modifier = obj.modifiers.new("fold edge", "BEVEL")
    modifier.width = 0.002
    modifier.segments = 1


def loose_shirt(mat):
    """Octagonal cloth sections: flared hem, relaxed chest, sloping shoulders."""
    sections = [(0.96, 0.199, 0.113), (1.015, 0.19, 0.109),
                (1.18, 0.177, 0.105), (1.345, 0.187, 0.104),
                (1.395, 0.139, 0.086), (1.415, 0.063, 0.066)]
    outline = [(-0.72, -1), (0.72, -1), (1, -0.65), (1, 0.65),
               (0.72, 1), (-0.72, 1), (-1, 0.65), (-1, -0.65)]
    points = [(x * width, y * depth, z)
              for z, width, depth in sections for x, y in outline]
    faces = [tuple(reversed(range(8)))]
    for level in range(len(sections) - 1):
        for i in range(8):
            a, b = level * 8 + i, level * 8 + (i + 1) % 8
            faces.append((a, b, b + 8, a + 8))
    faces.append(tuple(range(len(points) - 8, len(points))))
    mesh = bpy.data.meshes.new("soft shirt sections")
    mesh.from_pydata(points, [], faces)
    mesh.update()
    obj = bpy.data.objects.new("loose flared shirt", mesh)
    bpy.context.collection.objects.link(obj)
    mesh.materials.append(mat)
    modifier = obj.modifiers.new("soft cloth transitions", "BEVEL")
    modifier.width = 0.012
    modifier.segments = 1
    # Shallow cloth folds use the same fabric, without dark drawn seams.
    for side in (-1, 1):
        fold = box("soft hem fold", (side * 0.128, -0.109, 1.025),
                   (0.018, 0.012, 0.105), mat, 0.005)
        fold.rotation_euler.y = side * 0.13


def build_character():
    """Reset scene and build the shared turnaround/export study deterministically."""
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    bpy.context.scene.unit_settings.system = "METRIC"
    bpy.context.scene.unit_settings.scale_length = 1
    cloth = material("bright cream shirt and socks", CREAM_WHITE)
    tote = material("cream canvas", PAPER, CREAM_WHITE, 0.65)
    skin = material("warm skin - character color", SKIN)
    smile = material("soft skin smile", SKIN, INK, 0.22)
    dark = material("ink hair and shorts", INK)
    green = material("forestLight canvas", FOREST_LIGHT)
    metal = material("pale matte frame", PAPER, DUSK, 0.18)

    # Seven-head silhouette: head ~0.245 m; neck partly covered by the collar.
    loose_shirt(cloth)
    segment("neck", (0, 0, 1.345), (0, 0, 1.345 + NECK_LENGTH), NECK_RADIUS, skin)
    box("shorts seat", (0, 0.005, 0.938), (0.30, 0.19, 0.14), dark, 0.025)
    for side in (-1, 1):
        x = side * 0.086
        segment("shorts leg", (x, 0, 0.73), (x, 0, 0.965), 0.078, dark, 0.085)
        segment("bare thigh", (x, 0, 0.55), (x, 0, 0.78),
                0.048 * LEG_WIDTH_SCALE, skin, 0.061 * LEG_WIDTH_SCALE)
        oval("knee", (x, -0.006, 0.54),
             (0.049 * LEG_WIDTH_SCALE, 0.05 * LEG_WIDTH_SCALE, 0.055), skin)
        # Fuller upper calf, then a gentle taper into the ankle.
        segment("lower calf", (x, 0.008, 0.19), (x, 0.014, 0.40),
                0.032 * LEG_WIDTH_SCALE, skin, 0.049 * LEG_WIDTH_SCALE)
        segment("upper calf", (x, 0.014, 0.40), (x, 0, 0.55),
                0.049 * LEG_WIDTH_SCALE, skin, 0.047 * LEG_WIDTH_SCALE)
        segment("white sock", (x, 0, 0.075), (x, 0, 0.245),
                0.035 * LEG_WIDTH_SCALE, cloth, 0.037 * LEG_WIDTH_SCALE)
        box("canvas shoe", (x, -0.048, 0.056),
            (0.095 * SHOE_SCALE, 0.212 * SHOE_SCALE, 0.096), green, 0.025)
        box("canvas sole", (x, -0.048, 0.016),
            (0.098 * SHOE_SCALE, 0.214 * SHOE_SCALE, 0.032), cloth, 0.009)
        shoulder = Vector((side * 0.165, 0, 1.342))
        elbow = Vector((side * 0.294, 0, 1.103))
        wrist = Vector((side * 0.405, -0.012, 0.902))
        oval("shirt shoulder", shoulder, (0.078, 0.097, 0.085), cloth)
        segment("loose sleeve", elbow, shoulder, 0.067, cloth, 0.086)
        segment("forearm", wrist, elbow,
                0.031 * ARM_WIDTH_SCALE, skin, 0.045 * ARM_WIDTH_SCALE)
        # Two thick cloth rings make the rolled sleeve visible at the elbow.
        axis = (shoulder - elbow).normalized()
        for offset in (0, 0.018):
            ring("rolled cuff", elbow + axis * offset, 0.064, 0.009, cloth, axis)
        hand = oval("relaxed hand", (side * 0.427, -0.014, 0.861),
                    (0.033 * ARM_WIDTH_SCALE, 0.026 * ARM_WIDTH_SCALE, 0.062), skin)
        hand.rotation_euler.y = side * 0.3
        oval("thumb suggestion", (side * 0.404, -0.035, 0.874),
             (0.018, 0.021, 0.03), skin)
        collar("turned collar", [(side * 0.037, -0.072, 1.405),
                                (side * 0.113, -0.113, 1.344),
                                (side * 0.055, -0.13, 1.305)], cloth)

    before_head = set(bpy.context.scene.objects)
    oval("quiet face", (0, -0.004, 1.568), (0.085, 0.083, 0.119), skin)
    for side in (-1, 1):
        oval("ear", (side * 0.084, 0, 1.57), (0.017, 0.02, 0.028), skin)
        ring("round frame", (side * 0.044, -0.087, 1.596), 0.035, 0.0017, metal)
        segment("frame temple", (side * 0.079, -0.084, 1.596),
                (side * 0.086, 0.017, 1.59), 0.0017, metal)
    segment("frame bridge", (-0.009, -0.091, 1.596),
            (0.009, -0.091, 1.596), 0.0017, metal)
    oval("nose suggestion", (0, -0.085, 1.567), (0.012, 0.022, 0.022), skin)
    # A small upturned arc follows the face surface, with no detailed eyes.
    smile_points = [(-0.023, -0.082, 1.536), (-0.012, -0.084, 1.532),
                    (0, -0.085, 1.531), (0.012, -0.084, 1.532),
                    (0.023, -0.082, 1.536)]
    for start, end in zip(smile_points, smile_points[1:]):
        segment("quiet smile", start, end, 0.0012, smile)
    oval("short hair crown", (0, 0.009, 1.655), (0.088, 0.083, HAIR_CROWN_HEIGHT), dark)
    oval("short hair nape", (0, 0.056, 1.609), (0.079, 0.044, 0.074), dark)
    for side in (-1, 1):
        oval("neat side hair", (side * 0.072, 0.016, 1.635),
             (0.018, 0.055, 0.037), dark)
    # Four rounded locks hang over the brow, swept slightly to one side.
    for x, y, z, tilt in [(-0.055, -0.063, 1.633, -0.22),
                          (-0.024, -0.075, 1.627, -0.20),
                          (0.009, -0.077, 1.635, -0.28),
                          (0.043, -0.066, 1.644, -0.16)]:
        lock = oval("loose fringe", (x, y, z), (0.022, 0.021, 0.039), dark)
        lock.rotation_euler.y = tilt
    pivot = Matrix.Translation((0, 0, 1.46))
    tilt = pivot @ Matrix.Rotation(math.radians(-5), 4, "X") @ pivot.inverted()
    bpy.context.view_layer.update()
    for obj in set(bpy.context.scene.objects) - before_head:
        obj.matrix_world = tilt @ obj.matrix_world

    box("linen tote body", (0.268, 0.02, 0.938), (0.145, 0.13, 0.27), tote, 0.02)
    # Two continuous flat handles pass over the shoulder, front and rear.
    for y in (-0.063, 0.082):
        points = [(0.218, y, 1.056), (0.193, y, 1.31),
                  (0.19, 0.01, 1.425), (0.275, y, 1.30), (0.32, y, 1.056)]
        for start, end in zip(points, points[1:]):
            direction = Vector(end) - Vector(start)
            strap = box("woven shoulder strap", (Vector(start) + Vector(end)) / 2,
                        (STRAP_WIDTH, 0.005, direction.length + 0.008), tote, 0.002)
            strap.rotation_euler = direction.to_track_quat("Z", "Y").to_euler()

    # Bake modifiers once; export and turnaround therefore share identical geometry.
    bpy.ops.object.select_all(action="SELECT")
    bpy.context.view_layer.objects.active = bpy.context.selected_objects[0]
    bpy.ops.object.convert(target="MESH")
    bpy.ops.object.join()
    model = bpy.context.object
    model.name = "character-duy"
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    # Joined vertices are object-local; reset origin only after baking world matrix.
    world = [model.matrix_world @ v.co for v in model.data.vertices]
    lowest, highest = min(v.z for v in world), max(v.z for v in world)
    for vertex, position in zip(model.data.vertices, world):
        vertex.co = (position - Vector((0, 0, lowest))) * (HEIGHT / (highest - lowest))
    model.matrix_world = Matrix.Identity(4)
    model.data.update()
    model.data.calc_loop_triangles()
    triangles = len(model.data.loop_triangles)
    print(f"character-duy triangles: {triangles}", flush=True)
    if triangles > MAX_TRIANGLES:
        raise RuntimeError(f"Triangle budget exceeded: {triangles} > {MAX_TRIANGLES}")
    return model


def main(argv):
    if len(argv) != 1:
        raise SystemExit("Usage: blender -b -P tools/assets/blender/character.py -- <output-directory>")
    output_dir = os.path.abspath(argv[0])
    os.makedirs(output_dir, exist_ok=True)
    build_character()
    output = os.path.join(output_dir, "character-duy.glb")
    bpy.ops.export_scene.gltf(
        filepath=output, export_format="GLB", use_selection=True,
        export_materials="EXPORT", export_yup=True, export_apply=True,
        export_animations=False, export_cameras=False, export_lights=False)
    size = os.path.getsize(output)
    print(f"character-duy bytes: {size}", flush=True)
    if size > MAX_BYTES:
        os.remove(output)
        raise RuntimeError(f"Byte budget exceeded: {size} > {MAX_BYTES}")


if __name__ == "__main__":
    main(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])
