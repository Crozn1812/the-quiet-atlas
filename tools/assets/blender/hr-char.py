"""HR-CHAR: photoreal close-up character on the approved 19-bone rig.

blender -b --factory-startup -P tools/assets/blender/hr-char.py -- <src-dir> <out-dir> [preview]

<src-dir> (tmp/hr-char-src, gitignored) holds CC0 data downloaded by the operator.
Everything there is parsed as data (OBJ / .target / .mhclo / PNG); no downloaded
script is executed and no add-on is installed.
  mpfb/base.obj, mpfb/*.target.gz  MPFB2 src/mpfb/data (CC0, LICENSE.ASSETS.md)
  sys/...                          MakeHuman system assets (CC0)
Textures for cloth, shoes, hair cards and skin micro-detail are generated here
(procedural, project-owned). Branded MakeHuman pixels (shoe and jeans diffuse)
are never read.

Contract with the runtime: the skeleton is character_rig.make_armature built
from the same landmarks as public/world/start/character-duy.glb (19 bones, same
names, order and rest pose; feet at Z=0; faces -Y; 1.72 m). Only skin geometry
and materials are new. Output goes to <out-dir>; then run
node tools/assets/blender/hr-char-package.mjs
"""
import gzip
import json
import math
import os
import random
import re
import sys

import bpy
import bmesh
import numpy as np
from mathutils import Matrix, Quaternion, Vector
from mathutils.bvhtree import BVHTree
from mathutils.kdtree import KDTree

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

HEIGHT = 1.72
SEED = 1723
TARGETS = (
    # MakeHuman macro mix: male, young (~25), asian, average muscle, slim, slightly ideal proportions.
    ("asian-male-young", 1.0),
    ("universal-male-young-averagemuscle-minweight", 0.16),
    ("male-young-averagemuscle-averageweight-idealproportions", 0.2),
)
SKIN_TINT = (1.0, 0.93, 0.84)       # warmer, light-tan South-East Asian tone over the CC0 diffuse
SHIRT = (0.86, 0.83, 0.76)          # cream / off-white linen, linear
SHORTS = (0.011, 0.011, 0.012)      # black cotton twill, linear
CANVAS = (0.105, 0.24, 0.12)        # green canvas, linear (#5E8C6A family, deeper)
RUBBER = (0.80, 0.78, 0.72)         # off-white vulcanised sole
SOCK = (0.88, 0.88, 0.86)
TOTE = (0.74, 0.68, 0.56)
HAIR = (0.012, 0.010, 0.009)
FRAME = (0.80, 0.70, 0.48)          # pale gold / silver mix metal


# =============================================================== approved rig

def approved_rig_landmarks():
    """Armature-space head/tail of the shipped rig (metres, Z up)."""
    import character as source
    import character_rig as rigging
    model = source.build_character()
    parts = [(i, c, re.sub(r"\.\d+$", "", n)) for i, c, n in rigging.islands(model.data)]
    scale, floor = rigging.authoring_transform(parts)
    mesh = model.data
    bpy.data.objects.remove(model, do_unlink=True)
    bpy.data.meshes.remove(mesh)
    bones = {}
    for name, _parent, head, tail in rigging.BONES:
        bones[name] = (Vector(head) - Vector((0, 0, floor))) * scale, (Vector(tail) - Vector((0, 0, floor))) * scale
    return bones, scale, floor


# =============================================================== MakeHuman data (parsed, never executed)

def read_obj(path):
    verts, uvs, faces, group = [], [], [], None
    with open(path, encoding="utf8", errors="replace") as stream:
        for line in stream:
            if line.startswith("v "):
                verts.append(Vector([float(x) for x in line.split()[1:4]]))
            elif line.startswith("vt "):
                uvs.append(tuple(float(x) for x in line.split()[1:3]))
            elif line.startswith("g "):
                group = line.split(None, 1)[1].strip()
            elif line.startswith("f "):
                corners = []
                for token in line.split()[1:]:
                    parts = token.split("/")
                    corners.append((int(parts[0]) - 1, int(parts[1]) - 1 if len(parts) > 1 and parts[1] else -1))
                faces.append((group, corners))
    return verts, uvs, faces


def read_target(path):
    offsets = {}
    with gzip.open(path, "rt", encoding="utf8") as stream:
        for line in stream:
            line = line.strip()
            if line and not line.startswith("#"):
                index, dx, dy, dz = line.split()[:4]
                offsets[int(index)] = Vector((float(dx), float(dy), float(dz)))
    return offsets


def read_mhclo(path):
    data = {"refs": [], "scales": {}, "delete": set(), "obj": None, "started": False}
    mode = None
    with open(path, encoding="utf8", errors="replace") as stream:
        for raw in stream:
            line = raw.strip()
            if not line or line.startswith("#"):
                continue
            tokens = line.split()
            numeric = re.fullmatch(r"-?\d+", tokens[0]) is not None
            if mode != "delete" and numeric and len(tokens) in (1, 9) and data["started"]:
                if len(tokens) == 1:
                    data["refs"].append(((int(tokens[0]),), (1.0,), (0.0, 0.0, 0.0)))
                else:
                    data["refs"].append((tuple(int(t) for t in tokens[:3]), tuple(float(t) for t in tokens[3:6]),
                                         tuple(float(t) for t in tokens[6:9])))
                continue
            if mode == "delete" and (numeric or tokens[0] == "-"):
                previous, pending_range = None, False
                for token in tokens:
                    if token == "-":
                        pending_range = True
                        continue
                    value = int(token)
                    if pending_range and previous is not None:
                        data["delete"].update(range(previous, value + 1))
                        pending_range = False
                    else:
                        data["delete"].add(value)
                    previous = value
                continue
            mode = None
            key = tokens[0]
            if key == "verts":
                mode = "verts"
                data["started"] = True
            elif key == "delete_verts":
                mode = "delete"
            elif key in ("x_scale", "y_scale", "z_scale"):
                data["scales"][key[0]] = (int(tokens[1]), int(tokens[2]), float(tokens[3]))
            elif key == "obj_file":
                data["obj"] = os.path.join(os.path.dirname(path), line.split(None, 1)[1])
    return data


def load_makehuman(src):
    verts, uvs, faces = read_obj(os.path.join(src, "mpfb", "base.obj"))
    coords = [v.copy() for v in verts]
    for name, weight in TARGETS:
        for index, delta in read_target(os.path.join(src, "mpfb", name + ".target.gz")).items():
            coords[index] += delta * weight
    groups = {}
    for g, corners in faces:
        groups.setdefault(g, set()).update(i for i, _ in corners)
    return {"coords": coords, "uvs": uvs, "faces": faces, "groups": groups}


def fit_proxy(mh, clo):
    """MakeHuman proxy fitting: barycentric refs + per-axis scaled offset, in MH space."""
    coords = mh["coords"]
    scale = []
    for axis, key in enumerate("xyz"):
        a, b, d = clo["scales"].get(key, (0, 0, 0))
        scale.append(abs(coords[a][axis] - coords[b][axis]) / d if d else 1.0)
    out = []
    for refs, weights, offset in clo["refs"]:
        p = Vector()
        for r, w in zip(refs, weights):
            p += coords[r] * w
        out.append(p + Vector((offset[0] * scale[0], offset[1] * scale[1], offset[2] * scale[2])))
    return out


def mh_to_blender(p):
    # MakeHuman: decimetres, Y up, faces +Z. Rig: metres, Z up, faces -Y.
    return Vector((p[0] * 0.1, -p[2] * 0.1, p[1] * 0.1))


# =============================================================== Blender helpers

def make_object(name, points, faces, uvs, material=None, keep=None):
    """faces: [(group, [(vi, uvi), ...])]. Points: list of Vector (Blender space)."""
    keep_faces = [f for f in faces if keep is None or keep(f)]
    used = sorted({vi for _, corners in keep_faces for vi, _ in corners})
    remap = {old: new for new, old in enumerate(used)}
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata([points[i] for i in used], [], [[remap[vi] for vi, _ in c] for _, c in keep_faces])
    layer = mesh.uv_layers.new(name="UVMap")
    loop = 0
    for _, corners in keep_faces:
        for _, uvi in corners:
            layer.data[loop].uv = uvs[uvi] if uvi >= 0 else (0, 0)
            loop += 1
    mesh.validate(clean_customdata=False)
    for poly in mesh.polygons:
        poly.use_smooth = True
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    if material:
        mesh.materials.append(material)
    obj["source_index"] = used if len(used) < 40000 else []
    return obj, used


def make_mesh_object(name, verts, faces, material=None, uvs=None, smooth=True):
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], faces)
    if uvs is not None:
        layer = mesh.uv_layers.new(name="UVMap")
        for i, uv in enumerate(uvs):
            layer.data[i].uv = uv
    mesh.validate(clean_customdata=False)
    for poly in mesh.polygons:
        poly.use_smooth = smooth
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    if material:
        mesh.materials.append(material)
    return obj


def components(mesh):
    parent = list(range(len(mesh.vertices)))

    def find(a):
        while parent[a] != a:
            parent[a] = parent[parent[a]]
            a = parent[a]
        return a
    for e in mesh.edges:
        a, b = find(e.vertices[0]), find(e.vertices[1])
        if a != b:
            parent[a] = b
    comp = {}
    for i in range(len(mesh.vertices)):
        comp.setdefault(find(i), []).append(i)
    return list(comp.values())


def select_only(*objs):
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]


# =============================================================== assembly

def assemble(src):
    rig_bones, rscale, rfloor = approved_rig_landmarks()
    mh = load_makehuman(src)
    sysdir = os.path.join(src, "sys")
    clos = {
        "eyes": read_mhclo(os.path.join(sysdir, "eyes/high-poly/high-poly.mhclo")),
        "brows": read_mhclo(os.path.join(sysdir, "eyebrows/eyebrow001/eyebrow001.mhclo")),
        "lashes": read_mhclo(os.path.join(sysdir, "eyelashes/eyelashes01/eyelashes01.mhclo")),
        "hair": read_mhclo(os.path.join(sysdir, "hair/short02/short02.mhclo")),
        "suit": read_mhclo(os.path.join(sysdir, "clothes/male_casualsuit01/male_casualsuit01.mhclo")),
        "shoes": read_mhclo(os.path.join(sysdir, "clothes/shoes06/shoes06.mhclo")),
    }
    fitted = {k: fit_proxy(mh, c) for k, c in clos.items()}
    # Global transform: MH -> Blender metres, sole of shoes at Z=0, crown at HEIGHT.
    body_idx = mh["groups"]["body"]
    pts = [mh_to_blender(p) for p in mh["coords"]]
    shoe_pts = [mh_to_blender(p) for p in fitted["shoes"]]
    sole = min(p.z for p in shoe_pts)
    crown = max(pts[i].z for i in body_idx)
    factor = HEIGHT / (crown - sole)

    def tf(p):
        q = mh_to_blender(p)
        return Vector((q.x * factor, q.y * factor, (q.z - sole) * factor))
    world = {"base": [tf(p) for p in mh["coords"]]}
    for k, v in fitted.items():
        world[k] = [tf(p) for p in v]
    joints = {}
    for name, idx in mh["groups"].items():
        if name.startswith("joint-"):
            joints[name[6:]] = sum((world["base"][i] for i in idx), Vector()) / len(idx)
    rig_bones["_scale"] = (rscale, rfloor)
    return mh, clos, world, joints, rig_bones




# =============================================================== rigs and skin weights

MH_BONES = (
    # name, parent, head joint(s), tail joint(s); "mid:" = (0, y, z) helpers resolved in mh_armature.
    ("hips", None), ("spine", "hips"), ("chest", "spine"), ("neck", "chest"), ("head", "neck"),
    ("shoulder.L", "chest"), ("upper_arm.L", "shoulder.L"), ("forearm.L", "upper_arm.L"), ("hand.L", "forearm.L"),
    ("shoulder.R", "chest"), ("upper_arm.R", "shoulder.R"), ("forearm.R", "upper_arm.R"), ("hand.R", "forearm.R"),
    ("thigh.L", "hips"), ("shin.L", "thigh.L"), ("foot.L", "shin.L"),
    ("thigh.R", "hips"), ("shin.R", "thigh.R"), ("foot.R", "shin.R"),
)


def mh_bone_points(j):
    def c(z_from, y_from):
        return Vector((0, y_from.y, z_from.z))
    pts = {
        "hips": (c(j["l-upper-leg"], j["pelvis"]), Vector((0, j["spine-3"].y, j["spine-3"].z))),
        "spine": (Vector((0, j["spine-3"].y, j["spine-3"].z)), Vector((0, j["spine-1"].y, j["spine-1"].z))),
        "chest": (Vector((0, j["spine-1"].y, j["spine-1"].z)), c(j["l-clavicle"], j["neck"])),
        "neck": (c(j["l-clavicle"], j["neck"]), Vector((0, j["head"].y, j["head"].z))),
        "head": (Vector((0, j["head"].y, j["head"].z)), Vector((0, j["head-2"].y, j["head-2"].z))),
    }
    for s, side in (("l", ".L"), ("r", ".R")):
        pts["shoulder" + side] = (j[f"{s}-clavicle"], j[f"{s}-shoulder"])
        pts["upper_arm" + side] = (j[f"{s}-shoulder"], j[f"{s}-elbow"])
        pts["forearm" + side] = (j[f"{s}-elbow"], j[f"{s}-hand"])
        pts["hand" + side] = (j[f"{s}-hand"], j[f"{s}-finger-3-2"])
        pts["thigh" + side] = (j[f"{s}-upper-leg"], j[f"{s}-knee"])
        pts["shin" + side] = (j[f"{s}-knee"], j[f"{s}-ankle"])
        pts["foot" + side] = (j[f"{s}-ankle"], j[f"{s}-foot-1"])
    return pts


def armature_from(name, points):
    data = bpy.data.armatures.new(name)
    rig = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(rig)
    select_only(rig)
    bpy.ops.object.mode_set(mode="EDIT")
    for bname, parent in MH_BONES:
        bone = data.edit_bones.new(bname)
        bone.head, bone.tail = points[bname]
        bone.inherit_scale = "NONE"
        if parent:
            bone.parent = data.edit_bones[parent]
    bpy.ops.object.mode_set(mode="OBJECT")
    return rig


def heat_weights(body, rig):
    """Blender bone-heat weights for the body; returns per-vertex {bone: w}."""
    for g in list(body.vertex_groups):
        body.vertex_groups.remove(g)
    for m in list(body.modifiers):
        body.modifiers.remove(m)
    body.parent = None
    select_only(rig, body)
    body.select_set(True)
    rig.select_set(True)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.parent_set(type="ARMATURE_AUTO")
    names = {g.index: g.name for g in body.vertex_groups}
    weights = []
    for v in body.data.vertices:
        w = {names[g.group]: g.weight for g in v.groups if g.weight > 1e-4}
        weights.append(w)
    missing = sum(1 for w in weights if not w)
    print(f"HRCHAR heat weights {rig.name}: {len(weights)} verts, {missing} unweighted", flush=True)
    for m in list(body.modifiers):
        body.modifiers.remove(m)
    body.parent = None
    return weights


def fill_missing(obj, weights):
    """Unweighted verts copy the nearest weighted vertex."""
    kd = KDTree(len(weights))
    count = 0
    for i, w in enumerate(weights):
        if w:
            kd.insert(obj.data.vertices[i].co, i)
            count += 1
    kd.balance()
    for i, w in enumerate(weights):
        if not w:
            _, j, _ = kd.find(obj.data.vertices[i].co)
            weights[i] = dict(weights[j])


def transfer_weights(source, src_weights, target, max_distance=0.5):
    """Interpolate body weights onto a garment/part via nearest surface point."""
    mesh = source.data
    bvh = BVHTree.FromPolygons([v.co for v in mesh.vertices], [p.vertices[:] for p in mesh.polygons])
    out = []
    for v in target.data.vertices:
        loc, _n, face, _d = bvh.find_nearest(v.co, max_distance)
        if face is None:
            out.append({})
            continue
        poly = mesh.polygons[face]
        acc, total = {}, 0.0
        for vi in poly.vertices:
            d = (mesh.vertices[vi].co - loc).length
            k = 1.0 / max(d, 1e-5)
            total += k
            for b, w in src_weights[vi].items():
                acc[b] = acc.get(b, 0) + w * k
        out.append({b: w / total for b, w in acc.items()})
    return out


def limit_weights(w, n=4):
    items = sorted(w.items(), key=lambda kv: kv[1], reverse=True)[:n]
    total = sum(x for _, x in items) or 1
    return {b: x / total for b, x in items if x / total > 1e-3}


def write_groups(obj, weights):
    for g in list(obj.vertex_groups):
        obj.vertex_groups.remove(g)
    groups = {}
    for i, w in enumerate(weights):
        for b, x in limit_weights(w).items():
            if b not in groups:
                groups[b] = obj.vertex_groups.new(name=b)
            groups[b].add([i], x, "REPLACE")


def pose_to(rig, targets, stretch):
    """Pose each bone so its head/direction (and length if stretch) match targets."""
    select_only(rig)
    bpy.ops.object.mode_set(mode="POSE")
    for bname, _parent in MH_BONES:
        if bname not in targets:
            continue
        pb = rig.pose.bones[bname]
        head, tail = targets[bname]
        rest = pb.bone.matrix_local.copy()
        rest_dir = (pb.bone.tail_local - pb.bone.head_local)
        want = tail - head
        k = want.length / rest_dir.length if bname in stretch else 1.0
        delta = rest_dir.normalized().rotation_difference(want.normalized())
        m = Matrix.Translation(head) @ delta.to_matrix().to_4x4() @ rest.to_quaternion().to_matrix().to_4x4() @ Matrix.Diagonal((1, k, 1, 1))
        pb.matrix = m
        bpy.context.view_layer.update()
    bpy.ops.object.mode_set(mode="OBJECT")


def deform_bake(obj, rig, weights):
    write_groups(obj, weights)
    mod = obj.modifiers.new("repose", "ARMATURE")
    mod.object = rig
    deps = bpy.context.evaluated_depsgraph_get()
    ev = obj.evaluated_get(deps)
    coords = [v.co.copy() for v in ev.data.vertices]
    obj.modifiers.remove(mod)
    for v, c in zip(obj.data.vertices, coords):
        v.co = c
    obj.data.update()


# =============================================================== geometry

def suit_face_kind(uvs, corners):
    u = sum(uvs[uvi][0] for _, uvi in corners) / len(corners)
    return "shorts" if 0.355 < u < 0.715 else "shirt"


def build_parts(src):
    mh, clos, world, joints, rig_bones = assemble(src)
    parts = {}
    # Body: whole MakeHuman body group (helpers, joints, genital helper excluded).
    body, body_used = make_object("body", world["base"], mh["faces"], mh["uvs"], keep=lambda f: f[0] == "body")
    parts["body"] = body
    for key in ("eyes", "brows", "lashes", "hair", "shoes"):
        _v, uvs, faces = read_obj(clos[key]["obj"])
        parts[key], _ = make_object(key, world[key], faces, uvs)
    _v, uvs, faces = read_obj(clos["suit"]["obj"])
    parts["shirt"], _ = make_object("shirt", world["suit"], faces, uvs, keep=lambda f: suit_face_kind(uvs, f[1]) == "shirt")
    parts["shorts"], _ = make_object("shorts", world["suit"], faces, uvs, keep=lambda f: suit_face_kind(uvs, f[1]) == "shorts")
    hidden = set(clos["shoes"]["delete"]) | set(clos["suit"]["delete"])
    return parts, body_used, hidden, joints, rig_bones, world


def bisect_part(obj, co, no, keep_side):
    """Cut obj by a plane; keep_side=+1 keeps the half along +no. Returns new boundary verts' coords."""
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    geom = bm.verts[:] + bm.edges[:] + bm.faces[:]
    result = bmesh.ops.bisect_plane(bm, geom=geom, plane_co=co, plane_no=no * keep_side, clear_inner=True)
    cut = [e for e in result["geom_cut"] if isinstance(e, bmesh.types.BMEdge)]
    bm.to_mesh(obj.data)
    bm.free()
    obj.data.update()
    return len(cut)


def bisect_region(obj, co, no, region):
    """Bisect only faces whose centre satisfies region(center); remove the -no side of those."""
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    faces = [f for f in bm.faces if region(f.calc_center_median())]
    verts = {v for f in faces for v in f.verts}
    edges = {e for f in faces for e in f.edges}
    geom = list(verts) + list(edges) + faces
    bmesh.ops.bisect_plane(bm, geom=geom, plane_co=co, plane_no=no)
    doomed = [f for f in bm.faces if region(f.calc_center_median()) and (f.calc_center_median() - co).dot(no) < 0]
    bmesh.ops.delete(bm, geom=doomed, context="FACES")
    loose = [v for v in bm.verts if not v.link_faces]
    bmesh.ops.delete(bm, geom=loose, context="VERTS")
    bm.to_mesh(obj.data)
    bm.free()
    obj.data.update()


def boundary_loops(obj, select):
    """Ordered boundary loops whose verts all satisfy select(co)."""
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bm.verts.ensure_lookup_table()
    edges = [e for e in bm.edges if e.is_boundary and all(select(v.co) for v in e.verts)]
    adj = {}
    for e in edges:
        a, b = e.verts[0].index, e.verts[1].index
        adj.setdefault(a, []).append(b)
        adj.setdefault(b, []).append(a)
    loops, seen = [], set()
    for start in adj:
        if start in seen:
            continue
        loop, prev, cur = [start], None, start
        seen.add(start)
        while True:
            nxt = [n for n in adj[cur] if n != prev and n not in seen]
            if not nxt:
                break
            prev, cur = cur, nxt[0]
            loop.append(cur)
            seen.add(cur)
        if len(loop) > 5:
            loops.append(loop)
    bm.free()
    return loops


def add_band(obj, loop, axis_origin, axis_dir, height, out1, out2, flare=0.0, closed=True, u0=0.01):
    """Rolled cuff / hem: extrude a boundary loop into a folded band around an axis.

    Rings: boundary -> +out1 radial -> +height along axis_dir (+out2) -> back in.
    Creates new faces in obj; returns ring vertex indices.
    """
    mesh = obj.data
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bm.verts.ensure_lookup_table()
    uv = bm.loops.layers.uv.active
    base = [bm.verts[i] for i in loop]
    base_uv = [tuple(v.link_loops[0][uv].uv) if (uv and v.link_loops) else (0.0, 0.0) for v in base]
    axis_dir = axis_dir.normalized()

    def radial(p):
        rel = p - axis_origin
        along = axis_dir * rel.dot(axis_dir)
        r = rel - along
        return r.normalized() if r.length > 1e-6 else Vector((1, 0, 0))
    rings = [base]
    specs = ((out1, 0.0), (out1 + out2, height * 0.5), (out1 + out2 + flare, height), (out1 * 0.3, height))
    for off, h in specs:
        ring = [bm.verts.new(v.co + radial(v.co) * off + axis_dir * h) for v in base]
        rings.append(ring)
    n = len(base)
    count = n if closed else n - 1
    for r in range(len(rings) - 1):
        for i in range(count):
            a, b = rings[r][i], rings[r][(i + 1) % n]
            c, d = rings[r + 1][(i + 1) % n], rings[r + 1][i]
            try:
                f = bm.faces.new((a, b, c, d))
            except ValueError:
                continue
            f.smooth = True
            if uv:
                for k, lp in enumerate(f.loops):
                    j = (i + (1 if k in (1, 2) else 0)) % n
                    lp[uv].uv = (base_uv[j][0], base_uv[j][1] + 0.004 * (r + (1 if k >= 2 else 0)))
    bm.normal_update()
    bm.to_mesh(mesh)
    bm.free()
    mesh.update()


def push_out(obj, amount, region=lambda co: True, axis=None):
    mesh = obj.data
    for v in mesh.vertices:
        if region(v.co):
            v.co += v.normal * amount(v.co) if callable(amount) else v.normal * amount
    mesh.update()


def hem_extend(obj, loop, center_xy, drop, flare):
    """Untuck the shirt: extend the hidden waist boundary downward and outward."""
    mesh = obj.data
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bm.verts.ensure_lookup_table()
    uv = bm.loops.layers.uv.active
    base = [bm.verts[i] for i in loop]
    base_uv = [tuple(v.link_loops[0][uv].uv) if (uv and v.link_loops) else (0.0, 0.0) for v in base]
    rings = [base]
    steps = 4
    for s in range(1, steps + 1):
        t = s / steps
        ring = []
        for v in base:
            r = Vector((v.co.x - center_xy.x, v.co.y - center_xy.y, 0))
            r = r.normalized() if r.length > 1e-6 else Vector((0, -1, 0))
            ring.append(bm.verts.new(v.co + Vector((0, 0, -drop * t)) + r * flare * (t ** 0.7)))
        rings.append(ring)
    n = len(base)
    for r in range(steps):
        for i in range(n):
            a, b = rings[r][i], rings[r][(i + 1) % n]
            c, d = rings[r + 1][(i + 1) % n], rings[r + 1][i]
            try:
                f = bm.faces.new((a, b, c, d))
            except ValueError:
                continue
            f.smooth = True
            if uv:
                # Reuse a plain shirt-body region of the UV layout.
                for k, lp in enumerate(f.loops):
                    j = (i + (1 if k in (1, 2) else 0)) % n
                    lp[uv].uv = (base_uv[j][0], base_uv[j][1] - 0.006 * (r + (1 if k >= 2 else 0)))
    bm.normal_update()
    bm.to_mesh(mesh)
    bm.free()
    mesh.update()
    return rings[-1]


# =============================================================== repose + tailoring

LIMB_STRETCH = {"shoulder.L", "shoulder.R", "upper_arm.L", "upper_arm.R", "forearm.L", "forearm.R",
                "thigh.L", "thigh.R", "shin.L", "shin.R"}


def repose(parts, joints, rig_bones):
    """Move the MakeHuman A-pose onto the approved rig's rest pose (limbs only)."""
    mh_rig = armature_from("mh-rig", mh_bone_points(joints))
    body = parts["body"]
    body_w = heat_weights(body, mh_rig)
    fill_missing(body, body_w)
    others = {k: transfer_weights(body, body_w, o) for k, o in parts.items() if k != "body"}
    for k in others:
        fill_missing(parts[k], others[k])
    targets = {name: rig_bones[name] for name in rig_bones
               if name.split(".")[0] in ("shoulder", "upper_arm", "forearm", "hand", "thigh", "shin", "foot")}
    pose_to(mh_rig, targets, LIMB_STRETCH)
    deform_bake(body, mh_rig, body_w)
    for k, w in others.items():
        deform_bake(parts[k], mh_rig, w)
    bpy.data.objects.remove(mh_rig, do_unlink=True)


def tailor(parts, rig_bones):
    shirt, shorts = parts["shirt"], parts["shorts"]
    # Rolled sleeves: cut a little below the elbow, then roll a 5 cm folded band upward.
    for side, sign in ((".L", 1), (".R", -1)):
        elbow = rig_bones["forearm" + side][0]
        wrist = rig_bones["forearm" + side][1]
        shoulder = rig_bones["upper_arm" + side][0]
        axis = (wrist - elbow).normalized()
        co = elbow + axis * 0.035
        bisect_region(shirt, co, -axis, lambda c, s=sign: c.x * s > 0.2)
        loops = boundary_loops(shirt, lambda c, s=sign, co=co, ax=axis: c.x * s > 0.2 and abs((c - co).dot(ax)) < 0.02)
        for loop in loops:
            add_band(shirt, loop, elbow, -axis, 0.052, 0.006, 0.004, flare=0.002, u0=0.02)
    # Shorts: hem 6 cm above the knee joint, with a 2.5 cm turned hem.
    knee = rig_bones["shin.L"][0]
    hem_z = knee.z + 0.075
    bisect_region(shorts, Vector((0, 0, hem_z)), Vector((0, 0, 1)), lambda c: c.z < 0.85)
    for loop in boundary_loops(shorts, lambda c: abs(c.z - hem_z) < 0.01):
        cx = sum((shorts.data.vertices[i].co for i in loop), Vector()) / len(loop)
        add_band(shorts, loop, Vector((cx.x, cx.y, 0)), Vector((0, 0, 1)), 0.03, 0.004, 0.002, u0=0.42)
    # Belt and waistband sit under the untucked shirt: drop them; loosen the legs.
    bm = bmesh.new()
    bm.from_mesh(shorts.data)
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.calc_center_median().z > 0.965], context="FACES")
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context="VERTS")
    bm.to_mesh(shorts.data)
    bm.free()
    shorts.data.update()
    push_out(shorts, lambda c: 0.003 + 0.012 * max(0.0, min(1.0, (0.80 - c.z) / 0.16)))
    # Looser linen: push the shirt off the body a little more below the chest.
    push_out(shirt, lambda c: 0.004 + 0.010 * max(0.0, min(1.0, (1.25 - c.z) / 0.25)))
    # Untuck: extend the hidden waist boundary over the shorts.
    waist = [l for l in boundary_loops(shirt, lambda c: 0.85 < c.z < 1.12 and abs(c.x) < 0.25)]
    for loop in waist:
        center = sum((shirt.data.vertices[i].co for i in loop), Vector()) / len(loop)
        hem_extend(shirt, loop, center, 0.15, 0.028)
    print(f"HRCHAR shirt verts pushed over shorts: {clear_over(shirt, shorts)}", flush=True)
    return hem_z


def hide_covered_body(body, body_used, hidden, rig_bones, hem_z):
    """Delete body faces under clothes and shoes (MakeHuman delete_verts), keeping visible skin."""
    keep_skin = set()
    for i, src in enumerate(body_used):
        co = body.data.vertices[i].co
        if src in hidden:
            # Forearms below the rolled cuff and legs between shorts and socks stay visible.
            for side in (".L", ".R"):
                elbow, wrist = rig_bones["forearm" + side]
                axis = (wrist - elbow).normalized()
                if (co - elbow).dot(axis) > 0.0 and abs(co.x) > 0.2:
                    keep_skin.add(i)
            if 0.2 < co.z < hem_z + 0.03:
                keep_skin.add(i)
    doomed = {i for i, src in enumerate(body_used) if src in hidden and i not in keep_skin}
    bm = bmesh.new()
    bm.from_mesh(body.data)
    faces = [f for f in bm.faces if all(v.index in doomed for v in f.verts)]
    bmesh.ops.delete(bm, geom=faces, context="FACES")
    loose = [v for v in bm.verts if not v.link_faces]
    bmesh.ops.delete(bm, geom=loose, context="VERTS")
    bm.to_mesh(body.data)
    bm.free()
    body.data.update()
    return len(faces)




# =============================================================== textures (numpy; procedural or remapped CC0)

def load_np(path, size=None):
    img = bpy.data.images.load(path, check_existing=False)
    if size and (img.size[0] != size or img.size[1] != size):
        img.scale(size, size)
    w, h = img.size
    a = np.empty(w * h * 4, dtype=np.float32)
    img.pixels.foreach_get(a)
    bpy.data.images.remove(img)
    return a.reshape(h, w, 4)  # bottom-up rows, as Blender stores them


def save_np(arr, path, colorspace="sRGB"):
    h, w = arr.shape[:2]
    if arr.shape[2] == 3:
        arr = np.concatenate([arr, np.ones((h, w, 1), np.float32)], axis=2)
    img = bpy.data.images.new(os.path.basename(path), w, h, alpha=True, float_buffer=False)
    img.colorspace_settings.name = colorspace if colorspace == "sRGB" else "Non-Color"
    img.pixels.foreach_set(np.clip(arr, 0, 1).astype(np.float32).ravel())
    img.filepath_raw = path
    img.file_format = "PNG"
    img.save()
    return img


def srgb(linear):
    linear = np.clip(linear, 0, 1)
    return np.where(linear <= 0.0031308, linear * 12.92, 1.055 * np.power(linear, 1 / 2.4) - 0.055)


def lin(s):
    s = np.clip(s, 0, 1)
    return np.where(s <= 0.04045, s / 12.92, np.power((s + 0.055) / 1.055, 2.4))


def blur(a, r):
    """Separable box blur (wraps), repeated for a near-gaussian."""
    for _ in range(3):
        for axis in (0, 1):
            acc = np.zeros_like(a)
            for k in range(-r, r + 1):
                acc += np.roll(a, k, axis=axis)
            a = acc / (2 * r + 1)
    return a


def noise(shape, scale, rng):
    """Tileable value noise via blurred white noise at a coarse grid."""
    h, w = shape
    g = rng.random((max(2, -(-h // scale)), max(2, -(-w // scale)))).astype(np.float32)
    g = np.kron(g, np.ones((scale, scale), np.float32))[:h, :w]
    g = blur(g, max(1, scale // 2))
    return (g - g.min()) / (np.ptp(g) + 1e-6)


def height_to_normal(height, strength):
    dx = (np.roll(height, -1, axis=1) - np.roll(height, 1, axis=1)) * strength
    dy = (np.roll(height, -1, axis=0) - np.roll(height, 1, axis=0)) * strength
    n = np.stack([-dx, -dy, np.ones_like(height)], axis=2)
    n /= np.linalg.norm(n, axis=2, keepdims=True)
    return n * 0.5 + 0.5


def combine_normals(base, detail):
    """Reoriented normal mapping; both in [0,1] encoding."""
    t = base[..., :3] * np.array([2, 2, 2], np.float32) + np.array([-1, -1, 0], np.float32)
    u = detail[..., :3] * np.array([-2, -2, 2], np.float32) + np.array([1, 1, -1], np.float32)
    r = t * np.sum(t * u, axis=2, keepdims=True) / np.maximum(t[..., 2:3], 1e-3) - u
    r /= np.linalg.norm(r, axis=2, keepdims=True)
    return r * 0.5 + 0.5


def weave(size, period, rng, twill=False):
    """Plain or twill weave height field, tileable."""
    y, x = np.mgrid[0:size, 0:size].astype(np.float32)
    p = period
    if twill:
        warp = 0.5 + 0.5 * np.sin(2 * np.pi * (x + y) / p)
        weft = 0.5 + 0.5 * np.sin(2 * np.pi * (x - y * 0.25) / (p * 0.5))
        h = 0.65 * warp + 0.35 * weft
    else:
        cx = np.sin(np.pi * x / p) ** 2
        cy = np.sin(np.pi * y / p) ** 2
        checker = ((np.floor(x / p) + np.floor(y / p)) % 2).astype(np.float32)
        h = np.where(checker > 0.5, cx, cy) * 0.8 + 0.2 * (cx * cy)
    slub = noise((size, size), max(4, size // 32), rng)
    return h * (0.8 + 0.4 * slub)


def gen_textures(src, out, scalp=None):
    rng = np.random.default_rng(SEED)
    sysdir = os.path.join(src, "sys")
    tex = {}
    # --- skin: CC0 MakeHuman young asian male diffuse, warmed; procedural pores.
    skin = load_np(os.path.join(sysdir, "skins/young_asian_male/young_lightskinned_male_diffuse3.png"), 2048)[..., :3]
    skin = srgb(lin(skin) * np.array(SKIN_TINT, np.float32) * 0.92)
    mottling = noise(skin.shape[:2], 48, rng)[..., None]
    skin = np.clip(skin * (0.96 + 0.08 * mottling), 0, 1)
    if scalp is not None:
        hair_root = srgb(np.array(HAIR, np.float32) * 2.2)
        skin = skin * (1 - scalp[..., None]) + hair_root * scalp[..., None]
    tex["skin_albedo"] = save_np(skin, os.path.join(out, "skin_albedo.png"))
    pores = (rng.random((2048, 2048)).astype(np.float32) > 0.985).astype(np.float32)
    pores = blur(pores, 1)
    height = -pores * 1.4 + noise((2048, 2048), 3, rng) * 0.35 + noise((2048, 2048), 12, rng) * 0.4
    tex["skin_normal"] = save_np(height_to_normal(height, 1.6), os.path.join(out, "skin_normal.png"), "Non-Color")
    # --- cloth: shirt + shorts share the MakeHuman suit UV layout. MH luminance gives folds and
    #     seams; colour is ours (cream linen / black twill). Denim colour is not kept.
    suit = load_np(os.path.join(sysdir, "clothes/male_casualsuit01/male_casualsuit01_diffuse.png"), 2048)[..., :3]
    ao = load_np(os.path.join(sysdir, "clothes/male_casualsuit01/male_casualsuit01_ao.png"), 2048)[..., 0]
    lum = suit @ np.array([0.3, 0.59, 0.11], np.float32)
    h, w = lum.shape
    u = (np.arange(w, dtype=np.float32) + 0.5) / w
    shorts_mask = ((u > 0.355) & (u < 0.715)).astype(np.float32)[None, :].repeat(h, 0)
    detail = np.clip(lum / (blur(lum, 24) + 1e-3), 0.6, 1.4)
    linen = weave(2048, 3.0, rng)
    twill = weave(2048, 4.0, rng, twill=True)
    shirt_col = np.array(SHIRT, np.float32) * (0.9 + 0.1 * linen[..., None]) * (0.55 + 0.45 * ao[..., None]) * (0.85 + 0.15 * detail[..., None])
    shorts_col = np.array(SHORTS, np.float32) * (0.8 + 0.4 * twill[..., None]) * (0.6 + 0.4 * ao[..., None]) * detail[..., None] ** 0.5
    cloth = srgb(shirt_col * (1 - shorts_mask[..., None]) + shorts_col * shorts_mask[..., None])
    tex["cloth_albedo"] = save_np(cloth, os.path.join(out, "cloth_albedo.png"))
    base_n = load_np(os.path.join(sysdir, "clothes/male_casualsuit01/male_casualsuit01_normal.png"), 2048)
    fabric = height_to_normal(linen * (1 - shorts_mask) + twill * shorts_mask, 0.35)
    tex["cloth_normal"] = save_np(combine_normals(base_n, fabric), os.path.join(out, "cloth_normal.png"), "Non-Color")
    orm = np.stack([0.5 + 0.5 * ao, 0.82 + 0.1 * linen * (1 - shorts_mask) + 0.06 * shorts_mask, np.zeros_like(ao)], axis=2)
    tex["cloth_orm"] = save_np(orm, os.path.join(out, "cloth_orm.png"), "Non-Color")
    # --- tileable materials (UVs are scaled at build time): canvas, rubber, knit, tote.
    s = 1024
    canvas = weave(s, 4.0, rng)
    big = noise((s, s), 64, rng)
    tex["canvas_albedo"] = save_np(srgb(np.array(CANVAS, np.float32) * (0.78 + 0.3 * canvas[..., None]) * (0.9 + 0.2 * big[..., None])),
                                   os.path.join(out, "canvas_albedo.png"))
    tex["canvas_normal"] = save_np(height_to_normal(canvas + 0.3 * big, 2.0), os.path.join(out, "canvas_normal.png"), "Non-Color")
    tote = srgb(np.array(TOTE, np.float32) * (0.82 + 0.25 * canvas[..., None]) * (0.92 + 0.16 * big[..., None]))
    tex["tote_albedo"] = save_np(tote, os.path.join(out, "tote_albedo.png"))
    rib_y, rib_x = np.mgrid[0:s, 0:s].astype(np.float32)
    knit = (0.5 + 0.5 * np.sin(2 * np.pi * rib_x / 8.0)) * (0.7 + 0.3 * np.abs(np.sin(np.pi * rib_y / 6.0)))
    tex["sock_albedo"] = save_np(srgb(np.array(SOCK, np.float32) * (0.82 + 0.18 * knit[..., None])), os.path.join(out, "sock_albedo.png"))
    tex["sock_normal"] = save_np(height_to_normal(knit, 1.5), os.path.join(out, "sock_normal.png"), "Non-Color")
    grit = noise((s, s), 2, rng) * 0.6 + noise((s, s), 16, rng) * 0.4
    tex["rubber_albedo"] = save_np(srgb(np.array(RUBBER, np.float32) * (0.9 + 0.12 * grit[..., None])), os.path.join(out, "rubber_albedo.png"))
    tex["rubber_normal"] = save_np(height_to_normal(grit, 1.2), os.path.join(out, "rubber_normal.png"), "Non-Color")
    # --- hair card: RGBA strands; V=0 root, V=1 tip.
    hw, hh = 256, 512
    hair = np.zeros((hh, hw, 4), np.float32)
    yy = np.linspace(0, 1, hh, dtype=np.float32)[:, None]
    px = np.arange(hw, dtype=np.float32)[None, :]
    for _ in range(70):
        x0 = rng.uniform(0, hw)
        xs = x0 + np.sin(yy * rng.uniform(2, 7) + rng.uniform(0, 6.28)) * rng.uniform(1, 5) + yy * rng.uniform(-14, 14)
        width, length, tone = rng.uniform(0.6, 1.6), rng.uniform(0.55, 1.0), rng.uniform(0.6, 1.4)
        taper = np.clip((length - yy) / 0.25, 0, 1) * np.clip(yy / 0.04, 0.4, 1)
        a = np.clip(1 - np.abs(px - xs) / (width * (0.4 + 0.6 * taper)), 0, 1) * taper
        hair[..., 3] = np.maximum(hair[..., 3], a)
        hair[..., 0] = np.maximum(hair[..., 0], a * tone)
    shade = np.clip(hair[..., 0:1], 0, 1.4)
    hair[..., :3] = srgb(np.array(HAIR, np.float32) * 1.8 * (0.6 + 0.6 * shade) * (1 + 0.25 * yy[..., None]))
    tex["hair_card"] = save_np(hair, os.path.join(out, "hair_card.png"))  # row 0 = V 0 (root)
    # --- MakeHuman CC0 eye, eyebrow, eyelash textures (unchanged); hair cap recoloured black.
    for key, rel in (("eye", "eyes/materials/brown_eye.png"), ("brow", "eyebrows/eyebrow001/eyebrow001.png"),
                     ("lash", "eyelashes/eyelashes01/eyelashes01.png")):
        a = load_np(os.path.join(sysdir, rel))
        if key == "eye":
            # Deep brown iris: halve saturation of the CC0 brown eye and darken the iris slightly.
            l = a[..., :3] @ np.array([0.3, 0.59, 0.11], np.float32)
            a[..., :3] = a[..., :3] * 0.45 + l[..., None] * 0.55
            a[..., :3] *= np.where(l[..., None] < 0.45, 0.7, 1.0)
        tex[key] = save_np(a, os.path.join(out, f"{key}.png"))
    cap = load_np(os.path.join(sysdir, "hair/short02/short02_diffuse.png"), 1024)
    capl = cap[..., :3] @ np.array([0.3, 0.59, 0.11], np.float32)
    cap[..., :3] = srgb(np.array(HAIR, np.float32) * (0.5 + 1.6 * capl[..., None]))
    tex["hair_cap"] = save_np(cap, os.path.join(out, "hair_cap.png"))
    return tex




# =============================================================== accessories (project-original geometry)

def tube(points, radius, segments=8, closed=False):
    """Simple swept tube through points; returns (verts, faces)."""
    verts, faces = [], []
    n = len(points)
    for i, p in enumerate(points):
        a = points[max(i - 1, 0)] if not closed else points[(i - 1) % n]
        b = points[min(i + 1, n - 1)] if not closed else points[(i + 1) % n]
        t = (b - a).normalized()
        side = t.cross(Vector((0, 0, 1)))
        if side.length < 1e-4:
            side = t.cross(Vector((0, 1, 0)))
        side.normalize()
        up = side.cross(t).normalized()
        for k in range(segments):
            ang = 2 * math.pi * k / segments
            verts.append(p + (side * math.cos(ang) + up * math.sin(ang)) * radius)
    rings = n if closed else n - 1
    for i in range(rings):
        for k in range(segments):
            a = i * segments + k
            b = i * segments + (k + 1) % segments
            c = ((i + 1) % n) * segments + (k + 1) % segments
            d = ((i + 1) % n) * segments + k
            faces.append((a, b, c, d))
    return verts, faces


def eye_centers(eyes):
    comps = components(eyes.data)
    centers = []
    for c in comps:
        co = [eyes.data.vertices[i].co for i in c]
        centers.append((sum(co, Vector()) / len(co), min(p.y for p in co), max((p - sum(co, Vector()) / len(co)).length for p in co)))
    left = [c for c in centers if c[0].x > 0]
    right = [c for c in centers if c[0].x < 0]
    pick = lambda group: max(group, key=lambda c: c[2])
    return pick(left), pick(right)


def build_cornea(eyes):
    """Glossy clear shell over each eyeball (reflection carrier)."""
    verts, faces = [], []
    for (center, _front, radius) in eye_centers(eyes):
        rings, segs = 8, 16
        base = len(verts)
        for r in range(rings + 1):
            th = (r / rings) * math.radians(62)
            for s in range(segs):
                ph = 2 * math.pi * s / segs
                d = Vector((math.sin(th) * math.cos(ph), -math.cos(th), math.sin(th) * math.sin(ph)))
                bulge = 1.0 + 0.06 * math.cos(th * 1.4)
                verts.append(center + d * radius * 1.012 * bulge)
        for r in range(rings):
            for s in range(segs):
                a = base + r * segs + s
                b = base + r * segs + (s + 1) % segs
                faces.append((a, base + (r + 1) * segs + s, base + (r + 1) * segs + (s + 1) % segs, b))
    return make_mesh_object("cornea", verts, faces)


def build_glasses(eyes, body):
    (lc, lfront, lr), (rc, _rf, _rr) = eye_centers(eyes)
    radius = 0.0215
    y = lfront - 0.013
    z = lc.z + 0.002
    head_half = max(abs(v.co.x) for v in body.data.vertices
                    if lfront + 0.02 < v.co.y < lfront + 0.05 and z - 0.01 < v.co.z < z + 0.02) + 0.006
    frame_v, frame_f, lens_v, lens_f = [], [], [], []

    def add(vs, fs, target_v, target_f):
        off = len(target_v)
        target_v.extend(vs)
        target_f.extend(tuple(i + off for i in f) for f in fs)
    for sign, c in ((1, lc), (-1, rc)):
        center = Vector((c.x, y, z))
        ring = [center + Vector((math.cos(a) * radius, 0.0015 * math.cos(a) ** 2 * 0, math.sin(a) * radius * 0.96))
                for a in (2 * math.pi * k / 40 for k in range(40))]
        add(*tube(ring, 0.0011, 6, closed=True), frame_v, frame_f)
        # Lens: shallow dome.
        rings, segs = 4, 24
        base = len(lens_v)
        lens_v.append(center + Vector((0, -0.0018, 0)))
        for r in range(1, rings + 1):
            t = r / rings
            for s in range(segs):
                a = 2 * math.pi * s / segs
                lens_v.append(center + Vector((math.cos(a) * radius * t * 0.98, -0.0018 * (1 - t * t), math.sin(a) * radius * 0.96 * t * 0.98)))
        for s in range(segs):
            lens_f.append((base, base + 1 + s, base + 1 + (s + 1) % segs))
        for r in range(rings - 1):
            for s in range(segs):
                a = base + 1 + r * segs + s
                b = base + 1 + r * segs + (s + 1) % segs
                lens_f.append((a, base + 1 + (r + 1) * segs + s, base + 1 + (r + 1) * segs + (s + 1) % segs, b))
        # Temple arm: hinge at the outer rim, back over the ear, small drop behind it.
        hinge = center + Vector((sign * radius, 0, radius * 0.25))
        path = [hinge, hinge + Vector((sign * 0.004, 0.006, 0)),
                Vector((sign * head_half, y + 0.03, z + 0.004)),
                Vector((sign * head_half, y + 0.085, z - 0.002)),
                Vector((sign * (head_half - 0.004), y + 0.105, z - 0.022))]
        add(*tube(path, 0.0010, 6), frame_v, frame_f)
        # Nose pad arm.
        pad = center + Vector((-sign * radius * 0.82, -0.001, -radius * 0.45))
        add(*tube([pad, pad + Vector((-sign * 0.003, 0.006, -0.002))], 0.0007, 5), frame_v, frame_f)
    # Bridge: shallow arch between inner rims.
    inner_l = Vector((lc.x - radius, y, z + radius * 0.3))
    inner_r = Vector((rc.x + radius, y, z + radius * 0.3))
    bridge = [inner_l.lerp(inner_r, t) + Vector((0, -0.002 * math.sin(math.pi * t), 0.004 * math.sin(math.pi * t))) for t in (k / 8 for k in range(9))]
    add(*tube(bridge, 0.0010, 6), frame_v, frame_f)
    return make_mesh_object("frame", frame_v, frame_f), make_mesh_object("lens", lens_v, lens_f)


def build_tote(shirt):
    """Cream canvas tote on the left hip, strap over the left shoulder (rigid to shoulder.L)."""
    bm = bmesh.new()
    w, hgt, d = 0.30, 0.33, 0.05
    cx, cy, top = 0.245, 0.03, 1.02
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=(d, w, hgt), verts=bm.verts)
    bmesh.ops.translate(bm, vec=(cx, cy, top - hgt / 2), verts=bm.verts)
    bmesh.ops.subdivide_edges(bm, edges=bm.edges[:], cuts=7, use_grid_fill=True)
    rng = random.Random(SEED)
    for v in bm.verts:
        rel_y = (v.co.y - cy) / (w / 2)
        rel_z = (v.co.z - (top - hgt / 2)) / (hgt / 2)
        bulge = (1 - rel_y ** 2) * (1 - rel_z ** 2 * 0.6)
        side = 1 if v.co.x > cx else -1
        v.co.x += side * 0.012 * bulge
        v.co.x += 0.002 * math.sin(v.co.z * 61 + v.co.y * 23)  # soft canvas wrinkles
        if rel_z > 0.95:
            v.co.z -= 0.012 * (1 - rel_y ** 2)  # top sags between the handles
        v.co.z += 0.004 * (rng.random() - 0.5)
    uv = bm.loops.layers.uv.new("UVMap")
    for f in bm.faces:
        f.smooth = True
        for lp in f.loops:
            co = lp.vert.co
            lp[uv].uv = ((co.y + co.x * 0.3) * 6.0, co.z * 6.0)
    mesh = bpy.data.meshes.new("tote")
    bm.to_mesh(mesh)
    bm.free()
    bag = bpy.data.objects.new("tote", mesh)
    bpy.context.collection.objects.link(bag)
    sub = bag.modifiers.new("soft", "SUBSURF")
    sub.levels = 1
    select_only(bag)
    bpy.ops.object.modifier_apply(modifier="soft")
    # Strap: one band from the front handle over the shoulder to the back handle.
    sm = shirt.data
    bvh = BVHTree.FromPolygons([v.co for v in sm.vertices], [p.vertices[:] for p in sm.polygons])
    guide = [Vector((cx - 0.005, cy - 0.11, top - 0.01)), Vector((0.20, -0.08, 1.20)), Vector((0.15, -0.06, 1.36)),
             Vector((0.13, 0.0, 1.44)), Vector((0.15, 0.07, 1.36)), Vector((0.20, 0.09, 1.20)),
             Vector((cx - 0.005, cy + 0.11, top - 0.01))]
    path = []
    for i in range(len(guide) - 1):
        for k in range(6):
            path.append(guide[i].lerp(guide[i + 1], k / 6))
    path.append(guide[-1])
    snapped = []
    for p in path:
        loc, nrm, _f, dist = bvh.find_nearest(p, 0.2)
        if loc is not None and p.z > top + 0.02:
            p = loc + nrm.normalized() * 0.006
        snapped.append(p)
    verts, faces, uvs = [], [], []
    for i, p in enumerate(snapped):
        a, b = snapped[max(i - 1, 0)], snapped[min(i + 1, len(snapped) - 1)]
        t = (b - a).normalized()
        loc, nrm, _f, _d = bvh.find_nearest(p, 0.3)
        out = nrm.normalized() if nrm is not None else Vector((1, 0, 0))
        side = t.cross(out).normalized() * 0.0125
        verts += [p + side, p - side]
    for i in range(len(snapped) - 1):
        faces.append((2 * i, 2 * i + 1, 2 * i + 3, 2 * i + 2))
    strap = make_mesh_object("tote_strap", verts, faces)
    solid = strap.modifiers.new("thick", "SOLIDIFY")
    solid.thickness = 0.003
    layer = strap.data.uv_layers.new(name="UVMap")
    for poly in strap.data.polygons:
        for li in poly.loop_indices:
            vi = strap.data.loops[li].vertex_index
            layer.data[li].uv = ((vi % 2) * 0.15, (vi // 2) * 0.1)
    select_only(strap)
    bpy.ops.object.modifier_apply(modifier="thick")
    select_only(bag, strap)
    bag.select_set(True)
    strap.select_set(True)
    bpy.context.view_layer.objects.active = bag
    bpy.ops.object.join()
    return bag


def build_hair_cards(cap, body):
    """Layered alpha hair cards combed from the crown; messy fringe over the forehead."""
    cm = cap.data
    head_faces = [p.vertices[:] for p in body.data.polygons if all(body.data.vertices[i].co.z > 1.5 for i in p.vertices)]
    pts = [v.co.copy() for v in cm.vertices] + [v.co.copy() for v in body.data.vertices]
    off = len(cm.vertices)
    bvh = BVHTree.FromPolygons(pts, [p.vertices[:] for p in cm.polygons] + [tuple(i + off for i in f) for f in head_faces])
    capbvh = BVHTree.FromPolygons([v.co for v in cm.vertices], [p.vertices[:] for p in cm.polygons])
    xs = [v.co.x for v in cm.vertices]
    ys = [v.co.y for v in cm.vertices]
    zs = [v.co.z for v in cm.vertices]
    crown = Vector((0, min(ys) + (max(ys) - min(ys)) * 0.62, max(zs) - 0.01))
    front_y = min(ys)
    areas = [p.area for p in cm.polygons]
    rng = random.Random(SEED)
    verts, faces, uvs, normals = [], [], [], []
    layers = ((0.0035, 520, 0.85), (0.0075, 420, 1.0), (0.012, 300, 1.12))
    for offset, count, length_k in layers:
        for _ in range(count):
            poly = cm.polygons[rng.choices(range(len(areas)), weights=areas)[0]]
            vs = [cm.vertices[i].co for i in poly.vertices]
            wts = [rng.random() for _ in vs]
            tot = sum(wts)
            p = sum((v * (k / tot) for v, k in zip(vs, wts)), Vector())
            loc, n, _f, _d = capbvh.find_nearest(p)
            if loc is None:
                continue
            n = n.normalized()
            if n.z < -0.35:
                continue
            fringe = p.y < front_y + 0.045 and p.z > crown.z - 0.075
            g = p - crown
            g = (g - n * g.dot(n))
            if g.length < 1e-4:
                g = Vector((rng.uniform(-1, 1), -1, 0))
            g.normalize()
            bias = Vector((0, -0.6, -0.55)) if fringe else Vector((0, 0, -0.55 * max(0.0, 1 - n.z)))
            dirv = (g + bias * (0.9 if fringe else 1.0)).normalized()
            ang = rng.uniform(-0.45, 0.45) if not fringe else rng.uniform(-0.7, 0.7)
            dirv = Quaternion(n, ang) @ dirv
            dirv = (dirv - n * dirv.dot(n)).normalized()
            length = rng.uniform(0.045, 0.085) * length_k * (0.8 if fringe else 1.0)
            width = rng.uniform(0.010, 0.017)
            segs = 4
            lift = rng.uniform(0.0, 0.004)
            path = [loc + n * offset]
            cur = loc
            for s in range(1, segs + 1):
                nxt = cur + dirv * (length / segs)
                l2, n2, _f2, _d2 = bvh.find_nearest(nxt, 0.08)
                if l2 is not None:
                    n2 = n2.normalized()
                    cur = l2
                    path.append(l2 + n2 * (offset + lift * s / segs + (0.002 * s if fringe else 0)))
                    dirv = (dirv - n2 * dirv.dot(n2) + Vector((0, 0, -0.18))).normalized()
                else:
                    cur = nxt
                    path.append(nxt)
            u0 = rng.choice((0.0, 0.5))
            base = len(verts)
            for s, q in enumerate(path):
                a = path[max(s - 1, 0)]
                b = path[min(s + 1, len(path) - 1)]
                t = (b - a).normalized()
                lq, nq, _x, _y = bvh.find_nearest(q, 0.1)
                nq = nq.normalized() if nq is not None else n
                side = t.cross(nq).normalized() * width * (1 - 0.45 * s / segs) / 2
                twist = nq * rng.uniform(-0.0015, 0.0015)
                verts += [q + side + twist, q - side - twist]
                uvs += [(u0, s / segs), (u0 + 0.5, s / segs)]
                normals += [nq, nq]
            for s in range(segs):
                a = base + 2 * s
                faces.append((a, a + 2, a + 3, a + 1))
    obj = make_mesh_object("hair_cards", verts, faces)
    layer = obj.data.uv_layers.new(name="UVMap")
    for poly in obj.data.polygons:
        for li in poly.loop_indices:
            layer.data[li].uv = uvs[obj.data.loops[li].vertex_index]
    obj.data.normals_split_custom_set_from_vertices(normals)
    print(f"HRCHAR hair cards: {len(faces)} quads", flush=True)
    return obj


def scale_uv(obj, k, faces=None):
    layer = obj.data.uv_layers.active
    for poly in obj.data.polygons:
        if faces is not None and poly.index not in faces:
            continue
        for li in poly.loop_indices:
            layer.data[li].uv = (layer.data[li].uv[0] * k, layer.data[li].uv[1] * k)




def clear_over(outer, inner, gap=0.006, zmax=1.05):
    """Push outer-garment verts (below zmax) outside the inner garment surface."""
    im = inner.data
    bvh = BVHTree.FromPolygons([v.co for v in im.vertices], [p.vertices[:] for p in im.polygons])
    moved = 0
    for v in outer.data.vertices:
        if v.co.z > zmax:
            continue
        loc, n, _f, _d = bvh.find_nearest(v.co, 0.08)
        if loc is None:
            continue
        n = n.normalized()
        if (v.co - loc).dot(n) < gap:
            v.co = loc + n * gap
            moved += 1
    outer.data.update()
    return moved


def scalp_mask(body, cap, size=2048):
    """UV-space mask of scalp skin under the hair cap (rows bottom-up, like Blender images)."""
    cm = cap.data
    bvh = BVHTree.FromPolygons([v.co for v in cm.vertices], [p.vertices[:] for p in cm.polygons])
    mesh = body.data
    near = []
    for v in mesh.vertices:
        loc, _n, _f, d = bvh.find_nearest(v.co, 0.02)
        near.append(loc is not None and v.co.z > 1.5)
    mask = np.zeros((size, size), np.float32)
    uv = mesh.uv_layers.active.data
    for poly in mesh.polygons:
        if not all(near[i] for i in poly.vertices):
            continue
        pts = [tuple(uv[li].uv) for li in poly.loop_indices]
        for k in range(1, len(pts) - 1):
            tri = np.array([pts[0], pts[k], pts[k + 1]], np.float32) * size
            x0, y0 = np.floor(tri.min(0)).astype(int)
            x1, y1 = np.ceil(tri.max(0)).astype(int)
            x0, y0, x1, y1 = max(x0, 0), max(y0, 0), min(x1, size - 1), min(y1, size - 1)
            if x1 < x0 or y1 < y0:
                continue
            ys, xs = np.mgrid[y0:y1 + 1, x0:x1 + 1].astype(np.float32) + 0.5
            (ax, ay), (bx, by), (cx, cy) = tri
            den = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy)
            if abs(den) < 1e-9:
                continue
            l1 = ((by - cy) * (xs - cx) + (cx - bx) * (ys - cy)) / den
            l2 = ((cy - ay) * (xs - cx) + (ax - cx) * (ys - cy)) / den
            inside = (l1 >= -0.02) & (l2 >= -0.02) & (1 - l1 - l2 >= -0.02)
            mask[y0:y1 + 1, x0:x1 + 1] = np.maximum(mask[y0:y1 + 1, x0:x1 + 1], inside.astype(np.float32))
    return np.clip(blur(mask, 3) * 1.3, 0, 1)


def build_laces(shoes):
    """White flat laces crossing each instep (shoes06 has no lace geometry; its laces were texture)."""
    sm = shoes.data
    bvh = BVHTree.FromPolygons([v.co for v in sm.vertices], [p.vertices[:] for p in sm.polygons])
    verts, faces = [], []
    for sign in (1, -1):
        side = [v.co for v in sm.vertices if v.co.x * sign > 0]
        cx = sum(p.x for p in side) / len(side)
        ymin = min(p.y for p in side)
        for k in range(5):
            y = ymin + 0.055 + k * 0.014
            row = []
            for t in range(7):
                x = cx + (t / 6 - 0.5) * 0.034
                hit, n, _i, _d = bvh.ray_cast(Vector((x, y, 0.3)), Vector((0, 0, -1)))
                if hit is None:
                    row = []
                    break
                row.append(hit + n.normalized() * 0.0025)
            if len(row) < 2:
                continue
            # tilt alternate bars for the criss-cross look
            row = [p + Vector((0, (0.004 if (i < 3) == (k % 2 == 0) else -0.004), 0)) for i, p in enumerate(row)]
            tv, tf = tube(row, 0.0018, 6)
            off = len(verts)
            verts += tv
            faces += [tuple(i + off for i in f) for f in tf]
    obj = make_mesh_object("laces", verts, faces)
    layer = obj.data.uv_layers.new(name="UVMap")
    for i, d in enumerate(layer.data):
        d.uv = ((i % 6) / 6, (i // 6 % 7) / 7)
    return obj


# =============================================================== materials

def pbr(name, tex=None, color=(1, 1, 1), rough=0.6, metal=0.0, normal=None, nstrength=1.0, orm=None,
        alpha=None, blend=None, double=False):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    p = nt.nodes["Principled BSDF"]
    p.inputs["Base Color"].default_value = (*color, 1)
    p.inputs["Roughness"].default_value = rough
    p.inputs["Metallic"].default_value = metal
    if tex is not None:
        node = nt.nodes.new("ShaderNodeTexImage")
        node.image = tex
        nt.links.new(node.outputs["Color"], p.inputs["Base Color"])
        if blend:
            nt.links.new(node.outputs["Alpha"], p.inputs["Alpha"])
    if alpha is not None:
        p.inputs["Alpha"].default_value = alpha
    if normal is not None:
        nn = nt.nodes.new("ShaderNodeTexImage")
        nn.image = normal
        nn.image.colorspace_settings.name = "Non-Color"
        nm = nt.nodes.new("ShaderNodeNormalMap")
        nm.inputs["Strength"].default_value = nstrength
        nt.links.new(nn.outputs["Color"], nm.inputs["Color"])
        nt.links.new(nm.outputs["Normal"], p.inputs["Normal"])
    if orm is not None:
        on = nt.nodes.new("ShaderNodeTexImage")
        on.image = orm
        on.image.colorspace_settings.name = "Non-Color"
        sep = nt.nodes.new("ShaderNodeSeparateColor")
        nt.links.new(on.outputs["Color"], sep.inputs["Color"])
        nt.links.new(sep.outputs["Green"], p.inputs["Roughness"])
        # glTF exporter picks up occlusion from a "glTF Material Output" group; the runtime uses R as AO.
    if blend:
        m.surface_render_method = "DITHERED" if blend in ("CLIP", "HASH") else "BLENDED"
    m.use_backface_culling = not double
    return m


def bake_skin_orm(body, out, scene_objects):
    """AO (with clothes, hair and glasses present) + T-zone roughness, baked to the skin UVs."""
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = 48
    scene.render.bake.margin = 8
    size = 2048
    ao_img = bpy.data.images.new("skin_ao", size, size, alpha=False)
    ao_img.colorspace_settings.name = "Non-Color"
    rough_img = bpy.data.images.new("skin_rough", size, size, alpha=False)
    rough_img.colorspace_settings.name = "Non-Color"
    # T-zone attribute: nose, forehead, chin are shinier (lower roughness); cheeks matte.
    mesh = body.data
    attr = mesh.color_attributes.new("tzone", "FLOAT_COLOR", "POINT")
    head_c = Vector((0, -0.09, 1.6))
    for v in mesh.vertices:
        c = v.co
        r = 0.56
        if c.z > 1.45 and c.y < -0.02:
            nose = math.exp(-((c.x / 0.018) ** 2 + ((c.z - 1.575) / 0.035) ** 2))
            forehead = math.exp(-((c.x / 0.05) ** 2 + ((c.z - 1.665) / 0.03) ** 2))
            chin = math.exp(-((c.x / 0.025) ** 2 + ((c.z - 1.485) / 0.015) ** 2))
            lips = math.exp(-((c.x / 0.022) ** 2 + ((c.z - 1.515) / 0.008) ** 2))
            r = 0.56 - 0.17 * max(nose, forehead * 0.8, chin * 0.6) - 0.12 * lips
        elif c.z < 1.0 and abs(c.x) > 0.3:
            r = 0.62  # hands
        attr.data[v.index].color = (r, r, r, 1)
    if not mesh.materials:
        tmp = bpy.data.materials.new("bake")
        tmp.use_nodes = True
        mesh.materials.append(tmp)
    mat = mesh.materials[0]
    nt = mat.node_tree
    target = nt.nodes.new("ShaderNodeTexImage")
    target.image = ao_img
    nt.nodes.active = target
    select_only(body)
    bpy.ops.object.bake(type="AO")
    # Emission bake of the attribute.
    out_node = [n for n in nt.nodes if n.type == "OUTPUT_MATERIAL"][0]
    old = out_node.inputs["Surface"].links[0].from_socket
    attrn = nt.nodes.new("ShaderNodeAttribute")
    attrn.attribute_name = "tzone"
    emit = nt.nodes.new("ShaderNodeEmission")
    nt.links.new(attrn.outputs["Color"], emit.inputs["Color"])
    nt.links.new(emit.outputs["Emission"], out_node.inputs["Surface"])
    target.image = rough_img
    nt.nodes.active = target
    bpy.ops.object.bake(type="EMIT")
    nt.links.new(old, out_node.inputs["Surface"])
    for n in (attrn, emit, target):
        nt.nodes.remove(n)
    mesh.color_attributes.remove(mesh.color_attributes["tzone"])
    ao = np.empty(size * size * 4, np.float32)
    ao_img.pixels.foreach_get(ao)
    rough = np.empty(size * size * 4, np.float32)
    rough_img.pixels.foreach_get(rough)
    ao = ao.reshape(size, size, 4)[..., 0]
    rough = rough.reshape(size, size, 4)[..., 0]
    rough = np.where(rough < 0.05, 0.56, rough)  # unbaked gutters
    orm = np.stack([0.35 + 0.65 * ao, rough, np.zeros_like(ao)], axis=2)
    return save_np(orm, os.path.join(out, "skin_orm.png"), "Non-Color")


# =============================================================== preview renders (Blender, for authoring only)

def flat(name, color, rough=0.6):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    p = m.node_tree.nodes["Principled BSDF"]
    p.inputs["Base Color"].default_value = (*color, 1)
    p.inputs["Roughness"].default_value = rough
    return m


def studio(out, views, prefix, resolution=(900, 1200)):
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x, scene.render.resolution_y = resolution
    scene.render.film_transparent = False
    scene.view_settings.view_transform = "AgX"
    world = bpy.data.worlds.new("studio") if not scene.world else scene.world
    scene.world = world
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.42, 0.44, 0.47, 1)
    world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.8
    if "key" not in bpy.data.objects:
        for name, loc, energy, size in (("key", (1.6, -2.2, 2.6), 450, 1.5), ("fill", (-2.2, -1.4, 1.6), 160, 2.0),
                                        ("rim", (0.4, 2.4, 2.4), 300, 1.0)):
            light = bpy.data.lights.new(name, "AREA")
            light.energy, light.size = energy, size
            obj = bpy.data.objects.new(name, light)
            bpy.context.collection.objects.link(obj)
            obj.location = loc
            direction = Vector((0, 0, 1.2)) - Vector(loc)
            obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    cam = bpy.data.objects.get("cam") or bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
    if cam.name not in bpy.context.collection.objects:
        bpy.context.collection.objects.link(cam)
    scene.camera = cam
    for name, loc, target, lens in views:
        cam.location = loc
        cam.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
        cam.data.lens = lens
        scene.render.filepath = os.path.join(out, f"{prefix}-{name}.png")
        bpy.ops.render.render(write_still=True)


STUDIO_VIEWS = (
    ("front", (0, -3.6, 1.0), (0, 0, 0.9), 45),
    ("back", (0, 3.6, 1.0), (0, 0, 0.9), 45),
    ("left", (3.6, 0, 1.0), (0, 0, 0.9), 45),
    ("three-quarter", (-2.4, -2.7, 1.25), (0, 0, 0.9), 45),
    ("face", (0.12, -0.75, 1.62), (0, -0.05, 1.58), 85),
    ("hands-shoes", (0.6, -1.2, 0.55), (0.25, 0, 0.45), 50),
)


# =============================================================== main

RIGID_HEAD = ("eyes", "cornea", "frame", "lens")
MATERIALS = {
    # object -> material name (runtime + packaging key)
    "body": "skin", "eyes": "eye", "cornea": "cornea", "brows": "brow", "lashes": "lash", "hair": "hair_cap",
    "hair_cards": "hair_card", "shirt": "cloth", "shorts": "cloth", "shoes": "canvas", "socks": "sock", "laces": "sock",
    "frame": "frame", "lens": "lens", "tote": "tote",
}


def split_socks(shoes):
    comps = components(shoes.data)
    sock = {i for c in comps if len(c) < 300 for i in c}
    for v in shoes.data.vertices:
        v.select = v.index in sock
    for e in shoes.data.edges:
        e.select = all(i in sock for i in e.vertices)
    for p in shoes.data.polygons:
        p.select = all(i in sock for i in p.vertices)
    select_only(shoes)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_mode(type="VERT")
    bpy.ops.mesh.separate(type="SELECTED")
    bpy.ops.object.mode_set(mode="OBJECT")
    socks = [o for o in bpy.context.selected_objects if o != shoes][0]
    socks.name = "socks"
    return socks


def make_materials(tex, skin_orm):
    return {
        "skin": pbr("skin", tex["skin_albedo"], rough=0.5, normal=tex["skin_normal"], nstrength=0.35, orm=skin_orm),
        "eye": pbr("eye", tex["eye"], rough=0.25),
        "cornea": pbr("cornea", None, color=(1, 1, 1), rough=0.03, alpha=0.06, blend="BLEND"),
        "brow": pbr("brow", tex["brow"], rough=0.7, blend="CLIP", double=True),
        "lash": pbr("lash", tex["lash"], rough=0.7, blend="CLIP", double=True),
        "hair_cap": pbr("hair_cap", tex["hair_cap"], rough=0.6, blend="CLIP"),
        "hair_card": pbr("hair_card", tex["hair_card"], rough=0.5, blend="CLIP", double=True),
        "cloth": pbr("cloth", tex["cloth_albedo"], normal=tex["cloth_normal"], orm=tex["cloth_orm"], double=True),
        "canvas": pbr("canvas", tex["canvas_albedo"], rough=0.9, normal=tex["canvas_normal"], nstrength=0.8),
        "rubber": pbr("rubber", tex["rubber_albedo"], rough=0.75, normal=tex["rubber_normal"], nstrength=0.5),
        "sock": pbr("sock", tex["sock_albedo"], rough=0.95, normal=tex["sock_normal"], nstrength=0.7),
        "frame": pbr("frame", None, color=FRAME, rough=0.22, metal=1.0),
        "lens": pbr("lens", None, color=(0.95, 0.97, 1.0), rough=0.02, alpha=0.1, blend="BLEND", double=True),
        "tote": pbr("tote", tex["tote_albedo"], rough=0.9, normal=tex["canvas_normal"], nstrength=0.6, double=True),
    }


def assign(parts, mats):
    for key, obj in parts.items():
        obj.data.materials.clear()
        obj.data.materials.append(mats[MATERIALS[key]])
    shoes = parts["shoes"]
    shoes.data.materials.append(mats["rubber"])
    rubber = set()
    for poly in shoes.data.polygons:
        if poly.center.z < 0.03 or poly.normal.z < -0.6:
            poly.material_index = 1
            rubber.add(poly.index)
    scale_uv(shoes, 5.0, {p.index for p in shoes.data.polygons if p.index not in rubber})
    scale_uv(shoes, 7.0, rubber)
    scale_uv(parts["socks"], 4.0)


def final_weights(parts, rig):
    body = parts["body"]
    bw = heat_weights(body, rig)
    fill_missing(body, bw)
    write_groups(body, bw)
    for key, obj in parts.items():
        if key == "body":
            continue
        if key in RIGID_HEAD:
            w = [{"head": 1.0} for _ in obj.data.vertices]
        elif key == "tote":
            w = [{"shoulder.L": 1.0} for _ in obj.data.vertices]
        else:
            w = transfer_weights(body, bw, obj)
            fill_missing(obj, w)
            if key in ("hair", "hair_cards", "brows", "lashes"):
                w = [{"head": 1.0} if v.co.z > 1.5 else x for v, x in zip(obj.data.vertices, w)]
        write_groups(obj, w)


def join_all(parts, rig, name):
    objs = list(parts.values())
    select_only(objs[0], *objs[1:])
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = parts["body"]
    bpy.ops.object.join()
    model = bpy.context.view_layer.objects.active
    model.name = name
    model.data.name = name
    model.parent = rig
    mod = model.modifiers.new("skin", "ARMATURE")
    mod.object = rig
    mod.use_deform_preserve_volume = False
    return model


def export(model, rig, path):
    select_only(model, rig)
    model.select_set(True)
    rig.select_set(True)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.export_scene.gltf(
        filepath=path, export_format="GLB", use_selection=True, export_yup=True, export_apply=False,
        export_materials="EXPORT", export_image_format="NONE", export_texcoords=True, export_normals=True,
        export_vertex_color="NONE", export_animations=False, export_skins=True, export_influence_nb=4,
        export_leaf_bone=False, export_cameras=False, export_lights=False)


def triangles(obj):
    obj.data.calc_loop_triangles()
    return len(obj.data.loop_triangles)


def main(argv):
    import character_rig as rigging
    src, out = os.path.abspath(argv[0]), os.path.abspath(argv[1])
    stage = argv[2] if len(argv) > 2 else "all"
    os.makedirs(out, exist_ok=True)
    random.seed(SEED)
    parts, body_used, hidden, joints, rig_bones, _world = build_parts(src)
    repose(parts, joints, rig_bones)
    hem_z = tailor(parts, rig_bones)
    parts["cornea"] = build_cornea(parts["eyes"])
    parts["frame"], parts["lens"] = build_glasses(parts["eyes"], parts["body"])
    parts["tote"] = build_tote(parts["shirt"])
    parts["hair_cards"] = build_hair_cards(parts["hair"], parts["body"])
    parts["socks"] = split_socks(parts["shoes"])
    parts["laces"] = build_laces(parts["shoes"])
    scale, floor = rig_bones.pop("_scale")
    rig = rigging.make_armature(scale, floor)
    final_weights(parts, rig)
    removed = hide_covered_body(parts["body"], body_used, hidden, rig_bones, hem_z)
    print(f"HRCHAR hidden body faces: {removed}", flush=True)
    tex = gen_textures(src, out, scalp_mask(parts["body"], parts["hair"]))
    skin_orm = bake_skin_orm(parts["body"], out, parts) if stage != "fast" else tex["cloth_orm"]
    mats = make_materials(tex, skin_orm)
    assign(parts, mats)
    if stage != "noview":
        studio(out, STUDIO_VIEWS, "studio")
    counts = {k: triangles(o) for k, o in parts.items()}
    model = join_all(parts, rig, "character-hr")
    lod0 = triangles(model)
    export(model, rig, os.path.join(out, "character-hr.glb"))
    # LOD1: one hair-card layer fewer is not separable after join; decimate everything ~35 %.
    bpy.ops.object.select_all(action="DESELECT")
    lod = model.copy()
    lod.data = model.data.copy()
    lod.name = "character-hr-lod1"
    bpy.context.collection.objects.link(lod)
    dec = lod.modifiers.new("lod1", "DECIMATE")
    dec.ratio = 0.35
    select_only(lod)
    bpy.ops.object.modifier_move_to_index(modifier="lod1", index=0)
    bpy.ops.object.modifier_apply(modifier="lod1")
    lod1 = triangles(lod)
    model.hide_set(True)
    bpy.data.objects.remove(model, do_unlink=True)
    export(lod, rig, os.path.join(out, "character-hr-lod1.glb"))
    manifest = {"lod0Triangles": lod0, "lod1Triangles": lod1, "parts": counts, "bones": [b.name for b in rig.data.bones],
                "height": HEIGHT, "materials": sorted(set(MATERIALS.values()) | {"rubber"})}
    with open(os.path.join(out, "manifest.json"), "w") as stream:
        json.dump(manifest, stream, indent=2)
    print("HRCHAR " + json.dumps(manifest), flush=True)
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(out, "hr-char.blend"))


if __name__ == "__main__":
    main(sys.argv[sys.argv.index("--") + 1:])
