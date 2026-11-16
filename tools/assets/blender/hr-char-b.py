"""HR-CHAR-B: groom, cotton tailoring and a reversible grip morph on the CC0 rig.

blender -b --factory-startup -t 4 -P tools/assets/blender/hr-char-b.py -- <existing-CC0-src> tmp/hr-char
Reuses the HR-CHAR skin AO bake when present. No downloads, add-ons or external code.
New procedural surfaces and derived meshes are dedicated to CC0-1.0.
"""
import importlib.util
import json
import math
import os
import random
import sys

import bpy
import numpy as np
from mathutils import Matrix, Quaternion, Vector
from mathutils.bvhtree import BVHTree
from mathutils.geometry import barycentric_transform, closest_point_on_tri

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
spec = importlib.util.spec_from_file_location("hr_char", os.path.join(HERE, "hr-char.py"))
hr = importlib.util.module_from_spec(spec)
spec.loader.exec_module(hr)

finger_joints = {}
original_repose = hr.repose
original_tailor = hr.tailor
original_textures = hr.gen_textures
original_export = hr.export


def repose(parts, joints, rig_bones):
    # Landmarks follow exactly the same hand transform as the source A-pose skin.
    source = hr.armature_from("finger-landmarks", hr.mh_bone_points(joints))
    targets = {n: rig_bones[n] for n in rig_bones if n.split(".")[0] in
               ("shoulder", "upper_arm", "forearm", "hand", "thigh", "shin", "foot")}
    hr.pose_to(source, targets, hr.LIMB_STRETCH)
    for prefix, side in (("l", "L"), ("r", "R")):
        bone = source.pose.bones[f"hand.{side}"]
        transform = bone.matrix @ bone.bone.matrix_local.inverted()
        finger_joints[side] = [[transform @ joints[f"{prefix}-finger-{finger}-{joint}"]
                                for joint in range(1, 5)] for finger in range(1, 6)]
    bpy.data.objects.remove(source, do_unlink=True)
    original_repose(parts, joints, rig_bones)
    print("GRIP_LANDMARKS " + json.dumps({s: [[list(p) for p in f] for f in fs]
                                            for s, fs in finger_joints.items()}), flush=True)


def tailor(parts, rig_bones):
    hem = original_tailor(parts, rig_bones)
    shirt = parts["shirt"]
    # Relax the suit's scrunched abdomen, keeping the collar, placket and turned cuffs.
    group = shirt.vertex_groups.new(name="cotton-relax")
    for vertex in shirt.data.vertices:
        p = vertex.co
        weight = max(0, min(1, (1.37 - p.z) / .12)) * max(0, min(1, (.25 - abs(p.x)) / .06))
        group.add([vertex.index], weight, "REPLACE")
    hr.select_only(shirt)
    smooth = shirt.modifiers.new("gravity-relax", "SMOOTH")
    smooth.vertex_group = group.name
    smooth.factor, smooth.iterations = .65, 7
    bpy.ops.object.modifier_apply(modifier=smooth.name)
    # A few broad hanging folds; millimetres of depth, restrained at the abdomen.
    for vertex in shirt.data.vertices:
        p = vertex.co
        if abs(p.x) < .23 and .84 < p.z < 1.34:
            theta = math.atan2(p.y, p.x)
            lower = max(0, min(1, (1.30 - p.z) / .30))
            fold = .0025 * lower * math.sin(theta * 7 + .35 * p.z)
            radial = Vector((p.x, p.y, 0)).normalized()
            p += radial * fold
    shirt.data.update()
    return hem


def groom(cap, body):
    """Three layers of short alpha ribbons; every edge follows the scalp volume."""
    hr.select_only(cap)
    relax = cap.modifiers.new("soft-hairline", "SMOOTH")
    relax.factor, relax.iterations = .6, 3
    bpy.ops.object.modifier_apply(modifier=relax.name)
    smooth = cap.modifiers.new("groom-volume", "SUBSURF")
    smooth.levels = 1
    bpy.ops.object.modifier_apply(modifier=smooth.name)
    mesh = cap.data
    bvh = BVHTree.FromPolygons([v.co for v in mesh.vertices], [p.vertices[:] for p in mesh.polygons])
    source_dir = os.path.abspath(sys.argv[sys.argv.index("--") + 1])
    alpha = hr.load_np(os.path.join(source_dir, "sys/hair/short02/short02_diffuse.png"), 1024)[..., 3]
    uv_layer = mesh.uv_layers.active.data

    def coverage(q, face):
        poly = mesh.polygons[face]
        loops = list(poly.loop_indices)
        best, uv = float("inf"), None
        for k in range(1, len(loops) - 1):
            ids = (loops[0], loops[k], loops[k + 1])
            points = [mesh.vertices[mesh.loops[i].vertex_index].co for i in ids]
            sample = closest_point_on_tri(q, *points)
            distance = (sample - q).length_squared
            if distance < best:
                best = distance
                coords = [Vector((*uv_layer[i].uv, 0)) for i in ids]
                uv = barycentric_transform(sample, *points, *coords)
        return 0 if uv is None else alpha[int(max(0, min(1023, uv.y * 1023))), int(max(0, min(1023, uv.x * 1023)))]
    areas = [p.area for p in mesh.polygons]
    rng = random.Random(hr.SEED)
    verts, faces, uvs, normals = [], [], [], []
    for card in range(3000):
        poly = mesh.polygons[rng.choices(range(len(areas)), weights=areas)[0]]
        corners = [mesh.vertices[i].co for i in poly.vertices]
        weights = [rng.random() for _ in corners]
        p = sum((v * w for v, w in zip(corners, weights)), Vector()) / sum(weights)
        p, normal, face, _ = bvh.find_nearest(p)
        if p is None or coverage(p, face) < .65:
            continue
        # A coherent side part, blended into a downward comb on the temples.
        # Back combs down toward the nape; top/fringe sweeps gently sideways.
        flow = Vector((.38 * max(0, normal.z), -.55 if normal.y < .2 else .45,
                       -1.2 * max(0, 1 - normal.z)))
        direction = flow - normal * flow.dot(normal)
        if direction.length < .01:
            continue
        direction.normalize()
        direction = Quaternion(normal, rng.uniform(-.18, .18)) @ direction
        length, width = rng.uniform(.018, .038), rng.uniform(.003, .007)
        layer = card % 3
        lift = .0004 + layer * .0007
        base = len(verts)
        valid = True
        path = []
        for segment in range(7):
            q, n, face, distance = bvh.find_nearest(p + direction * length * segment / 6)
            if q is None or distance > .006 or coverage(q, face) < .28:
                valid = False
                break
            path.append((q, n.normalized()))
        if not valid:
            continue
        for segment, (q, n) in enumerate(path):
            t = segment / 6
            tangent = path[min(6, segment + 1)][0] - path[max(0, segment - 1)][0]
            if tangent.length < 1e-5:
                tangent = direction
            across = tangent.normalized().cross(n).normalized()
            for edge in range(3):
                # Project both edges as well as the midrib: no floating flat panels.
                side = (edge - 1) * width * .5 * (1 - .35 * t)
                hit, hn, _, distance = bvh.find_nearest(q + across * side)
                if hit is None or distance > .008:
                    hit, hn = q + across * side, n
                verts.append(hit + hn.normalized() * (lift + .0012 * math.sin(math.pi * t)
                                                     + (.0003 if edge == 1 else 0)))
                uvs.append((edge / 2, t))
                normals.append(hn.normalized())
        for segment in range(6):
            for edge in range(2):
                a = base + segment * 3 + edge
                b = a + 1
                faces.append((a, b, b + 3, a + 3))
    obj = hr.make_mesh_object("hair_cards", verts, faces)
    uv = obj.data.uv_layers.new(name="UVMap")
    for loop in obj.data.loops:
        uv.data[loop.index].uv = uvs[loop.vertex_index]
    obj.data.normals_split_custom_set_from_vertices(normals)
    max_lift = max(bvh.find_nearest(v)[3] for v in verts)
    assert max_lift < .006, f"Hair exceeds the 6mm envelope: {max_lift}"
    print(f"GROOM {len(faces)} layered alpha-card quads; max lift {max_lift * 1000:.3f}mm", flush=True)
    return obj


def textures(src, out, scalp=None):
    tex = original_textures(src, out, scalp)
    size = 2048
    rng = np.random.default_rng(hr.SEED + 2)
    y, x = np.mgrid[0:size, 0:size].astype(np.float32)
    u = (x + .5) / size
    shorts = ((u > .355) & (u < .715)).astype(np.float32)
    weave = hr.weave(size, 2.3, rng)
    ao = hr.load_np(os.path.join(src, "sys/clothes/male_casualsuit01/male_casualsuit01_ao.png"), size)[..., 0]
    old = hr.load_np(os.path.join(out, "cloth_albedo.png"), size)[..., :3]
    cotton = hr.srgb(np.array(hr.SHIRT, np.float32) * (.965 + .035 * weave[..., None]) * (.96 + .04 * ao[..., None]))
    albedo = cotton * (1 - shorts[..., None]) + old * shorts[..., None]
    tex["cloth_albedo"] = hr.save_np(albedo, os.path.join(out, "cloth_albedo.png"))
    old_n = hr.load_np(os.path.join(out, "cloth_normal.png"), size)[..., :3]
    cotton_n = hr.height_to_normal(weave, .16)
    tex["cloth_normal"] = hr.save_np(cotton_n * (1 - shorts[..., None]) + old_n * shorts[..., None],
                                      os.path.join(out, "cloth_normal.png"), "Non-Color")
    orm = hr.load_np(os.path.join(out, "cloth_orm.png"), size)[..., :3]
    orm[..., 0] = orm[..., 0] * shorts + (.96 + .04 * ao) * (1 - shorts)
    orm[..., 1] = orm[..., 1] * shorts + (.87 + .04 * weave) * (1 - shorts)
    tex["cloth_orm"] = hr.save_np(orm, os.path.join(out, "cloth_orm.png"), "Non-Color")
    # Separate tapered fibres inside each ribbon; transparent gaps survive mipmaps.
    h, w = 1024, 512
    v = np.linspace(0, 1, h, dtype=np.float32)[:, None]
    u = np.linspace(0, 1, w, dtype=np.float32)[None, :]
    phase = u * 13 + .12 * np.sin(v * 5 + u * 10)
    grain = .5 + .5 * np.cos(phase * math.tau)
    fibres = np.clip((grain - .20) / .14, 0, 1)
    edge = np.clip(np.minimum(u, 1 - u) / .12, 0, 1)
    tips = np.clip((.98 - v - .12 * np.sin(u * 61)) / .22, 0, 1)
    alpha = edge * tips * np.clip(v / .10, 0, 1) * fibres
    hair = np.ones((h, w, 4), np.float32)
    clump = .68 + .32 * np.sin(u * 19 + v * 2) ** 2
    hair[..., :3] = hr.srgb(np.array(hr.HAIR, np.float32) *
                           ((.65 + 1.0 * grain) * clump)[..., None])
    hair[..., 3] = alpha
    tex["hair_card"] = hr.save_np(hair, os.path.join(out, "hair_card.png"))
    tex["hair_card_normal"] = hr.save_np(hr.height_to_normal(grain, 1.8),
                                            os.path.join(out, "hair_card_normal.png"), "Non-Color")
    # Feather the short02 root mask over several texels; never threshold the old
    # serrated silhouette. Warm sparse roots reveal the skin underneath through MSAA.
    cap = hr.load_np(os.path.join(out, "hair_cap.png"))
    # Strand grain in the cap's original combed UVs, with a tangent-space normal.
    ch, cw = cap.shape[:2]
    cy, cx = np.mgrid[0:ch, 0:cw].astype(np.float32)
    strand = .5 + .5 * np.sin(cx * math.pi * .67 + np.sin(cy * .014) * 2)
    density = hr.blur((cap[..., 3] > .5).astype(np.float32), 5)
    cap[..., 3] = np.clip((density - .12) / .74, 0, 1)
    root = np.clip((.95 - density) / .55, 0, 1)
    cap[..., :3] *= (.82 + .18 * strand[..., None])
    scalp_tone = np.array((.31, .235, .17), np.float32)
    cap[..., :3] = cap[..., :3] * (1 - root[..., None] * .65) + scalp_tone * root[..., None] * .65
    tex["hair_cap"] = hr.save_np(cap, os.path.join(out, "hair_cap.png"))
    tex["hair_normal"] = hr.save_np(hr.height_to_normal(strand, .7), os.path.join(out, "hair_normal.png"), "Non-Color")
    return tex


def nearest_segment(p, a, b):
    d = b - a
    t = max(0, min(1, (p - a).dot(d) / max(1e-9, d.length_squared)))
    return (p - (a + d * t)).length_squared


def grip(model, rig):
    """Anatomical three-joint curls baked as one morph; rig remains 19 joints."""
    model.shape_key_add(name="Basis")
    key = model.shape_key_add(name="HandlebarGrip")
    key.value = 0
    hand_groups = {side: model.vertex_groups.get(f"hand.{side}") for side in ("L", "R")}
    frames = {}
    B = Matrix(((1, 0, 0), (0, 0, 1), (0, -1, 0)))
    for side in ("L", "R"):
        sign = 1 if side == "L" else -1
        bone = rig.data.bones[f"hand.{side}"]
        y = (B @ (bone.tail_local - bone.head_local)).normalized()
        z = Vector((-sign, 0, 0))
        z = (z - y * z.dot(y)).normalized()
        x = y.cross(z).normalized()
        source = Matrix((x, y, z)).transposed().to_quaternion()
        forward = Vector((0, -.12, 1)).normalized()
        palm = Vector((0, -1, -.12)).normalized()
        target = Quaternion(Vector((0, 1, 0)), -sign * .34) @ Matrix((forward.cross(palm), forward, palm)).transposed().to_quaternion()
        rotation = target @ source.inverted()
        wrist = Vector((sign * .395, 1.29, .34)) * .81
        frames[side] = (rotation, B @ bone.head_local, wrist)
    changed = 0
    for vertex in model.data.vertices:
        for side in ("L", "R"):
            group = hand_groups[side]
            weight = next((g.weight for g in vertex.groups if group and g.group == group.index), 0)
            if weight < .5:
                continue
            fingers = finger_joints[side]
            # Select one digit by its original skeleton, including thumb and nail surface.
            finger = min(range(5), key=lambda f: min(nearest_segment(vertex.co, a, b)
                                                     for a, b in zip(fingers[f], fingers[f][1:])))
            chain = fingers[finger]
            curl = vertex.co.z <= chain[0].z + .018
            # The A-pose palms face medially; the four digits spread along Y.
            direction = (chain[3] - chain[0]).normalized()
            sign = 1 if side == "L" else -1
            palm = Vector((-sign, .65 if finger == 0 else 0, 0)).normalized()
            axis = direction.cross(palm).normalized()
            angles = (.75, .95, .65) if finger else (.55, .65, .5)
            p = vertex.co.copy()
            # Rotate distal first, then the whole chain. Smooth influence at each joint.
            for j in (2, 1, 0):
                d = (chain[min(j + 1, 3)] - chain[j]).normalized()
                along = (vertex.co - chain[j]).dot(d)
                blend = max(0, min(1, along / .009 + .5)) if curl else 0
                p = chain[j] + Quaternion(axis, angles[j] * blend) @ (p - chain[j])
            if finger == 0 and curl:
                # Oppose the thumb across the palm, meeting the underside of the index.
                goal = fingers[1][0] + Vector((-sign * .025, .012, -.014))
                delta = (chain[3] - chain[0]).rotation_difference(goal - chain[0])
                along = (vertex.co - chain[0]).dot(direction)
                blend = max(0, min(1, along / .018 + .35))
                p = chain[0] + Quaternion().slerp(delta, blend) @ (p - chain[0])
            # Fit the skin to the actual 24mm authoring-radius grip. This is baked
            # once, not a CPU collision/deformation loop during gameplay.
            rotation, rest_wrist, wrist = frames[side]
            world = wrist + rotation @ (B @ p - rest_wrist)
            a = Vector((sign * .34, 1.25, .459)) * .81
            b = Vector((sign * .45, 1.25, .42)) * .81
            bar = b - a
            t = (world - a).dot(bar) / bar.length_squared
            if -.02 < t < 1.02:
                center = a + bar * t
                radial = world - center
                clearance = .024 * .81 + .0015
                if radial.length < clearance:
                    world = center + radial.normalized() * clearance
                    p = B.inverted() @ (rest_wrist + rotation.inverted() @ (world - wrist))
            key.data[vertex.index].co = p
            changed += (p - vertex.co).length > .0001
            break
    print(f"GRIP {model.name}: {changed} vertices", flush=True)


def export(model, rig, path):
    grip(model, rig)
    original_export(model, rig, path)
    model.shape_key_clear()  # Decimate the untouched rest mesh; author its own morph afterwards.


hr.repose = repose
hr.tailor = tailor
hr.build_hair_cards = groom
hr.gen_textures = textures
hr.export = export
cached_ao = os.path.join(os.path.abspath(sys.argv[sys.argv.index("--") + 2]), "skin_orm.png")
if os.path.exists(cached_ao):
    hr.bake_skin_orm = lambda *_: bpy.data.images.load(cached_ao, check_existing=False)

def main(argv):
    import bmesh
    import character_rig as rigging
    src, out = map(os.path.abspath, argv[:2])
    os.makedirs(out, exist_ok=True)
    parts, used, hidden, joints, bones, _ = hr.build_parts(src)
    repose(parts, joints, bones)
    hem = tailor(parts, bones)
    parts["cornea"] = hr.build_cornea(parts["eyes"])
    parts["frame"], parts["lens"] = hr.build_glasses(parts["eyes"], parts["body"])
    parts["tote"] = hr.build_tote(parts["shirt"])
    parts["hair_cards"] = groom(parts["hair"], parts["body"])
    parts["socks"] = hr.split_socks(parts["shoes"])
    parts["laces"] = hr.build_laces(parts["shoes"])
    scale, floor = bones.pop("_scale")
    rig = rigging.make_armature(scale, floor)
    hr.final_weights(parts, rig)
    hr.hide_covered_body(parts["body"], used, hidden, bones, hem)
    # Keep the forehead as natural skin. The old expanded scalp tint is visible
    # below a short groom and reads as a dark painted band above the eyebrows.
    tex = textures(src, out, None)
    ao = hr.bake_skin_orm(parts["body"], out, parts)
    hr.assign(parts, hr.make_materials(tex, ao))
    counts = {name: hr.triangles(obj) for name, obj in parts.items()}
    # Thin whole strands first; QEM across thousands of sub-millimetre tubes can
    # discard the face/hands before the fibres. Simplify other surfaces separately.
    lod_parts = {}
    for name, obj in parts.items():
        lod = obj.copy()
        lod.data = obj.data.copy()
        bpy.context.collection.objects.link(lod)
        lod_parts[name] = lod
        if name == "hair_cards":
            groups = hr.components(lod.data)
            remove = {i for k, indices in enumerate(groups) if k % 4 != 0 for i in indices}
            bm = bmesh.new()
            bm.from_mesh(lod.data)
            bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.index in remove], context="VERTS")
            bm.to_mesh(lod.data)
            bm.free()
        elif name in ("body", "hair", "shirt", "shorts", "shoes", "tote"):
            hr.select_only(lod)
            dec = lod.modifiers.new("surface-lod", "DECIMATE")
            dec.ratio = .65 if name != "hair" else .5
            bpy.ops.object.modifier_apply(modifier=dec.name)
    high = hr.join_all(parts, rig, "character-hr")
    export(high, rig, os.path.join(out, "character-hr.glb"))
    high.hide_set(True)
    lod = hr.join_all(lod_parts, rig, "character-hr-lod1")
    export(lod, rig, os.path.join(out, "character-hr-lod1.glb"))
    manifest = {"lod0Triangles": hr.triangles(high), "lod1Triangles": hr.triangles(lod),
                "parts": counts, "height": hr.HEIGHT, "bones": [b.name for b in rig.data.bones]}
    with open(os.path.join(out, "manifest.json"), "w") as stream:
        json.dump(manifest, stream, indent=2)
    print("HRCHARB " + json.dumps(manifest), flush=True)
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(out, "hr-char-b.blend"))


main(sys.argv[sys.argv.index("--") + 1:])
