"""Small classic motorcycle, authored in metres. No reference images required.

blender -b --factory-startup -P tools/assets/blender/gd110.py -- <output-dir>
Optional switches: --without-helmet --without-tote. Export is Y-up, forward +Z;
origin is on the ground midway between the axles. Accessories are single meshes.
"""
import argparse
import math
import os
import sys

import bpy
from mathutils import Vector

BODY_HEX = "#EEE8D8"
SEAT_HEX = "#2B2A26"
METAL_HEX = "#C0B8A6"
MAX_TRIANGLES = 8000
MAX_BYTES = 400000


def point(p):
    """Design Y-up to Blender Z-up; glTF export reverses this conversion."""
    return Vector((p[0], -p[2], p[1]))


def material(name, value, metallic=0, roughness=1):
    srgb = [int(value[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    linear = [c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in srgb]
    result = bpy.data.materials.new(name)
    result.diffuse_color = (*linear, 1)
    result.use_nodes = True
    shader = result.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = (*linear, 1)
    shader.inputs["Metallic"].default_value = metallic
    shader.inputs["Roughness"].default_value = roughness
    return result


def finish(name, mat):
    obj = bpy.context.object
    obj.name = name
    obj.data.materials.append(mat)
    return obj


def mesh(name, vertices, faces, mat):
    data = bpy.data.meshes.new(name)
    data.from_pydata([point(p) for p in vertices], [], faces)
    data.update()
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(mat)
    return obj


def box(name, center, size, mat, bevel=0):
    bpy.ops.mesh.primitive_cube_add(size=1, location=point(center))
    obj = finish(name, mat)
    obj.scale = (size[0], size[2], size[1])
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel:
        modifier = obj.modifiers.new("soft_edges", "BEVEL")
        modifier.width = bevel
        modifier.segments = 1
        bpy.ops.object.modifier_apply(modifier=modifier.name)
    return obj


def ellipsoid(name, center, size, mat):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=12, ring_count=8, radius=1,
                                       location=point(center))
    obj = finish(name, mat)
    obj.scale = (size[0], size[2], size[1])
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return obj


def tube(name, points, radius, mat, sides=8):
    """Low sided continuous tube with capped ends, including bent handlebars."""
    centers = [Vector(p) for p in points]
    vertices = []
    for i, center in enumerate(centers):
        tangent = (centers[min(i + 1, len(centers) - 1)] - centers[max(0, i - 1)]).normalized()
        helper = Vector((0, 1, 0)) if abs(tangent.y) < 0.9 else Vector((1, 0, 0))
        u = tangent.cross(helper).normalized()
        v = tangent.cross(u).normalized()
        for j in range(sides):
            angle = math.tau * j / sides
            vertices.append(center + radius * (u * math.cos(angle) + v * math.sin(angle)))
    faces = [tuple(reversed(range(sides)))]
    for i in range(len(centers) - 1):
        for j in range(sides):
            a = i * sides + j
            b = i * sides + (j + 1) % sides
            faces.append((a, b, b + sides, a + sides))
    faces.append(tuple((len(centers) - 1) * sides + j for j in range(sides)))
    return mesh(name, vertices, faces, mat)


def join(name, objects):
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.object.join()
    objects[0].name = name
    return objects[0]


def wheel(name, z, rubber, metal):
    # Wheel plane YZ; outer radius .30 gives ground contact at Y=0.
    bpy.ops.mesh.primitive_torus_add(major_segments=24, minor_segments=6,
                                   major_radius=0.25, minor_radius=0.05,
                                   location=point((0, 0.30, z)), rotation=(0, math.pi / 2, 0))
    finish(name + "_tire", rubber)
    bpy.ops.mesh.primitive_torus_add(major_segments=24, minor_segments=4,
                                   major_radius=0.215, minor_radius=0.012,
                                   location=point((0, 0.30, z)), rotation=(0, math.pi / 2, 0))
    finish(name + "_rim", metal)
    # A thin hub disc and eight suggestive spokes rather than a dense wire wheel.
    tube(name + "_hub_disc", [(-0.035, .30, z), (.035, .30, z)], .065, metal, 12)
    spokes = []
    for i in range(8):
        a = math.tau * i / 8
        spokes.append(tube(name + "_spoke", [(0, .30, z),
                      (0, .30 + .213 * math.sin(a), z + .213 * math.cos(a))], .006, metal, 4))
    join(name + "_spokes", spokes)


def helmet(body, ink, metal, glass):
    # Open lower hemisphere with an inset dark lining; no full-face chin section.
    parts = []
    for name, radius, mat in [("shell", .145, body), ("lining", .133, ink)]:
        vertices = []
        for i in range(5):
            angle = .045 + (math.pi / 2 - .045) * i / 4
            for j in range(12):
                azimuth = math.tau * j / 12
                vertices.append((radius * math.sin(angle) * math.cos(azimuth),
                                 1.045 + radius * math.cos(angle),
                                 .12 + radius * math.sin(angle) * math.sin(azimuth)))
        faces = [tuple(reversed(range(12)))]
        faces += [(i * 12 + j, i * 12 + (j + 1) % 12,
                   (i + 1) * 12 + (j + 1) % 12, (i + 1) * 12 + j)
                  for i in range(4) for j in range(12)]
        if name == "lining":
            faces = [tuple(reversed(face)) for face in faces]
        parts.append(mesh(name, vertices, faces, mat))
    for x in [-.059, .059]:
        parts.append(ellipsoid("goggle_rim", (x, 1.095, .25), (.06, .042, .014), metal))
        parts.append(ellipsoid("goggle_lens", (x, 1.095, .263), (.047, .03, .008), glass))
    parts.append(tube("goggle_bridge", [(-.018, 1.097, .258), (.018, 1.097, .258)], .008, ink))
    parts.append(tube("goggle_strap", [(-.12, 1.09, .23), (-.145, 1.09, .1),
                      (0, 1.09, -.025), (.145, 1.09, .1), (.12, 1.09, .23)], .009, ink))
    return join("accessory_helmet", parts)


def tote(body):
    parts = [box("tote_bag", (-.39, .91, .48), (.23, .30, .065), body, .025)]
    for z in [.45, .51]:
        parts.append(tube("tote_handle", [(-.49, 1.045, z), (-.46, 1.24, z),
                          (-.34, 1.29, z), (-.29, 1.045, z)], .008, body, 6))
    return join("accessory_tote", parts)


def build_vehicle(with_helmet=True, with_tote=True):
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    body = material("paper_body", BODY_HEX)
    ink = material("ink_seat_rubber", SEAT_HEX)
    metal = material("warm_matte_metal", METAL_HEX, metallic=.65, roughness=.72)
    glass = material("dusk_goggle_lens", "#E2B65C", roughness=.8)  # warm amber, matte; no blue gloss
    lamp = material("dusk_headlamp", "#E2B65C")
    tail = material("vermilion_tail", "#B5432F")
    wheel("rear", -.64, ink, metal)
    wheel("front", .64, ink, metal)
    for x in [-.105, .105]:
        tube("frame", [(x, .30, -.64), (x, .78, -.33), (x, .77, .36),
                       (x, .38, .10), (x, .30, -.64)], .023, ink)
        tube("front_fork", [(x, .30, .64), (x, .91, .43)], .025, metal)
        tube("rear_shock", [(x, .33, -.62), (x, .74, -.40)], .032, metal)
        box("side_cover", (x, .67, -.22), (.06, .22, .34), body, .04)
    box("engine_crankcase", (0, .46, -.02), (.27, .22, .28), metal, .05)
    for y in [.57, .60, .63, .66]:
        box("engine_cooling_fin", (0, y, .08), (.26, .018, .20), metal)
    ellipsoid("rounded_fuel_tank", (0, .88, .12), (.185, .16, .31), body)
    tube("fuel_cap", [(0, 1.025, .12), (0, 1.045, .12)], .035, metal, 12)
    box("long_flat_seat", (0, .86, -.39), (.32, .115, .63), ink, .035)
    for z in [-.64, .64]:
        # Upper half arc, leaving a clear gap above the tire.
        tube("fender", [(0, .30 + .335 * math.sin(i * math.pi / 12),
                          z + .335 * math.cos(i * math.pi / 12)) for i in range(13)], .035, body)
    tube("exhaust_header", [(.10, .56, .18), (.17, .34, .24), (.23, .22, .08),
                           (.23, .22, -.30)], .026, metal)
    tube("exhaust_muffler", [(.23, .22, -.27), (.23, .24, -.86)], .05, metal, 12)
    tube("exhaust_outlet", [(.23, .24, -.861), (.23, .24, -.867)], .027, ink)
    for x in [-.13, .13]:
        tube("rack_rail", [(x, .80, -.62), (x, .84, -.94)], .014, metal)
        tube("rack_stay", [(x, .43, -.62), (x, .83, -.91)], .012, metal)
    for z in [-.70, -.80, -.90, -.94]:
        tube("rack_crossbar", [(-.13, .84, z), (.13, .84, z)], .012, metal)
    tube("handlebar_stem", [(0, .89, .43), (0, 1.06, .43)], .025, metal)
    tube("handlebar_scrambler", [(-.45, 1.25, .42), (-.28, 1.25, .48),
         (-.16, 1.06, .47), (.16, 1.06, .47), (.28, 1.25, .48), (.45, 1.25, .42)], .018, metal)
    tube("handlebar_crossbrace", [(-.24, 1.19, .48), (.24, 1.19, .48)], .012, metal)
    for sign in [-1, 1]:
        tube("grip", [(sign * .34, 1.25, .459), (sign * .45, 1.25, .42)], .024, ink)
        tube("clutch_brake_lever", [(sign * .31, 1.24, .50), (sign * .43, 1.24, .52)], .009, metal)
        tube("mirror_stalk", [(sign * .31, 1.25, .47), (sign * .38, 1.48, .49)], .009, metal)
        tube("round_mirror", [(sign * .38, 1.48, .485), (sign * .38, 1.48, .50)], .066, metal, 16)
        tube("mirror_face", [(sign * .38, 1.48, .501), (sign * .38, 1.48, .504)], .055, body, 16)
        tube("footpeg", [(sign * .12, .36, -.12), (sign * .25, .36, -.12)], .022, ink)
    tube("headlamp_housing", [(0, .91, .49), (0, .91, .65)], .105, metal, 16)
    tube("round_headlamp", [(0, .91, .651), (0, .91, .664)], .091, lamp, 16)
    box("tail_lamp", (0, .77, -.86), (.10, .055, .04), tail, .008)
    if with_helmet:
        helmet(body, ink, metal, glass)
    if with_tote:
        tote(body)
    # A common ground origin keeps each detachable mesh's local placement intact.
    bpy.context.scene.cursor.location = (0, 0, 0)
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.origin_set(type="ORIGIN_CURSOR")
    return list(bpy.context.scene.objects)


def triangle_count(objects):
    total = 0
    for obj in objects:
        if obj.type == "MESH":
            obj.data.calc_loop_triangles()
            total += len(obj.data.loop_triangles)
    return total


def main(argv):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output_dir", nargs="?", default=".")
    parser.add_argument("--without-helmet", action="store_true")
    parser.add_argument("--without-tote", action="store_true")
    args = parser.parse_args(argv)
    objects = build_vehicle(not args.without_helmet, not args.without_tote)
    triangles = triangle_count(objects)
    print(f"Triangles: {triangles} / {MAX_TRIANGLES}", flush=True)
    if triangles > MAX_TRIANGLES:
        raise RuntimeError("Vehicle triangle budget exceeded")
    os.makedirs(args.output_dir, exist_ok=True)
    output = os.path.abspath(os.path.join(args.output_dir, "vehicle-gd110.glb"))
    bpy.ops.export_scene.gltf(filepath=output, export_format="GLB", export_yup=True,
                              export_materials="EXPORT", export_animations=False,
                              export_cameras=False, export_lights=False)
    size = os.path.getsize(output)
    print(f"Bytes: {size} / {MAX_BYTES}", flush=True)
    if size > MAX_BYTES:
        os.remove(output)
        raise RuntimeError("Vehicle byte budget exceeded; oversized export removed")
    return output


if __name__ == "__main__":
    main(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])
