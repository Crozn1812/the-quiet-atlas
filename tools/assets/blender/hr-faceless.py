"""HR-FACELESS: the HR character with a blank, featureless face and a sharp curtain haircut (Duy, 2026-11-18).

blender -b --factory-startup -t 4 -P tools/assets/blender/hr-faceless.py -- <CC0-src> tmp/hr-char [probe|head|all]

Builds on hr-char-b.py (same CC0 MakeHuman body, rig, clothes, textures). Differences:
- no eyes, cornea, brows, lashes or glasses; eye and mouth openings are closed and the face is relaxed
  into one smooth surface (forehead, cheeks, jaw and chin keep their volume);
- the face area of the skin albedo is evened out (no lip or brow tint);
- the MakeHuman short hair is replaced by a procedural curtain haircut built from strand-textured cards.
New procedural surfaces are dedicated to CC0-1.0. No downloads, add-ons or external code.
"""
import importlib.util
import json
import math
import os
import random
import sys

import bpy
import bmesh
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
# hr-char-b reuses a cached skin AO bake when one exists; the faceless head needs a fresh one.
_out = os.path.abspath(sys.argv[sys.argv.index("--") + 2]) if "--" in sys.argv else ""
if _out and os.path.exists(os.path.join(_out, "skin_orm.png")) and "all" == (sys.argv[sys.argv.index("--") + 3:] or ["all"])[0]:
    os.remove(os.path.join(_out, "skin_orm.png"))
_spec = importlib.util.spec_from_file_location("hr_char_b", os.path.join(HERE, "hr-char-b.py"))
hrb = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(hrb)
hr = hrb.hr

FACE_PARTS = ("eyes", "brows", "lashes")


def head_frame(body):
    """Head centre, radii and the hairline height, measured on the reposed body."""
    vs = [v.co for v in body.data.vertices]
    top = max(v.z for v in vs)
    head = [v for v in vs if v.z > top - .26]
    cx = sum(v.x for v in head) / len(head)
    skull = [v for v in head if v.z > top - .12]
    cy = (min(v.y for v in skull) + max(v.y for v in skull)) / 2
    return {"top": top, "cx": cx, "cy": cy,
            "front": min(v.y for v in head), "back": max(v.y for v in head),
            "half_width": max(abs(v.x - cx) for v in skull)}


def probe(parts, out):
    body = parts["body"]
    f = head_frame(body)
    eyes = parts["eyes"].data.vertices
    eye_z = sum(v.co.z for v in eyes) / len(eyes)
    bm = bmesh.new()
    bm.from_mesh(body.data)
    loops = []
    seen = set()
    for e in bm.edges:
        if e.is_boundary and e.index not in seen and all(v.co.z > f["top"] - .30 for v in e.verts):
            ring, stack = [], [e]
            while stack:
                cur = stack.pop()
                if cur.index in seen:
                    continue
                seen.add(cur.index)
                ring.append(cur)
                for v in cur.verts:
                    stack.extend(x for x in v.link_edges if x.is_boundary and x.index not in seen)
            pts = [v.co for x in ring for v in x.verts]
            c = sum(pts, Vector()) / len(pts)
            loops.append({"edges": len(ring), "centre": [round(c.x, 3), round(c.y, 3), round(c.z, 3)]})
    bm.free()
    report = {"frame": {k: round(v, 4) for k, v in f.items()}, "eye_z": round(eye_z, 4), "head_loops": loops,
              "hair_z": [round(min(v.co.z for v in parts["hair"].data.vertices), 3),
                         round(max(v.co.z for v in parts["hair"].data.vertices), 3)]}
    print("FACEPROBE " + json.dumps(report), flush=True)
    return report


def smoothstep(e0, e1, x):
    t = max(0.0, min(1.0, (x - e0) / (e1 - e0)))
    return t * t * (3 - 2 * t)


def face_weight(co, f):
    """1 in the middle of the face, 0 at the hairline, ears, under the jaw and on the neck."""
    if co.y > f["cy"] - .005:
        return 0.0
    cz = f["eye_z"] - .03
    rz = .095 if co.z > cz else .088
    d = math.sqrt(((co.x - f["cx"]) / .068) ** 2 + ((co.z - cz) / rz) ** 2)
    return 1 - smoothstep(.45, 1.0, d)


def face_basis(x, z, f):
    """Symmetric polynomial basis of the face height field y = g(x, z) (even powers of x)."""
    X = (np.asarray(x) - f["cx"]) / .07
    Z = (np.asarray(z) - (f["eye_z"] - .03)) / .08
    return np.stack([X ** (2 * i) * Z ** j for i in range(4) for j in range(7 - 2 * i)], axis=-1)


def mask_relief(x, z, f, nose_keep):
    """A very soft trace of the nose bridge, like light catching a stocking mask."""
    return nose_keep * np.exp(-((x - f["cx"]) / .012) ** 2 - ((z - (f["eye_z"] - .035)) / .03) ** 2)


def blank_face(body, f, nose_keep=.003, iterations=200):
    """Close eyes, nostrils and mouth, then replace the face by one smooth surface fitted to its surroundings."""
    mesh = body.data
    bvh = BVHTree.FromPolygons([v.co for v in mesh.vertices], [p.vertices[:] for p in mesh.polygons])
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bm.faces.ensure_lookup_table()
    cavity = []
    for face in bm.faces:
        c = face.calc_center_median()
        if face_weight(c, f) <= .05:
            continue
        n = face.normal
        hit = bvh.ray_cast(c + n * .0004, n, .05)[0]
        if hit is not None or n.y > .35:
            cavity.append(face)
    bmesh.ops.delete(bm, geom=cavity, context="FACES")
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context="VERTS")
    # Keep only the outer shell: drop islands that the cut left floating inside the head.
    bm.verts.ensure_lookup_table()
    islands, seen = [], set()
    for v in bm.verts:
        if v.index in seen:
            continue
        stack, island = [v], []
        while stack:
            x = stack.pop()
            if x.index in seen:
                continue
            seen.add(x.index)
            island.append(x)
            stack.extend(e.other_vert(x) for e in x.link_edges)
        islands.append(island)
    islands.sort(key=len, reverse=True)
    stray = [v for island in islands[1:] for v in island
             if face_weight(v.co, f) > 0 and len(island) < 400]
    bmesh.ops.delete(bm, geom=stray, context="VERTS")
    # Fill the openings in the face (eyes, nostrils, mouth) and densify the fills.
    # Zip the lip line and lid slits first (their edges nearly touch), then fill what stays open.
    def open_edges():
        return [e for e in bm.edges if (e.is_boundary or not e.is_manifold)
                and all(face_weight(v.co, f) > .05 for v in e.verts)]
    filled = []
    for dist in (.0018, .003, .0045):
        rim = list({v for e in open_edges() for v in e.verts})
        if not rim:
            break
        bmesh.ops.remove_doubles(bm, verts=rim, dist=dist)
        bmesh.ops.dissolve_degenerate(bm, edges=list(bm.edges), dist=1e-6)
        filled += bmesh.ops.holes_fill(bm, edges=[e for e in open_edges() if e.is_boundary], sides=0)["faces"]
    filled = [x for x in filled if x.is_valid]
    print(f"BLANKFACE open edges left in the face: {len(open_edges())}", flush=True)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    # The closed openings sample plain cheek skin, never the lip or lid texels around them.
    uv = bm.loops.layers.uv.active
    cheek_at = Vector((f["cx"] + .035, f["front"] + .03, f["eye_z"] - .035))
    filled_set = set(filled)
    cheek = min((l for x in bm.faces if x not in filled_set for l in x.loops),
                key=lambda l: (l.vert.co - cheek_at).length)[uv].uv.copy()
    for face in filled:
        for loop in face.loops:
            loop[uv].uv = cheek
    tri = bmesh.ops.triangulate(bm, faces=filled)["faces"]
    fill_edges = list({e for t in tri for e in t.edges if not e.is_boundary})
    bmesh.ops.subdivide_edges(bm, edges=fill_edges, cuts=2, use_grid_fill=True)
    bmesh.ops.beautify_fill(bm, faces=[x for x in bm.faces if face_weight(x.calc_center_median(), f) > .3],
                            edges=[e for e in bm.edges if face_weight((e.verts[0].co + e.verts[1].co) / 2, f) > .3])
    bm.verts.ensure_lookup_table()
    # Smooth symmetric height field fitted to the ring around the face (forehead, temples, cheeks, jaw):
    # features vanish, the face keeps its oval volume.
    weights = np.array([face_weight(v.co, f) for v in bm.verts])
    co = np.array([v.co[:] for v in bm.verts])
    normals = np.array([v.normal[:] for v in bm.verts])
    # Fit to every front-facing vertex of the face, robustly: nose and lips (outward) and the closed
    # openings (inward) are outliers of a smooth oval, so they get down-weighted (Tukey IRLS).
    sample = (weights > 0) & (normals[:, 1] < -.2)
    A = face_basis(co[sample, 0], co[sample, 2], f)
    y = co[sample, 1]
    w_fit = weights[sample] + .2
    for _ in range(8):
        coef, *_ = np.linalg.lstsq(A * w_fit[:, None], y * w_fit, rcond=None)
        r = (y - A @ coef) / .008
        w_fit = (weights[sample] + .2) * np.where(np.abs(r) < 1, (1 - r ** 2) ** 2, 0) + 1e-3
    ring = sample

    def surface(p):
        return face_basis(p[:, 0], p[:, 2], f) @ coef - mask_relief(p[:, 0], p[:, 2], f, nose_keep)
    co[:, 1] += weights * (surface(co) - co[:, 1])
    # Relax the triangles of the closed openings on that surface so the shading is even.
    edge_list = np.array([[e.verts[0].index, e.verts[1].index] for e in bm.edges])
    deg = np.maximum(np.bincount(edge_list.ravel(), minlength=len(co)), 1).astype(float)
    inner = (weights > .35)[:, None]
    for _ in range(iterations):
        acc = np.zeros_like(co)
        np.add.at(acc, edge_list[:, 0], co[edge_list[:, 1]])
        np.add.at(acc, edge_list[:, 1], co[edge_list[:, 0]])
        moved = co + .5 * (acc / deg[:, None] - co)
        moved[:, 1] = surface(moved)
        co = np.where(inner, moved, co)
    print(f"BLANKFACE fit on {int(ring.sum())} ring vertices", flush=True)
    for v, p in zip(bm.verts, co):
        v.co = p
    bm.normal_update()
    bm.to_mesh(mesh)
    bm.free()
    mesh.update()
    print(f"BLANKFACE removed {len(cavity)} cavity faces, filled {len(filled)} openings", flush=True)



# =============================================================== curtain haircut

PART_X = -.011  # parting a little to the character's right (viewer's left), as in the reference


def azimuth(p, f):
    """0 at the front of the head, +pi/2 on the character's left (+X), +-pi at the back."""
    return math.atan2(p.x - f["cx"], -(p.y - f["cy"]))


def interp(table, x):
    xs, ys = zip(*table)
    return float(np.interp(abs(x), xs, ys))


# Height of the natural hairline on the scalp, and of the cut (where tips end), by azimuth.
HAIRLINE = ((0, 1.668), (.45, 1.660), (.8, 1.638), (1.2, 1.628), (1.45, 1.632), (1.75, 1.600), (2.3, 1.555),
            (math.pi, 1.535))
CUT = ((0, 1.658), (.2, 1.642), (.4, 1.616), (.6, 1.601), (.9, 1.592), (1.2, 1.585), (1.5, 1.578), (1.9, 1.560),
       (2.4, 1.528), (math.pi, 1.505))


def is_ear(p, n, f):
    return abs(p.x - f["cx"]) > .068 and 1.55 < p.z < 1.65 and -.075 < p.y < .005 and abs(n.x) > .2


def scalp_layer(body, f, lift=.0012):
    """Dark scalp under the strands: the body's own scalp faces, lifted 1 mm."""
    mesh = body.data
    verts, faces, remap = [], [], {}
    for poly in mesh.polygons:
        c = poly.center
        if c.z < interp(HAIRLINE, azimuth(c, f)) - .006 or is_ear(c, poly.normal, f):
            continue
        ids = []
        for i in poly.vertices:
            if i not in remap:
                v = mesh.vertices[i]
                remap[i] = len(verts)
                verts.append(v.co + v.normal * lift)
            ids.append(remap[i])
        faces.append(ids)
    obj = hr.make_mesh_object("hair", verts, faces)
    uv = obj.data.uv_layers.new(name="UVMap")
    for loop in obj.data.loops:
        p = obj.data.vertices[loop.vertex_index].co
        uv.data[loop.index].uv = ((p.x + .12) / .24, (p.y + .2) / .3)  # top-down: the parting is a line in V
    return obj


def curtain_groom(body, f, count=14000, flyaways=180, segments=16):
    """Strand-textured cards grown from the scalp: centre-left part, curtain fringe, full rounded volume."""
    mesh = body.data
    bvh = BVHTree.FromPolygons([v.co for v in mesh.vertices], [p.vertices[:] for p in mesh.polygons])
    scalp = [p for p in mesh.polygons
             if p.center.z > interp(HAIRLINE, azimuth(p.center, f)) and not is_ear(p.center, p.normal, f)]
    areas = [p.area for p in scalp]
    rng = random.Random(hr.SEED + 18)
    centre = Vector((f["cx"], f["cy"], 1.615))
    down = Vector((0, 0, -1))
    verts, faces, uvs, normals = [], [], [], []

    def volume(z, layer):
        # Hair stands off the skull: most on the crown and upper sides, little at the nape.
        k = max(0.0, min(1.0, (z - 1.56) / .13))
        return .003 + layer * (.006 + .026 * k)

    def comb(p, n, side, frontness, split=1.0):
        # The part runs from the front hairline to the crown only; behind it everything falls back and down.
        back = max(1 - split, min(1.0, max(0.0, (p.y - f["cy"] + .015) / .06)))
        lateral = side * (.85 - .3 * frontness) * (1 - .85 * back) * (.25 + .75 * split)
        # The curtains sweep out and then back towards the ears, not straight down like a bowl.
        sweep_back = .55 * max(0.0, min(1.0, abs(p.x - f["cx"]) / .06)) * (1 - back)
        c = Vector((lateral, -.2 * frontness + sweep_back, 0)) + Vector((0, .5, -.35)) * back + Vector((0, 0, -.45 - .3 * back))
        c -= n * c.dot(n)
        return c.normalized() if c.length > 1e-6 else down

    def strand(root, rn, length, width, layer, u0, lift_tip=0.0):
        side = 1.0 if root.x > PART_X + rng.uniform(-.003, .003) else -1.0
        frontness = max(0.0, min(1.0, (f["cy"] - .015 - root.y) / .075))
        split = max(0.0, min(1.0, (f["cy"] + .005 - root.y) / .03))
        # Messy, textured groom (reference): each strand wanders, clumps disagree with their neighbours.
        twist = rng.uniform(-.45, .45)
        wander = rng.uniform(.6, 1.6)
        p = root + rn * .001
        near_part = max(0.0, 1 - abs(root.x - PART_X) / .04)
        # Roots by the part leave sideways at once: a clean parting line, no strands standing up edge-on.
        # Strands leave the scalp at a low angle and lie down at once; the volume offset gives the loft.
        # (Steep roots stood up at the crown whorl and caught the sun as grey tufts.)
        d = (rn * .35 + comb(root, rn, side, frontness, split) * (1.0 + .5 * frontness + .3 * near_part)).normalized()
        jitter = rng.uniform(-.005, .005) * (1 + 1.5 * max(0.0, min(1.0, (root.y - f["cy"]) / .06)))
        seg = length / segments
        path = [p.copy()]
        for k in range(1, segments + 1):
            q, qn, _, _ = bvh.find_nearest(p)
            qn = qn.normalized()
            c = comb(p, qn, side, frontness, split)
            c = (c + qn.cross(c) * twist * (1 + wander * math.sin(k * .9 + twist * 7))).normalized()
            g = (.25 + .55 * k / segments) * (1 - .45 * frontness)
            d = (d * .62 + c * .38 + down * g * .3).normalized()
            p = p + d * seg
            q, qn, _, _ = bvh.find_nearest(p)
            qn = qn.normalized()
            need = volume(p.z, layer) + lift_tip * k / segments
            if (p - q).dot(qn) < need:
                p = q + qn * need
            path.append(p.copy())
            if p.z < interp(CUT, azimuth(p, f)) + jitter:
                break
        if len(path) < 4:
            return
        m = len(path) - 1
        # Crown strands get a second card tilted 60 degrees about the strand: the top silhouette
        # stays full when the camera looks along the scalp (single cards turn edge-on there).
        tilts = (0.0, math.radians(60)) if root.z > 1.675 else (0.0,)
        # Clumps do not share one smooth normal: each card leans its shading normal its own way,
        # so light breaks up across the groom (messy, textured) instead of one sleek helmet sheen.
        lean = rng.uniform(-.55, .55)
        for tilt in tilts:
            base = len(verts)
            for i, p in enumerate(path):
                t = i / m
                tangent = path[min(m, i + 1)] - path[max(0, i - 1)]
                radial = (p - centre).normalized()
                across = tangent.cross(radial)
                if across.length < 1e-6:
                    across = Vector((1, 0, 0))
                across.normalize()
                if tilt:
                    across = (across * math.cos(tilt) + radial * math.sin(tilt)).normalized()
                w = width * (1 - .55 * t)
                for e in (-.5, .5):
                    verts.append(p + across * w * e)
                    uvs.append((u0 + (e + .5) * .25, t))
                    card_normal = across.cross(tangent.normalized()) if tangent.length > 1e-6 else radial
                    if card_normal.dot(radial) < 0:
                        card_normal = -card_normal
                    normals.append((radial + card_normal * lean + across * lean * .5).normalized())
            for i in range(m):
                a = base + 2 * i
                faces.append((a, a + 1, a + 3, a + 2))

    def sample_root():
        poly = scalp[rng.choices(range(len(scalp)), weights=areas)[0]]
        corners = [mesh.vertices[i].co for i in poly.vertices]
        wts = [rng.random() + .05 for _ in corners]
        p = sum((v * w for v, w in zip(corners, wts)), Vector()) / sum(wts)
        q, qn, _, _ = bvh.find_nearest(p)
        return q, qn.normalized()

    for _ in range(count):
        root, rn = sample_root()
        if abs(root.x - PART_X) < .0015 and root.y < f["cy"] - .01:
            continue
        layer = rng.random() ** .8
        phi = abs(azimuth(root, f))
        length = (interp(((0, .12), (.6, .12), (1.2, .115), (1.8, .10), (math.pi, .09)), phi)
                  * (1 + .55 * max(0.0, (root.z - 1.66) / .06)) * rng.uniform(.85, 1.12))
        strand(root, rn, length, rng.uniform(.0032, .006), layer, .25 * rng.randrange(4))
    for _ in range(flyaways):
        root, rn = sample_root()
        strand(root, rn, rng.uniform(.04, .09), rng.uniform(.0008, .0014), 1.0, .25 * rng.randrange(4),
               lift_tip=rng.uniform(.0005, .002))
    obj = hr.make_mesh_object("hair_cards", verts, faces)
    uv = obj.data.uv_layers.new(name="UVMap")
    for loop in obj.data.loops:
        uv.data[loop.index].uv = uvs[loop.vertex_index]
    obj.data.normals_split_custom_set_from_vertices(normals)
    print(f"CURTAIN {len(faces)} card quads from {count}+{flyaways} strands", flush=True)
    return obj


def hair_textures(out, tex, f=None):
    """Sharp strand cards: packed fibres (dark gaps, not holes, so mipmaps keep coverage), staggered tips."""
    rng = np.random.default_rng(hr.SEED + 19)
    h = w = 2048
    v = np.linspace(0, 1, h, dtype=np.float32)[:, None]
    u = np.linspace(0, 1, w, dtype=np.float32)[None, :]
    slot = np.floor(np.minimum(u * 4, 3.999))
    local = u * 4 - slot
    fibres = 30
    x = local * fibres + .35 * np.sin(v * 7 + slot * 2.1) + .15 * np.sin(v * 23 + u * 40)
    index = np.floor(x)
    within = x - index
    profile = np.clip(1 - np.abs(within - .5) / .5, 0, 1) ** .7
    key = (index * 7.13 + slot * 3.7) % 1.0
    # The four card variants differ in tone too: neighbouring clumps read as separate locks.
    shade = (.38 + .45 * ((index * 0.618 + slot * .31) % 1.0)) * (.7 + .2 * slot)
    ends = .78 + .21 * ((index * 4.33 + slot * 1.9) % 1.0)
    tip = np.clip((ends - v) / .05, 0, 1)
    taper = np.clip(1 - np.abs(within - .5) * 2 / np.maximum(tip, .05), 0, 1)
    edge = np.clip(np.minimum(local, 1 - local) / .06, 0, 1)
    root = np.clip(v / .04, 0, 1)
    alpha = np.where(v < ends, np.clip(edge * root * (.85 + .15 * profile), 0, 1), 0)
    alpha = alpha * np.clip(taper * 3, 0, 1)
    alpha = np.clip((alpha - .3) / .4, 0, 1)
    glint = np.exp(-((v - (.32 + .25 * key)) / .035) ** 2)
    # Near-black, but each fibre lighter than the gaps between fibres so strands read at game distance.
    colour = np.array(hr.HAIR, np.float32) * 3.2 * (shade * (.22 + 1.05 * profile) + .9 * glint * profile)[..., None]
    hair = np.ones((h, w, 4), np.float32)
    hair[..., :3] = hr.srgb(colour)
    hair[..., 3] = alpha
    tex["hair_card"] = hr.save_np(hair, os.path.join(out, "hair_card.png"))
    height = (profile * .8 + .2 * np.sin(v * 900 + index * 3) * profile).astype(np.float32)
    tex["hair_card_normal"] = hr.save_np(hr.height_to_normal(height, 1.2),
                                         os.path.join(out, "hair_card_normal.png"), "Non-Color")
    cap = np.ones((512, 512, 4), np.float32)
    grain = hr.blur(rng.random((512, 512)).astype(np.float32), 1)
    # Under the strands the scalp reads as hair (no bald patches at the crown whorl); only the parting,
    # from the front hairline back to the crown, shows a thin line of skin.
    cy = f["cy"] if f else -.043
    cu, cv = np.mgrid[0:512, 0:512].astype(np.float32)[::-1] / 511
    u_part = (PART_X + .12) / .24
    strip = np.clip(1 - np.abs(cu - u_part) / .010, 0, 1) * np.clip(((cy - .005 + .2) / .3 - cv) / .04, 0, 1)
    hair_tone = hr.srgb(np.array(hr.HAIR, np.float32) * 2.4)
    skin_tone = np.array((.30, .22, .18), np.float32)
    cap[..., :3] = (hair_tone * (1 - strip[..., None]) + skin_tone * strip[..., None]) * (.85 + .3 * grain)[..., None]
    tex["hair_cap"] = hr.save_np(cap, os.path.join(out, "hair_cap.png"))
    flat = np.dstack([np.full((512, 512), .5), np.full((512, 512), .5), np.ones((512, 512))]).astype(np.float32)
    tex["hair_normal"] = hr.save_np(flat, os.path.join(out, "hair_normal.png"), "Non-Color")
    return tex


def even_face_skin(body, f, out, tex):
    """Even out the face area of the skin maps: no lip or brow tint, no wrinkle normals, only skin."""
    mesh = body.data
    size = 2048
    mask = np.zeros((size, size), np.float32)
    uv = mesh.uv_layers.active.data
    weight = [face_weight(v.co, f) for v in mesh.vertices]
    for poly in mesh.polygons:
        ws = [weight[i] for i in poly.vertices]
        if max(ws) <= 0:
            continue
        pts = [tuple(uv[li].uv) for li in poly.loop_indices]
        for k in range(1, len(pts) - 1):
            tri = np.array([pts[0], pts[k], pts[k + 1]], np.float32) * size
            tw = np.array([ws[0], ws[k], ws[k + 1]], np.float32)
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
            l3 = 1 - l1 - l2
            inside = (l1 >= -0.02) & (l2 >= -0.02) & (l3 >= -0.02)
            value = np.where(inside, l1 * tw[0] + l2 * tw[1] + l3 * tw[2], 0)
            mask[y0:y1 + 1, x0:x1 + 1] = np.maximum(mask[y0:y1 + 1, x0:x1 + 1], value)
    mask = np.clip(hr.blur(np.clip(hr.blur(mask, 6) * 3, 0, 1), 3), 0, 1)
    albedo = hr.load_np(os.path.join(out, "skin_albedo.png"), size)[..., :3]
    core = albedo[mask > .8]
    luminance = core.mean(axis=1)
    keep = (luminance > np.percentile(luminance, 30)) & (luminance < np.percentile(luminance, 85))
    tone = np.median(core[keep], axis=0)
    rng = np.random.default_rng(hr.SEED + 20)
    mottle = hr.noise((size, size), 40, rng)[..., None]
    even = np.clip(tone * (.97 + .06 * mottle), 0, 1)
    albedo = albedo * (1 - mask[..., None]) + even * mask[..., None]
    tex["skin_albedo"] = hr.save_np(albedo, os.path.join(out, "skin_albedo.png"))
    normal = hr.load_np(os.path.join(out, "skin_normal.png"), size)[..., :3]
    pores = hr.height_to_normal((hr.noise((size, size), 3, rng) * .25).astype(np.float32), .6)
    normal = normal * (1 - mask[..., None]) + pores * mask[..., None]
    tex["skin_normal"] = hr.save_np(normal, os.path.join(out, "skin_normal.png"), "Non-Color")
    print(f"EVENFACE tone {np.round(tone, 3).tolist()} over {int((mask > .5).sum())} texels", flush=True)
    return tex

def head_views(out, prefix, size=(700, 900)):
    hr.studio(out, (("face", (0.0, -0.75, 1.60), (0, -0.05, 1.58), 85),
                    ("side", (0.75, -0.05, 1.60), (0, -0.05, 1.58), 85),
                    ("three-quarter", (0.5, -0.56, 1.62), (0, -0.05, 1.58), 85),
                    ("back", (0.0, 0.75, 1.62), (0, -0.05, 1.58), 85)), prefix, size)


def build(src, out):
    """Every part of the faceless character, weighted and textured (no AO bake, no export)."""
    import character_rig as rigging
    parts, used, hidden, joints, bones, _ = hr.build_parts(src)
    hrb.repose(parts, joints, bones)
    hem = hrb.tailor(parts, bones)
    body = parts["body"]
    f = head_frame(body)
    f["eye_z"] = sum(v.co.z for v in parts["eyes"].data.vertices) / len(parts["eyes"].data.vertices)
    for name in FACE_PARTS + ("hair",):
        bpy.data.objects.remove(parts.pop(name), do_unlink=True)
    parts["tote"] = hr.build_tote(parts["shirt"])
    parts["socks"] = hr.split_socks(parts["shoes"])
    parts["laces"] = hr.build_laces(parts["shoes"])
    scale, floor = bones.pop("_scale")
    rig = rigging.make_armature(scale, floor)
    hr.final_weights(parts, rig)
    hr.hide_covered_body(body, used, hidden, bones, hem)
    blank_face(body, f)
    parts["hair"] = scalp_layer(body, f)
    parts["hair_cards"] = curtain_groom(body, f)
    for name in ("hair", "hair_cards"):
        hr.write_groups(parts[name], [{"head": 1.0}] * len(parts[name].data.vertices))
    tex = hrb.textures(src, out, None)
    tex = hair_textures(out, tex, f)
    tex = even_face_skin(body, f, out, tex)
    print("FRAME " + json.dumps({k: round(v, 4) for k, v in f.items()}), flush=True)
    return parts, rig, tex


def main(argv):
    src, out = map(os.path.abspath, argv[:2])
    stage = argv[2] if len(argv) > 2 else "all"
    os.makedirs(out, exist_ok=True)
    if stage == "hairtex":
        hair_textures(out, {})
        return
    if stage == "probe":
        parts, used, hidden, joints, bones, _ = hr.build_parts(src)
        hrb.repose(parts, joints, bones)
        hrb.tailor(parts, bones)
        probe(parts, out)
        return
    parts, rig, tex = build(src, out)
    if stage == "head":
        hr.assign(parts, hr.make_materials(tex, tex["cloth_orm"]))
        bpy.data.materials["hair_card"].node_tree.nodes["Principled BSDF"].inputs["Roughness"].default_value = .72
        head_views(out, "head")
        hr.studio(out, (("full", (0, -3.0, 1.0), (0, 0, .9), 45),), "head", (700, 1100))
        bpy.ops.wm.save_as_mainfile(filepath=os.path.join(out, "hr-faceless-head.blend"))
        return
    ao = hr.bake_skin_orm(parts["body"], out, parts)
    hr.assign(parts, hr.make_materials(tex, ao))
    head_views(out, "studio")
    counts = {name: hr.triangles(obj) for name, obj in parts.items()}
    lod_parts = {}
    for name, obj in parts.items():
        lod = obj.copy()
        lod.data = obj.data.copy()
        bpy.context.collection.objects.link(lod)
        lod_parts[name] = lod
        if name == "hair_cards":
            groups = hr.components(lod.data)
            remove = {i for k, indices in enumerate(groups) if k % 3 != 0 for i in indices}
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
    hrb.export(high, rig, os.path.join(out, "character-hr.glb"))
    high.hide_set(True)
    lod = hr.join_all(lod_parts, rig, "character-hr-lod1")
    hrb.export(lod, rig, os.path.join(out, "character-hr-lod1.glb"))
    manifest = {"lod0Triangles": hr.triangles(high), "lod1Triangles": hr.triangles(lod),
                "parts": counts, "height": hr.HEIGHT, "bones": [b.name for b in rig.data.bones]}
    with open(os.path.join(out, "manifest.json"), "w") as stream:
        json.dump(manifest, stream, indent=2)
    print("HRFACELESS " + json.dumps(manifest), flush=True)
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(out, "hr-faceless.blend"))


if __name__ == "__main__":
    main(sys.argv[sys.argv.index("--") + 1:])
