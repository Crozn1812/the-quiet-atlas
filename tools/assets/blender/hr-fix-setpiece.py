"""HR-FIX-SETPIECE step 2/3: original set-piece geometry for the zone hero objects.

  blender -b --python tools/assets/blender/hr-fix-setpiece.py -- [--preview] [group ...]

All geometry is authored here (CC0 by the project). Surfaces use the Poly Haven CC0 maps that
hr-fix-setpiece-prepare.mjs derived into tmp/hr-fix-setpiece/tex. No logos, lettering or brands.
Every helper takes three.js coordinates (x right, y up, z towards the viewer) so that the
numbers match the zone modules; `B()` converts to Blender's Z-up frame for the Y-up glTF export.
"""
import bpy, bmesh, math, sys, json, random
import numpy as np
from mathutils import Vector, Matrix, noise
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
WORK = ROOT / 'tmp/hr-fix-setpiece'
TEX = WORK / 'tex'
OUT = WORK / 'glb'
OUT.mkdir(parents=True, exist_ok=True)
ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
PREVIEW = '--preview' in ARGS
ONLY = [a for a in ARGS if not a.startswith('--')]
TAU = math.tau

bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
for block in (bpy.data.meshes, bpy.data.materials, bpy.data.images):
    for item in list(block): block.remove(item)

# ---------------------------------------------------------------- transforms (three.js semantics)
def B(x, y, z): return Vector((x, -z, y))
def T(x, y, z): return Matrix.Translation(B(x, y, z))
def RX(a): return Matrix.Rotation(a, 4, 'X')
def RY(a): return Matrix.Rotation(a, 4, 'Z')
def RZ(a): return Matrix.Rotation(-a, 4, 'Y')
def S(x, y=None, z=None):
    y = x if y is None else y; z = x if z is None else z
    return Matrix.Diagonal((x, z, y, 1))
AXIS = {'x': 0, 'y': 2, 'z': 1}

# ---------------------------------------------------------------- materials
IMAGES = {}
def image(name, color):
    if name not in IMAGES:
        im = bpy.data.images.load(str(TEX / f'{name}.png'))
        if not color: im.colorspace_settings.name = 'Non-Color'
        IMAGES[name] = im
    return IMAGES[name]

def material(name, color=None, normal=None, orm=None, tint=None, base=(1, 1, 1), rough=.6, metal=0.0,
             coat=0.0, coat_rough=.1, emissive=None, strength=1.0):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    bsdf = nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (*base, 1)
    bsdf.inputs['Roughness'].default_value = rough
    bsdf.inputs['Metallic'].default_value = metal
    bsdf.inputs['Coat Weight'].default_value = coat
    bsdf.inputs['Coat Roughness'].default_value = coat_rough
    if color:
        tex = nodes.new('ShaderNodeTexImage'); tex.image = image(color, True)
        if tint:
            mix = nodes.new('ShaderNodeMix'); mix.data_type = 'RGBA'; mix.blend_type = 'MULTIPLY'
            mix.inputs[0].default_value = 1
            links.new(tex.outputs['Color'], mix.inputs[6]); mix.inputs[7].default_value = (*tint, 1)
            links.new(mix.outputs[2], bsdf.inputs['Base Color'])
        else: links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
    if normal:
        tex = nodes.new('ShaderNodeTexImage'); tex.image = image(normal, False)
        bump = nodes.new('ShaderNodeNormalMap')
        links.new(tex.outputs['Color'], bump.inputs['Color']); links.new(bump.outputs['Normal'], bsdf.inputs['Normal'])
    if orm:
        tex = nodes.new('ShaderNodeTexImage'); tex.image = image(orm, False)
        split = nodes.new('ShaderNodeSeparateColor')
        links.new(tex.outputs['Color'], split.inputs['Color'])
        links.new(split.outputs['Green'], bsdf.inputs['Roughness']); links.new(split.outputs['Blue'], bsdf.inputs['Metallic'])
    if emissive:
        tex = nodes.new('ShaderNodeTexImage'); tex.image = image(emissive, True)
        links.new(tex.outputs['Color'], bsdf.inputs['Emission Color'])
        bsdf.inputs['Emission Strength'].default_value = strength
    return mat

# Flat surfaces share one material: a swatch atlas keeps each object at one or two draws.
SWATCHES = [  # name, sRGB colour, roughness, metalness
    ('ivory', (.90, .87, .78), .34, 0), ('ebony', (.03, .03, .033), .2, 0), ('brass', (.74, .56, .26), .36, 1),
    ('chrome', (.82, .83, .84), .14, 1), ('steel', (.33, .33, .34), .48, 1), ('lens', (.42, .58, .66), .05, 1),
    ('rubber', (.035, .035, .035), .82, 0), ('leather', (.2, .1, .06), .52, 0), ('felt', (.5, .07, .06), 1, 0),
    ('bronze', (.5, .36, .17), .5, 1), ('cavity', (.012, .011, .01), 1, 0), ('paper', (.9, .87, .78), .88, 0),
    ('gelcoat', (.9, .91, .9), .3, 0), ('vent', (.07, .075, .08), .7, 0), ('flag', (.66, .14, .1), .55, 0),
    ('ribbon', (.85, .51, .17), .85, 0), ('rosette', (.2, .11, .06), .4, 0), ('nickel', (.75, .74, .7), .25, 1),
    ('string', (.72, .55, .32), .3, 1), ('soot', (.03, .028, .026), .95, 0),
]
def swatch_images():
    size, cell = 64, 8
    color = np.ones((size, size, 4), np.float32); orm = np.ones((size, size, 4), np.float32)
    for i, (_, rgb, rough, metal) in enumerate(SWATCHES):
        row, col = divmod(i, 8)
        region = np.s_[size - (row + 1) * cell:size - row * cell, col * cell:(col + 1) * cell]
        color[region][:, :, :3] = rgb  # byte images store display-referred values; orm[region][:, :, :3] = (1, rough, metal)
    for name, pixels, is_color in (('swatch-color', color, True), ('swatch-orm', orm, False)):
        im = bpy.data.images.new(name, size, size, alpha=False)
        if not is_color: im.colorspace_settings.name = 'Non-Color'
        im.pixels.foreach_set(pixels.ravel()); im.filepath_raw = str(TEX / f'{name}.png'); im.file_format = 'PNG'; im.save()
swatch_images()

MAT = {
    'swatch': material('setpiece-swatch', 'swatch-color', orm='swatch-orm'),
    'timber': material('setpiece-weathered-timber', 'wood-weathered-color', 'wood-weathered-normal', 'wood-weathered-orm'),
    'charred': material('setpiece-charred-timber', 'wood-weathered-color', 'wood-weathered-normal', 'wood-weathered-orm', tint=(.3, .27, .25)),
    'lacquer': material('setpiece-lacquered-case', 'wood-dark-color', 'wood-dark-normal', rough=.34, coat=.85, coat_rough=.14),
    'spruce': material('setpiece-guitar-top', 'veneer-light-color', rough=.3, coat=.75, coat_rough=.1),
    'sapele': material('setpiece-guitar-back', 'veneer-red-color', rough=.32, coat=.75, coat_rough=.12),
    'enamel': material('setpiece-enamel-white', 'metal-paint-color', 'metal-paint-normal', 'metal-paint-orm', tint=(.86, .88, .85)),
    'viewer': material('setpiece-enamel-viewer', 'metal-paint-color', 'metal-paint-normal', 'metal-paint-orm', tint=(.27, .4, .43)),
    'iron': material('setpiece-forged-iron', 'iron-rust-color', 'iron-rust-normal', 'iron-rust-orm'),
    'rock': material('setpiece-scorched-stone', 'rock-dark-color', 'rock-dark-normal', rough=.93),
    'coal': material('setpiece-embers', 'coal-color', rough=.95, emissive='coal-emissive', strength=3),
    'print': material('setpiece-postcards', 'postcards-color', rough=.8),
}
TILE = {'timber': .9, 'charred': .9, 'lacquer': .8, 'spruce': .45, 'sapele': .5, 'enamel': 1.1, 'viewer': .8,
        'iron': .45, 'rock': .8, 'coal': .32}
GRAIN_U = {'spruce'}  # scans whose grain runs along U instead of V

# ---------------------------------------------------------------- mesh helpers
COUNTER = [0]
def obj(bm, name='part'):
    COUNTER[0] += 1
    me = bpy.data.meshes.new(f'{name}.{COUNTER[0]}')
    bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new(me.name, me)
    bpy.context.collection.objects.link(ob)
    return ob

def shade(ob, angle=38):
    me = ob.data
    me.polygons.foreach_set('use_smooth', [True] * len(me.polygons))
    me.set_sharp_from_angle(angle=math.radians(angle))
    return ob

def uv_layer(me):
    return me.uv_layers[0] if me.uv_layers else me.uv_layers.new(name='UVMap')

def swatch(ob, name):
    index = [s[0] for s in SWATCHES].index(name)
    row, col = divmod(index, 8)
    layer = uv_layer(ob.data)
    for loop in layer.data: loop.uv = ((col + .5) / 8, 1 - (row + .5) / 8)
    ob.data.materials.clear(); ob.data.materials.append(MAT['swatch'])
    return ob

def tex(ob, name, grain='auto', tile=None, seed=None):
    """Metre-scaled box projection; the wood grain (texture V) follows `grain`."""
    me, tile = ob.data, tile or TILE[name]
    layer = uv_layer(me)
    if grain == 'auto':
        lo = [min(v.co[i] for v in me.vertices) for i in range(3)]; hi = [max(v.co[i] for v in me.vertices) for i in range(3)]
        g = max(range(3), key=lambda i: hi[i] - lo[i])
    else: g = AXIS[grain]
    rng = random.Random(COUNTER[0] * 7919 + (seed or 0))
    ou, ov = rng.random(), rng.random()
    for poly in me.polygons:
        n = poly.normal
        ax = max(range(3), key=lambda i: abs(n[i]))
        u, v = [i for i in range(3) if i != ax]
        if u == g: u, v = v, u
        for li in poly.loop_indices:
            co = me.vertices[me.loops[li].vertex_index].co
            a, b = co[u] / tile + ou, co[v] / tile + ov
            layer.data[li].uv = (b, a) if name in GRAIN_U else (a, b)
    me.materials.clear(); me.materials.append(MAT[name])
    return ob

def tex_round(ob, name, tile=None, radius=None):
    """Cylindrical projection about three.js Y, for lathed parts (call before transforming)."""
    me, tile = ob.data, tile or TILE[name]
    layer = uv_layer(me)
    radius = radius or max(math.hypot(v.co.x, v.co.y) for v in me.vertices)
    for poly in me.polygons:
        c = poly.center
        flat = abs(poly.normal.z) > .92
        centre = math.atan2(c.y, c.x)
        for li in poly.loop_indices:
            co = me.vertices[me.loops[li].vertex_index].co
            if flat: layer.data[li].uv = (co.x / tile, co.y / tile); continue
            angle = math.atan2(co.y, co.x)
            while angle - centre > math.pi: angle -= TAU
            while angle - centre < -math.pi: angle += TAU
            layer.data[li].uv = (angle * radius / tile, co.z / tile)
    me.materials.clear(); me.materials.append(MAT[name])
    return ob

def box(w, h, d, bevel=.004, segs=2):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1)
    bmesh.ops.scale(bm, vec=(w, d, h), verts=bm.verts)
    b = min(bevel, min(w, h, d) * .45)
    if b > 0: bmesh.ops.bevel(bm, geom=bm.edges[:], offset=b, segments=segs, profile=.5, affect='EDGES')
    return shade(obj(bm, 'box'), 30)

def cyl(r_bottom, r_top, h, segs=24, bevel=0.0):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=segs, radius1=r_bottom, radius2=r_top, depth=h)
    if bevel > 0:
        rim = [e for e in bm.edges if abs(e.verts[0].co.z - e.verts[1].co.z) < 1e-6]
        bmesh.ops.bevel(bm, geom=rim, offset=bevel, segments=2, profile=.5, affect='EDGES')
    return shade(obj(bm, 'cyl'), 40)

def lathe(profile, segs=32, cap_start=False, cap_end=False):
    """Revolve (radius, y) pairs about three.js Y."""
    bm = bmesh.new(); rings = []
    for r, y in profile:
        if r < 1e-5: rings.append([bm.verts.new((0, 0, y))])
        else: rings.append([bm.verts.new((r * math.cos(j / segs * TAU), r * math.sin(j / segs * TAU), y)) for j in range(segs)])
    for a, b in zip(rings, rings[1:]):
        for j in range(segs):
            a0, a1, b0, b1 = a[j % len(a)], a[(j + 1) % len(a)], b[j % len(b)], b[(j + 1) % len(b)]
            verts = [a0, a1, b1, b0]
            unique = [v for i, v in enumerate(verts) if v not in verts[:i]]
            if len(unique) >= 3: bm.faces.new(unique)
    if cap_start and len(rings[0]) > 1: bm.faces.new(list(reversed(rings[0])))
    if cap_end and len(rings[-1]) > 1: bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    return shade(obj(bm, 'lathe'), 50)

def tube(points, radius, segs=6, closed=False, cap=True):
    """Swept circle along three.js points; radius may be a list."""
    pts = [B(*p) for p in points]; n = len(pts)
    radii = radius if isinstance(radius, (list, tuple)) else [radius] * n
    bm = bmesh.new(); rings = []
    normal = None
    for i, p in enumerate(pts):
        a, b = pts[(i - 1) % n] if (closed or i > 0) else p, pts[(i + 1) % n] if (closed or i < n - 1) else p
        tangent = (b - a).normalized()
        if normal is None:
            normal = tangent.orthogonal().normalized()
        else:
            normal = (normal - tangent * normal.dot(tangent)).normalized()
        binormal = tangent.cross(normal)
        rings.append([bm.verts.new(p + (normal * math.cos(j / segs * TAU) + binormal * math.sin(j / segs * TAU)) * radii[i]) for j in range(segs)])
    for i in range(n if closed else n - 1):
        a, b = rings[i], rings[(i + 1) % n]
        for j in range(segs): bm.faces.new([a[j], a[(j + 1) % segs], b[(j + 1) % segs], b[j]])
    if cap and not closed: bm.faces.new(list(reversed(rings[0]))); bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    return shade(obj(bm, 'tube'), 60)

def prism(outline, z0, z1, bevel=.004, segs=2):
    """Extrude an (x, y) outline along three.js Z, with softened arrises."""
    bm = bmesh.new()
    front = [bm.verts.new(B(x, y, z1)) for x, y in outline]; back = [bm.verts.new(B(x, y, z0)) for x, y in outline]
    n = len(outline)
    bm.faces.new(front); bm.faces.new(list(reversed(back)))
    for i in range(n): bm.faces.new([front[i], back[i], back[(i + 1) % n], front[(i + 1) % n]])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    if bevel > 0: bmesh.ops.bevel(bm, geom=bm.edges[:], offset=bevel, segments=segs, profile=.5, affect='EDGES', clamp_overlap=True)
    return shade(obj(bm, 'prism'), 32)

def ball(r, sx=1, sy=1, sz=1, level=2):
    bm = bmesh.new(); bmesh.ops.create_icosphere(bm, subdivisions=level, radius=r)
    bmesh.ops.scale(bm, vec=(sx, sz, sy), verts=bm.verts)
    return shade(obj(bm, 'ball'), 80)

def torus(major, minor, segs=28, sides=8):
    """Ring in the three.js XZ plane."""
    return lathe([(major + minor * math.cos(j / sides * TAU), minor * math.sin(j / sides * TAU)) for j in range(sides + 1)], segs)

def stone(w, h, d, seed, amount=.014, cuts=4, soften=.2):
    """Split field stone: rounded shoulders plus two octaves of displacement."""
    bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1)
    bmesh.ops.subdivide_edges(bm, edges=bm.edges[:], cuts=cuts, use_grid_fill=True)
    offset = Vector((seed * 3.17, seed * 1.31, seed * 5.71))
    for v in bm.verts:
        p = v.co.copy(); unit = p.normalized() * .62
        p = p.lerp(unit, soften * (p.length / .866) ** 2)
        p = Vector((p.x * w, p.y * d, p.z * h))
        n = noise.noise(p * 5 + offset) * amount + noise.noise(p * 17 + offset) * amount * .35
        v.co = p + p.normalized() * n
    return shade(obj(bm, 'stone'), 55)

def smooth_outline(points, steps=5):
    """Closed Catmull-Rom spline through (x, y) points."""
    out, n = [], len(points)
    for i in range(n):
        p0, p1, p2, p3 = (Vector(points[(i + k) % n]) for k in (-1, 0, 1, 2))
        for s in range(steps):
            t = s / steps
            out.append(tuple(.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t ** 3)))
    return out

def displace(ob, amount, scale, seed=0):
    off = Vector((seed * 1.7, seed * 2.9, seed * .7))
    for v in ob.data.vertices:
        v.co += v.normal * noise.noise(v.co * scale + off) * amount
    return ob

class Piece:
    def __init__(self, name): self.name, self.parts = name, []
    def add(self, ob, matrix=None):
        if matrix is not None: ob.data.transform(matrix)
        self.parts.append(ob); return ob
    def finish(self):
        groups = {}
        for ob in self.parts: groups.setdefault(ob.data.materials[0].name, []).append(ob)
        root = bpy.data.objects.new(self.name, None); bpy.context.collection.objects.link(root)
        self.objects = [root]
        for name, members in groups.items():
            bpy.ops.object.select_all(action='DESELECT')
            for ob in members: ob.select_set(True)
            bpy.context.view_layer.objects.active = members[0]
            if len(members) > 1: bpy.ops.object.join()
            joined = bpy.context.view_layer.objects.active
            joined.name = f'{self.name}-{name.replace("setpiece-", "")}'; joined.data.name = joined.name
            joined.parent = root; self.objects.append(joined)
        self.triangles = sum(sum(len(p.vertices) - 2 for p in ob.data.polygons) for ob in self.objects[1:])
        return self

def bolt(piece, at, direction='z', r=.012, mat='steel'):
    head = swatch(lathe([(r * .55, 0), (r, 0), (r, r * .25), (r * .7, r * .62), (0, r * .78)], 12), mat)
    turn = {'z': RX(math.pi / 2), 'x': RZ(-math.pi / 2), '-x': RZ(math.pi / 2), 'y': Matrix.Identity(4), '-z': RX(-math.pi / 2)}[direction]
    return piece.add(head, T(*at) @ turn)

# ---------------------------------------------------------------- A17 signposts and waymark posts
def build_signpost():
    p = Piece('signpost')
    # Same silhouette, origin and front plane (z = .10) as props/shapes.ts, so labels and picks stay put.
    post = [(-.13, -1.0), (.025, -1.0), (.058, -.2), (.09, .6), (-.055, .575), (-.094, -.2)]
    p.add(tex(prism(post, -.10, .05, .013, 3), 'timber', 'y'))
    board = [(-.60, .385), (-.2, .372), (.16, .362), (.168, .255), (.19, .25), (.585, .512), (.597, .53), (.585, .548),
             (.2, .79), (.18, .786), (.176, .682), (-.2, .688), (-.578, .692), (-.60, .652), (-.60, .551), (-.505, .538), (-.60, .527)]
    p.add(tex(prism(board, .012, .10, .009, 3), 'timber', 'x'))
    # A routed shadow line and two rusted coach bolts fix the board to the post.
    for y in (.392, .668): bolt(p, (.02, y, .10), 'z', .013, 'steel')
    for y in (.44, .63): p.add(swatch(box(.012, .012, .012, .002, 1), 'soot'), T(.03, y, -.1))
    return p.finish()

def build_waymark():
    p = Piece('waymark')
    # Unit-height hewn post (instances scale it); the cloth blaze keeps the old ribbon's place.
    outline = [(-.062, -.2), (.06, -.2), (.058, .5), (.05, .985), (.0, 1.0), (-.052, .98), (-.06, .5)]
    p.add(tex(prism(outline, -.058, .058, .014, 3), 'timber', 'y'))
    band = [(r, y) for r, y in [(.086, .822), (.092, .83), (.093, .87), (.086, .878)]]
    p.add(swatch(lathe(band, 4), 'ribbon'), RY(math.pi / 4))
    p.add(swatch(box(.05, .045, .03, .008, 2), 'ribbon'), T(.092, .85, 0))
    for sign, drop in ((1, .2), (-1, .15)):
        tail = prism([(0, 0), (.036, 0), (.03, -drop), (.018, -drop + .02), (.004, -drop)], -.002, .002, 0)
        p.add(swatch(tail, 'ribbon'), T(.1, .84, sign * .012) @ RY(sign * .5) @ RZ(.12 * sign))
    return p.finish()

# ---------------------------------------------------------------- A06 workshop fire
def build_brazier():
    p = Piece('brazier')  # origin: top of the old pedestal, i.e. the underside of the bowl
    rng = random.Random(606)
    y, course = -.045, 0
    while y > -1.85:
        h = .17 + rng.random() * .07
        split = (rng.random() - .5) * .14
        for side in (-1, 1):
            w = .29 + side * -split
            block = stone(w - .012, h - .012, .575 + rng.random() * .02, course * 13 + side + 7)
            centre = (-.29 + w / 2) if side < 0 else (.29 - w / 2)
            m = T(centre, y - h / 2, 0) if course % 2 == 0 else T(0, y - h / 2, centre) @ RY(math.pi / 2)
            p.add(tex(block, 'rock'), m)
        y -= h; course += 1
    p.add(tex(stone(.68, .075, .68, 91, .008, 5, .1), 'rock'), T(0, -.012, 0))
    bowl = [(0, .005), (.215, .005), (.236, .022), (.252, .062), (.284, .16), (.318, .262), (.334, .32), (.348, .338), (.352, .354),
            (.343, .366), (.327, .362), (.315, .345), (.3, .322), (0, .322)]
    p.add(tex_round(lathe(bowl, 40), 'iron'))
    p.add(tex_round(lathe([(.296, .196), (.31, .2), (.315, .214), (.31, .228), (.296, .232)], 40), 'iron'))
    for angle in (.5, .5 + TAU / 3, .5 + 2 * TAU / 3):
        foot = tex(box(.07, .05, .09, .012, 2), 'iron')
        p.add(foot, RY(angle) @ T(0, .012, .2))
    for sign in (-1, 1):
        p.add(tex(torus(.048, .009, 20, 6), 'iron'), T(sign * .362, .22, 0) @ RX(math.pi / 2) @ RZ(.25 * sign))
        p.add(tex(box(.03, .04, .05, .006, 1), 'iron'), T(sign * .335, .27, 0))
    heap = lathe([(0, .47), (.07, .465), (.15, .448), (.23, .41), (.292, .356), (.305, .33)], 28)
    displace(heap, .018, 14, 3)
    layer = uv_layer(heap.data)
    for poly in heap.data.polygons:
        for li in poly.loop_indices:
            co = heap.data.vertices[heap.data.loops[li].vertex_index].co
            layer.data[li].uv = (co.x / TILE['coal'], co.y / TILE['coal'])
    heap.data.materials.append(MAT['coal']); p.add(heap)
    for i in range(14):
        a, r = rng.random() * TAU, .05 + rng.random() * .2
        lump = stone(.05 + rng.random() * .05, .035 + rng.random() * .03, .05 + rng.random() * .05, 300 + i, .008, 2, .35)
        p.add(tex(lump, 'coal', tile=.2), T(math.cos(a) * r, .478 - r * r * 1.5, math.sin(a) * r) @ RY(a) @ RZ(rng.random() - .5))
    for angle, tilt in ((.35, .18), (-.45, .18), (1.9, -.22)):
        log = tex(stone(.44, .1, .11, 500 + int(angle * 10), .01, 4, .3), 'coal', 'x', .5)
        p.add(log, T(0, .335, 0) @ RY(angle) @ RZ(tilt))
    return p.finish()

def build_torch():
    p = Piece('torch')  # origin: centre of the old cup; pre-yaw frame of the old bracket arm
    p.add(tex(box(.44, .1, .1, .01, 2), 'charred', 'x'), T(-.0544, -.2, .107) @ RZ(-.55))
    for along in (-.14, .15):
        p.add(tex(box(.03, .112, .112, .004, 1), 'iron'), T(-.0544, -.2, .107) @ RZ(-.55) @ T(along, 0, 0))
    p.add(tex(tube([(0, -.11, 0), (0, -.17, .03), (.0, -.215, .09)], .014, 8), 'iron'))
    cup = [(0, -.132), (.05, -.132), (.074, -.124), (.088, -.09), (.108, 0), (.127, .1), (.136, .124), (.134, .136), (.124, .136),
           (.116, .112), (0, .105)]
    p.add(tex_round(lathe(cup, 28), 'iron'))
    p.add(tex_round(lathe([(.114, .04), (.123, .044), (.125, .056), (.119, .066), (.112, .066)], 28), 'iron'))
    ember = lathe([(0, .165), (.05, .158), (.095, .135), (.118, .11)], 16)
    displace(ember, .008, 30, 5)
    layer = uv_layer(ember.data)
    for loop, data in zip(ember.data.loops, layer.data):
        co = ember.data.vertices[loop.vertex_index].co; data.uv = (co.x / .2, co.y / .2)
    ember.data.materials.append(MAT['coal']); p.add(ember)
    return p.finish()

# ---------------------------------------------------------------- A14 horizon
def build_viewer():
    p = Piece('viewer')  # origin: ground at the viewer; it looks along +X
    column = [(0, .07), (.172, .07), (.172, .1), (.162, .116), (.108, .126), (.09, .16), (.074, .5), (.068, .88), (.074, .9),
              (.092, .925), (.092, .958), (0, .958)]
    p.add(tex_round(lathe(column, 32), 'viewer'))
    for ring_y in (.2, .86): p.add(tex_round(lathe([(.07, ring_y - .012), (.094, ring_y - .008), (.094, ring_y + .008), (.07, ring_y + .012)], 32), 'viewer'))
    for k in range(6): bolt(p, (.138 * math.cos(k * TAU / 6 + .3), .1, .138 * math.sin(k * TAU / 6 + .3)), 'y', .014, 'steel')
    # Cast yoke: a cross bar and two cheeks that carry the trunnions.
    p.add(tex(box(.1, .04, .6, .012, 2), 'viewer'), T(0, .975, 0))
    for sign in (-1, 1):
        cheek = prism([(-.05, 0), (.05, 0), (.04, .26), (.02, .31), (-.02, .31), (-.04, .26)], -.013, .013, .006, 2)
        p.add(tex(cheek, 'viewer'), T(0, .985, sign * .283))
        p.add(swatch(cyl(.03, .03, .05, 20, .004), 'steel'), T(0, 1.25, sign * .268) @ RX(math.pi / 2))
        p.add(swatch(cyl(.02, .02, .012, 6), 'steel'), T(0, 1.25, sign * .303) @ RX(math.pi / 2))
    barrel = [(0, -.27), (.05, -.27), (.078, -.255), (.097, -.22), (.107, -.16), (.11, .05), (.113, .2), (.126, .3), (.132, .385),
              (.132, .398), (.124, .4), (.119, .392), (.117, .35)]
    along = RZ(-math.pi / 2)  # lathe axis Y -> +X
    for sign in (-1, 1):
        m = T(.02, 1.25, sign * .135) @ along
        p.add(tex_round(lathe(barrel, 36), 'viewer'), m)
        p.add(tex_round(lathe([(.128, .285), (.137, .288), (.137, .302), (.128, .305)], 36), 'viewer'), m)
        p.add(swatch(lathe([(0, .358), (.06, .355), (.1, .349), (.118, .344)], 36), 'lens'), m)
        p.add(swatch(lathe([(.034, -.33), (.036, -.27), (.03, -.27)], 20), 'chrome'), m)
        p.add(swatch(lathe([(.03, -.33), (.046, -.335), (.052, -.36), (.047, -.388), (.037, -.388), (.034, -.36), (.0, -.352)], 24), 'rubber'), m)
        for k in range(8):
            a = k * TAU / 8
            bolt(p, (.02 + .392, 1.25 + .1245 * math.cos(a), sign * .135 + .1245 * math.sin(a)), 'x', .0055, 'steel')
    p.add(tex(box(.4, .16, .2, .04, 4), 'viewer'), T(.0, 1.25, 0))
    p.add(tex(box(.2, .05, .16, .02, 3), 'viewer'), T(.02, 1.335, 0))
    p.add(swatch(cyl(.034, .03, .045, 24, .005), 'steel'), T(-.02, 1.38, 0))
    p.add(swatch(cyl(.012, .012, .02, 8), 'steel'), T(-.02, 1.412, 0))
    # Blank cast instruction plate, without lettering.
    p.add(swatch(box(.004, .07, .11, .002, 1), 'bronze'), T(-.2, 1.25, 0))
    for sy in (-1, 1):
        for sz in (-1, 1): bolt(p, (-.202, 1.25 + sy * .027, sz * .047), '-x', .004, 'steel')
    return p.finish()

def airfoil(n, thickness, camber=.02):
    pts = []
    for lower in (0, 1):
        for i in range(n):
            x = .5 * (1 + math.cos(math.pi * i / n)) if not lower else .5 * (1 - math.cos(math.pi * i / n))
            yt = 5 * thickness * (.2969 * math.sqrt(x) - .126 * x - .3516 * x * x + .2843 * x ** 3 - .1036 * x ** 4)
            yc = camber * 4 * x * (1 - x)
            pts.append((x, yc + (-yt if lower else yt)))
    return pts

def blade():
    n, stations, radius = 12, 26, 2.11
    bm = bmesh.new(); rings = []
    for k in range(stations):
        s = .1 + (radius - .1) * (k / (stations - 1)) ** 1.08
        u = min(1, max(0, (s - .24) / .3)); u = u * u * (3 - 2 * u)
        span = (s - .54) / (radius - .54)
        chord = .24 * (1 - .74 * max(0, span) ** .9) if s >= .54 else .24
        tip = max(0, (s - (radius - .12)) / .12)
        chord *= math.sqrt(max(.02, 1 - tip * tip))
        thickness = .3 - .17 * max(0, span) ** .7
        twist = math.radians(19 - 17 * max(0, min(1, (s - .2) / (radius - .2))) ** .6)
        foil = airfoil(n, thickness); ring = []
        for i, (x, y) in enumerate(foil):
            phi = math.pi * (i % n) / n + (math.pi if i >= n else 0)
            cx, cy = .5 + .5 * math.cos(phi), .5 * math.sin(phi)
            a = ((x - .3) * chord) * u + ((cx - .5) * .1) * (1 - u)
            b = (y * chord) * u + (cy * .1) * (1 - u)
            ring.append(bm.verts.new(B(a * math.sin(twist) + b * math.cos(twist), s, a * math.cos(twist) - b * math.sin(twist) + s * s * .012)))
        rings.append(ring)
    m = 2 * n
    for a, b in zip(rings, rings[1:]):
        for j in range(m): bm.faces.new([a[j], a[(j + 1) % m], b[(j + 1) % m], b[j]])
    bm.faces.new(list(reversed(rings[0]))); bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    return shade(obj(bm, 'blade'), 50)

def build_turbine():
    p = Piece('turbine')  # origin: tower foot; hub height 7.2 on the tower axis, rotor 0.49 m upwind (+X)
    def r(y): return .165 - (.165 - .08) * (y / 7.05)
    tower = [(0, 0), (.29, 0), (.29, .04), (.2, .05), (r(.05) + .012, .07)] + [(r(y), y) for y in (.09, 1.2, 2.38)] \
        + [(r(2.4) + .014, 2.39), (r(2.4) + .014, 2.45), (r(2.46), 2.46), (r(4.72), 4.72), (r(4.74) + .012, 4.73), (r(4.74) + .012, 4.79), (r(4.8), 4.8),
           (r(7.0), 7.0), (.096, 7.01), (.096, 7.09), (0, 7.09)]
    p.add(tex_round(lathe(tower, 40), 'enamel', 1.6))
    for k in range(12): bolt(p, (.245 * math.cos(k * TAU / 12), .04, .245 * math.sin(k * TAU / 12)), 'y', .016, 'steel')
    door = tex(box(.03, .82, .2, .012, 3), 'enamel', 'y', 1.6)
    p.add(door, T(-r(.75) + .006, .78, 0))
    p.add(swatch(box(.012, .09, .02, .003, 1), 'steel'), T(-r(.75) - .012, .8, .06))
    nacelle = [(0, -.52), (.06, -.515), (.12, -.48), (.165, -.4), (.186, -.25), (.192, 0), (.186, .2), (.168, .33), (.152, .4), (0, .4)]
    p.add(swatch(lathe(nacelle, 36), 'gelcoat'), T(.06, 7.2, 0) @ S(1, 1, 1.12) @ RZ(-math.pi / 2))
    p.add(swatch(lathe([(.1, 7.05), (.125, 7.06), (.125, 7.1), (.1, 7.12)], 32), 'steel'))
    for sign in (-1, 1):
        for k in range(4): p.add(swatch(box(.05, .012, .006, .001, 1), 'vent'), T(-.3 + k * .0, 7.16 + k * .028, sign * .204))
    p.add(swatch(tube([(-.3, 7.36, 0), (-.3, 7.6, 0)], .008, 8), 'steel'))
    for k in range(3):
        a = k * TAU / 3
        p.add(swatch(tube([(-.3, 7.59, 0), (-.3 + .06 * math.cos(a), 7.59, .06 * math.sin(a))], .003, 5), 'steel'))
        p.add(swatch(ball(.014, level=1), 'vent'), T(-.3 + .06 * math.cos(a), 7.59, .06 * math.sin(a)))
    return p.finish()

def build_rotor():
    p = Piece('rotor')  # origin: hub centre; spins about X like the old rotor group
    spinner = [(0, -.06), (.14, -.06), (.152, 0), (.15, .06), (.132, .14), (.097, .22), (.05, .277), (0, .292)]
    p.add(swatch(lathe(spinner, 36), 'gelcoat'), RZ(-math.pi / 2))
    for k in range(3):
        spin = RX(k * TAU / 3)
        p.add(swatch(blade(), 'gelcoat'), spin)
        p.add(swatch(lathe([(.056, .09), (.062, .1), (.062, .13), (.054, .14)], 20), 'steel'), spin)
    return p.finish()

# ---------------------------------------------------------------- A15 quiet shore
def build_piano():
    p = Piece('piano')  # origin: floor under the cabinet centre; keyboard along X, player at +Z
    L = lambda ob, grain: tex(ob, 'lacquer', grain)
    for sign in (-1, 1):
        p.add(L(box(.042, 1.2, .325, .008, 3), 'y'), T(sign * .621, .62, -.035))
        p.add(L(box(.075, .1, .52, .014, 3), 'z'), T(sign * .6, .05, .1))
        arm = prism([(-.2, .7), (.36, .7), (.39, .715), (.398, .75), (.39, .79), (.36, .808), (-.2, .808)], -.03, .03, .008, 3)
        p.add(L(arm, 'x'), T(sign * .612, 0, 0) @ RY(-math.pi / 2))
        leg = [(.03, .1), (.036, .11), (.036, .14), (.027, .16), (.022, .36), (.028, .58), (.037, .62), (.037, .68), (.03, .7)]
        p.add(tex_round(lathe(leg, 20), 'lacquer'), T(sign * .6, 0, .315))
    p.add(L(box(1.2, 1.2, .02, .003, 1), 'x'), T(0, .62, -.186))
    p.add(L(box(1.2, .035, .3, .004, 1), 'x'), T(0, .115, -.03))
    for y, h in ((.4, .52), (1.035, .345)):
        p.add(L(box(1.2, h, .022, .004, 2), 'x'), T(0, y, .112))
        w, hh, t = 1.02, h - .12, .014
        for dx, dy, sw, sh in ((0, hh / 2, w, t), (0, -hh / 2, w, t), (w / 2, 0, t, hh), (-w / 2, 0, t, hh)):
            p.add(L(box(sw + t, sh + (t if sh > t else 0), .012, .005, 3), 'x' if sw > sh else 'y'), T(dx, y + dy, .126))
    p.add(L(box(1.2, .05, .31, .006, 2), 'x'), T(0, .7, .21))
    p.add(L(box(1.2, .05, .022, .007, 3), 'x'), T(0, .742, .377))
    p.add(L(box(1.2, .115, .02, .006, 3), 'x'), T(0, .838, .13) @ RX(-.13))
    p.add(swatch(box(1.19, .006, .012, 0), 'felt'), T(0, .7795, .141))
    # 52 naturals and 36 sharps, each a separate key with its own gap.
    pitch = 1.196 / 52
    for i in range(52):
        x = -1.196 / 2 + pitch * (i + .5)
        p.add(swatch(box(pitch - .0009, .022, .232, .0012, 1), 'ivory'), T(x, .764, .25))
        if i < 51 and (i + 5) % 7 in (0, 1, 3, 4, 5):
            key = prism([(-.0064, 0), (.0064, 0), (.0052, .0125), (-.0052, .0125)], 0, .148, .0012, 1)
            p.add(swatch(key, 'ebony'), T(x + pitch / 2, .7745, .136))
    # Music desk, open lid on a brass hinge, and the pin block that the lid reveals.
    p.add(L(box(.66, .21, .012, .004, 2), 'x'), T(0, 1.0, .142) @ RX(-.2))
    p.add(L(box(.66, .014, .04, .005, 2), 'x'), T(0, .892, .152))
    p.add(L(box(1.31, .028, .37, .011, 4), 'x'), T(0, 1.236, -.21) @ RX(-.55) @ T(0, 0, .185))
    p.add(swatch(cyl(.0065, .0065, 1.18, 10), 'brass'), T(0, 1.24, -.206) @ RZ(math.pi / 2))
    p.add(swatch(tube([(.47, 1.222, .06), (.47, 1.376, .02)], .006, 8), 'brass'))
    p.add(swatch(box(1.2, .01, .3, 0), 'cavity'), T(0, 1.198, -.03))
    p.add(swatch(box(1.17, .014, .13, .002, 1), 'bronze'), T(0, 1.208, -.1))
    for row in range(2):
        for k in range(44):
            p.add(swatch(cyl(.0028, .0028, .014, 6), 'nickel'), T(-.56 + k * .026 + row * .013, 1.221, -.07 - row * .05))
    p.add(swatch(box(1.17, .02, .022, .004, 1), 'felt'), T(0, 1.205, .06))
    for k in (-1, 0, 1):
        pedal = prism([(-.011, 0), (.011, 0), (.014, .09), (-.014, .09)], -.005, .005, .003, 2)
        p.add(swatch(pedal, 'brass'), T(k * .075, .05, .13) @ RX(math.pi / 2 - .12))
    p.add(swatch(box(.3, .05, .012, .003, 1), 'brass'), T(0, .06, .125))
    return p.finish()

def build_stool():
    p = Piece('stool')  # origin: floor under the stool; the long side runs along Z like the old seat
    for sx in (-1, 1):
        for sz in (-1, 1):
            leg = tex_round(lathe([(.016, 0), (.019, .02), (.016, .04), (.024, .3), (.027, .355)], 12), 'lacquer')
            p.add(leg, T(sx * .12, 0, sz * .19))
        p.add(tex(box(.022, .05, .36, .004, 2), 'lacquer', 'z'), T(sx * .12, .345, 0))
    for sz in (-1, 1): p.add(tex(box(.24, .05, .022, .004, 2), 'lacquer', 'x'), T(0, .345, sz * .19))
    p.add(tex(box(.31, .018, .46, .005, 2), 'lacquer', 'z'), T(0, .378, 0))
    cushion = box(.3, .05, .45, .022, 4)
    p.add(swatch(cushion, 'leather'), T(0, .41, 0))
    for sz in (-1, 1):
        for k in range(5): bolt(p, (-.12 + k * .06, .395, sz * .226), 'z' if sz > 0 else '-z', .005, 'brass')
    return p.finish()

def build_guitar():
    p = Piece('guitar')  # origin: body centre at final size; soundboard faces +Z, neck along +Y
    k = .65
    raw = [(0, -.39), (.22, -.35), (.29, -.17), (.23, -.02), (.14, .08), (.23, .23), (.18, .36), (0, .39),
           (-.18, .36), (-.23, .23), (-.14, .08), (-.23, -.02), (-.29, -.17), (-.22, -.35)]
    outline = smooth_outline([(x * k, y * k) for x, y in raw], 6)
    p.add(tex(prism(outline, -.04, .058, .007, 3), 'sapele', 'y'))
    top = prism([(x * .985, y * .99) for x, y in outline], .0575, .0605, 0)
    p.add(tex(top, 'spruce', 'y'))
    hole_y = .065
    turn = RX(math.pi / 2)
    p.add(swatch(lathe([(0, 0), (.044, 0)], 32), 'cavity'), T(0, hole_y, .0612) @ turn)
    p.add(swatch(lathe([(.045, 0), (.049, 0)], 32), 'ivory'), T(0, hole_y, .0611) @ turn)
    p.add(swatch(lathe([(.049, 0), (.06, 0)], 32), 'rosette'), T(0, hole_y, .0611) @ turn)
    p.add(swatch(lathe([(.06, 0), (.062, 0)], 32), 'ivory'), T(0, hole_y, .0611) @ turn)
    bridge_y, nut_y = -.13, .574
    p.add(swatch(prism([(-.078, -.014), (.078, -.014), (.07, .014), (-.07, .014)], 0, .008, .003, 2), 'ebony'), T(0, bridge_y, .0605))
    p.add(swatch(box(.074, .0035, .005, .001, 1), 'ivory'), T(0, bridge_y + .004, .0705))
    p.add(tex(box(.049, .335, .02, .0085, 4), 'sapele', 'y'), T(0, .41, .0505))
    p.add(tex(prism([(-.027, 0), (.027, 0), (.022, .06), (-.022, .06)], -.04, .045, .008, 3), 'sapele', 'y'), T(0, .245, 0))
    board = prism([(-.028, .15), (.028, .15), (.0222, nut_y), (-.0222, nut_y)], .0605, .0665, .0012, 1)
    p.add(swatch(board, 'ebony'))
    scale = nut_y - (bridge_y + .004)
    for fret in range(1, 19):
        y = nut_y - scale * (1 - 2 ** (-fret / 12))
        half = .0222 + (.028 - .0222) * (nut_y - y) / (nut_y - .15)
        p.add(swatch(box(half * 2, .002, .0016, .0006, 1), 'nickel'), T(0, y, .0672))
        if fret in (3, 5, 7, 9, 12, 15):
            mid = nut_y - scale * (1 - 2 ** (-(fret - .5) / 12))
            for dx in ((-.009, .009) if fret == 12 else (0,)):
                p.add(swatch(cyl(.0028, .0028, .0006, 10), 'ivory'), T(dx, mid, .0667) @ RX(math.pi / 2))
    p.add(swatch(box(.0446, .005, .0075, .001, 1), 'ivory'), T(0, nut_y + .0025, .068))
    head = T(0, nut_y + .004, .05) @ RX(-.22)
    p.add(tex(prism([(-.024, 0), (.024, 0), (.036, .03), (.034, .128), (.012, .138), (-.012, .138), (-.034, .128), (-.036, .03)], -.007, .007, .004, 2), 'sapele', 'y'), head)
    posts = []
    for i in range(6):
        side, rank = (-1 if i < 3 else 1), (i if i < 3 else 5 - i)
        x, y = side * .023, .034 + rank * .034
        p.add(swatch(cyl(.0032, .0032, .016, 8), 'chrome'), head @ T(x, y, .012) @ RX(math.pi / 2))
        p.add(swatch(cyl(.0055, .0055, .002, 12), 'chrome'), head @ T(x, y, .0078) @ RX(math.pi / 2))
        p.add(swatch(tube([(side * .03, y, -.012), (side * .05, y, -.012)], .0022, 6), 'chrome'), head)
        p.add(swatch(ball(.008, .55, 1, 1.25, 1), 'ivory'), head @ T(side * .055, y, -.012))
        posts.append((head @ B(x, y, .016)))
    for i in range(6):
        x = (i - 2.5) * .0108
        end = posts[i]
        string = tube([(x, bridge_y - .008, .067), (x, bridge_y + .004, .0735), (x * .72, nut_y + .0025, .0722), (end.x, end.z, -end.y)],
                      .0011 - i * .00008, 4)
        p.add(swatch(string, 'string' if i < 4 else 'nickel'))
        p.add(swatch(ball(.003, level=1), 'ivory'), T(x, bridge_y - .008, .0688))
    return p.finish()

def build_bench():
    p = Piece('bench')  # origin: floor under the bench centre; seat along X, backrest at +Z
    length = 1.66
    for sx in (-1, 1):
        x = sx * length * .38
        p.add(tex(box(.055, .44, .055, .006, 2), 'timber', 'y'), T(x, .22, -.16))
        p.add(tex(box(.055, .92, .055, .006, 2), 'timber', 'y'), T(x, .46, .21) @ RX(.02))
        p.add(tex(box(.045, .06, .38, .005, 2), 'timber', 'z'), T(x, .395, .025))
        p.add(tex(box(.045, .05, .36, .005, 2), 'timber', 'z'), T(x, .14, .025))
    p.add(tex(box(length * .76, .05, .04, .005, 2), 'timber', 'x'), T(0, .14, .025))
    for i, z in enumerate((-.165, -.045, .075)):
        slat = tex(box(length - i * .012, .032, .108, .006, 3), 'timber', 'x')
        p.add(slat, T((i - 1) * .006, .443, z))
        for sx in (-1, 1): bolt(p, (sx * length * .38, .459, z), 'y', .007, 'steel')
    for i, y in enumerate((.63, .8)):
        p.add(tex(box(length - .05 - i * .01, .115, .028, .006, 3), 'timber', 'x'), T(0, y, .188) @ RX(.1))
        for sx in (-1, 1): bolt(p, (sx * length * .38, y, .173), '-z', .007, 'steel')
    return p.finish()

# ---------------------------------------------------------------- A16 last postcard
def build_mailbox():
    p = Piece('mailbox')  # mail-local frame of zones/last-postcard.ts (the zone scales it by 1.3)
    p.add(tex(box(.17, 1.44, .16, .012, 3), 'timber', 'y'), T(.025, .46, 0))
    p.add(tex(box(.8, .05, .58, .008, 2), 'timber', 'x'), T(0, 1.183, 0))
    for sign in (-1, 1):
        p.add(tex(box(.05, .36, .05, .006, 2), 'timber', 'y'), T(.025 + sign * .2, 1.03, 0) @ RZ(sign * .82))
    arch = [(-.48, 1.212), (.48, 1.212)] + [(.48 * math.cos(a), 1.6 + .29 * math.sin(a)) for a in [i * math.pi / 26 for i in range(27)]]
    p.add(tex(prism(arch, -.37, .37, .012, 3), 'enamel', 'z'))
    for z in (-.368, .368):  # hemmed sheet edges
        p.add(tex(tube([(x, y, z) for x, y in arch], .011, 8, closed=True), 'enamel', 'z'))
    front = .372
    door = [(-.32, 1.275), (.32, 1.275), (.325, 1.29), (.325, 1.57), (.31, 1.585), (-.31, 1.585), (-.325, 1.57), (-.325, 1.29)]
    p.add(swatch(prism([(x * 1.02, 1.43 + (y - 1.43) * 1.05) for x, y in door], front - .003, front + .001, 0), 'cavity'))
    p.add(tex(prism(door, front, front + .012, .005, 3), 'enamel', 'x'))
    p.add(tex(prism([(x * .86, 1.43 + (y - 1.43) * .78) for x, y in door], front + .01, front + .017, .005, 3), 'enamel', 'x'))
    p.add(swatch(cyl(.008, .008, .5, 10), 'steel'), T(0, 1.272, front + .012) @ RZ(math.pi / 2))
    for x in (-.2, .2): p.add(swatch(box(.07, .03, .004, .001, 1), 'steel'), T(x, 1.29, front + .014))
    knob = [(.012, 0), (.012, .014), (.024, .02), (.027, .032), (.02, .043), (0, .046)]
    p.add(swatch(lathe(knob, 20), 'brass'), T(0, 1.5, front + .016) @ RX(math.pi / 2))
    p.add(swatch(box(.5, .036, .004, 0), 'cavity'), T(0, 1.69, front + .0005))
    p.add(tex(box(.53, .055, .005, .0015, 1), 'enamel', 'x'), T(0, 1.712, front + .004) @ RX(.3) @ T(0, -.0275, 0))
    p.add(tex(box(.58, .012, .07, .004, 2), 'enamel', 'x'), T(0, 1.728, front + .03) @ RX(.22))
    for sign in (-1, 1): p.add(tex(prism([(0, 0), (.07, 0), (0, .03)], -.004, .004, .001, 1), 'enamel', 'x'), T(sign * .286, 1.7, front) @ RY(-math.pi / 2))
    for i in range(1, 26, 2):
        a = i * math.pi / 26
        bolt(p, (.445 * math.cos(a), 1.6 + .255 * math.sin(a), front), 'z', .0065, 'steel')
    for sign in (-1, 1):
        for y in (1.26, 1.4, 1.54): bolt(p, (sign * .445, y, front), 'z', .0065, 'steel')
        p.add(swatch(box(.035, .005, .62, .001, 1), 'steel'), T(sign * .3, 1.21, 0))
    # Signal flag on its pivot, right-hand side.
    p.add(swatch(cyl(.014, .014, .012, 12), 'steel'), T(.487, 1.5, -.05) @ RZ(math.pi / 2))
    p.add(swatch(box(.006, .2, .03, .0015, 1), 'flag'), T(.493, 1.6, -.05))
    p.add(swatch(prism([(-.05, 1.62), (.07, 1.62), (.07, 1.7), (-.05, 1.7), (-.02, 1.66)], .49, .496, .0015, 1), 'flag'), RY(math.pi / 2) @ T(0, 0, 0))
    return p.finish()

def card(index, w=.4, h=.28, curl=.02, seed=0):
    """A printed front and a paper back; corners lift like sun-dried card."""
    rng = random.Random(seed * 131 + index)
    lifts = [rng.random() * curl * (1 if rng.random() < .7 else 0) for _ in range(4)]
    bow = (rng.random() - .3) * curl * .6
    col, row = index % 2, (index // 2) % 3
    obs = []
    for face in (1, -1):
        bm = bmesh.new(); nx, ny = 12, 8
        grid = [[None] * (nx + 1) for _ in range(ny + 1)]
        for j in range(ny + 1):
            for i in range(nx + 1):
                u, v = i / nx, j / ny
                corners = [(1 - u) * (1 - v), u * (1 - v), (1 - u) * v, u * v]
                z = sum(l * c ** 3 for l, c in zip(lifts, corners)) + bow * (1 - (2 * u - 1) ** 2)
                grid[j][i] = bm.verts.new(B((u - .5) * w, v * h, z - (0 if face > 0 else .0012)))
        uvl = bm.loops.layers.uv.new('UVMap')
        for j in range(ny):
            for i in range(nx):
                quad = [grid[j][i], grid[j][i + 1], grid[j + 1][i + 1], grid[j + 1][i]]
                f = bm.faces.new(quad if face > 0 else list(reversed(quad)))
                for loop in f.loops:
                    jj, ii = next((a, b) for a in (j, j + 1) for b in (i, i + 1) if grid[a][b] is loop.vert)
                    loop[uvl].uv = ((col + ii / nx) * .5, 1 - ((row + 1) * 341 - jj / ny * 341) / 1024)
        ob = shade(obj(bm, 'card'), 80)
        if face > 0: ob.data.materials.append(MAT['print'])
        else: swatch(ob, 'paper')
        obs.append(ob)
    return obs

def build_rack():
    p = Piece('rack')  # origin: rack foot on the platform
    p.add(tex(box(.11, 1.86, .11, .012, 3), 'timber', 'y'), T(0, .93, 0))
    p.add(tex_round(lathe([(.04, 1.86), (.06, 1.875), (.06, 1.9), (.03, 1.93), (0, 1.95)], 16), 'timber'))
    for yaw in (0, math.pi / 2): p.add(tex(box(1.22, .08, .15, .012, 3), 'timber', 'x'), T(0, .04, 0) @ RY(yaw) if yaw else T(0, .045, 0))
    index = 0
    for face in range(3):
        turn = RY(face * TAU / 3 + .12)
        p.add(tex(box(.045, 1.02, .05, .006, 2), 'timber', 'y'), turn @ T(0, 1.305, .28))
        for row in range(2):
            y = 1.06 + row * .49
            p.add(tex(box(.56, .03, .1, .005, 2), 'timber', 'x'), turn @ T(0, y - .186, .345))
            p.add(tex(box(.56, .03, .012, .003, 1), 'timber', 'x'), turn @ T(0, y - .162, .392))
            p.add(tex(box(.032, .032, .3, .004, 1), 'timber', 'z'), turn @ T(0, y - .19, .16))
            for layer, (dx, lean, roll) in enumerate(((0, -.17, .0), (.035, -.13, .035))):
                for ob in card(index + layer * 3, seed=face * 7 + row * 3 + layer):
                    p.add(ob, turn @ T(dx - .02, y - .17, .378 - layer * .012) @ RX(lean) @ RZ(roll - .01))
            index += 1
    for ob in card(4, .28, .19, .012, 99):  # the reply card left on the foot, paper side up
        p.add(ob, T(.18, .089, .12) @ RY(-.24) @ RX(math.pi / 2) @ T(0, -.095, 0))
    return p.finish()

def build_lamp():
    p = Piece('lamp')  # origin: lamp-post foot; the lantern hangs at x = -0.42, y = 3
    p.add(tex(box(.15, 3.5, .15, .014, 3), 'timber', 'y'), T(0, 1.48, 0))
    p.add(tex(lathe([(.106, 3.23), (.115, 3.24), (.02, 3.3), (0, 3.3)], 4), 'timber', 'y'), RY(math.pi / 4))
    p.add(tex(box(.68, .09, .1, .008, 2), 'timber', 'x'), T(-.24, 3.13, 0))
    p.add(tex(box(.05, .46, .05, .006, 2), 'timber', 'y'), T(-.2, 2.93, 0) @ RZ(-.8))
    p.add(tex(box(.165, .04, .165, .004, 1), 'iron'), T(0, 3.08, 0))
    p.add(tex(tube([(-.42, 3.09, 0), (-.42, 3.045, 0), (-.42, 3.03, .012), (-.42, 3.012, 0), (-.42, 3.03, -.012), (-.42, 3.045, 0)], .005, 6), 'iron'))
    p.add(tex(box(.04, .012, .11, .003, 1), 'iron'), T(-.42, 3.18, 0))
    bolt(p, (-.42, 3.186, .035), 'y', .007, 'steel'); bolt(p, (-.42, 3.186, -.035), 'y', .007, 'steel')
    return p.finish()

# ---------------------------------------------------------------- export + previews
GROUPS = {
    'signpost': [build_signpost, build_waymark],
    'workshop': [build_brazier, build_torch],
    'horizon': [build_viewer, build_turbine, build_rotor],
    'quiet-shore': [build_piano, build_stool, build_guitar, build_bench],
    'last-postcard': [build_mailbox, build_rack, build_lamp],
}

def preview(piece, group):
    scene = bpy.context.scene
    for ob in bpy.data.objects: ob.hide_render = ob.type == 'MESH' and ob not in piece.objects
    corners = [ob.matrix_world @ Vector(c) for ob in piece.objects[1:] for c in ob.bound_box]
    lo = Vector([min(c[i] for c in corners) for i in range(3)]); hi = Vector([max(c[i] for c in corners) for i in range(3)])
    centre, size = (lo + hi) / 2, max(hi - lo)
    for shot, direction in enumerate((Vector((.55, -1, .32)), Vector((-.9, -.6, .55)))):
        cam = scene.camera
        cam.location = centre + direction.normalized() * size * 2.1
        cam.rotation_euler = (centre - cam.location).to_track_quat('-Z', 'Y').to_euler()
        scene.render.filepath = str(WORK / 'preview' / f'{piece.name}-{shot}.png')
        bpy.ops.render.render(write_still=True)

def setup_preview():
    scene = bpy.context.scene
    for engine in ('BLENDER_EEVEE_NEXT', 'BLENDER_EEVEE'):
        try: scene.render.engine = engine; break
        except TypeError: continue
    scene.render.resolution_x, scene.render.resolution_y = 900, 760
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); bpy.context.collection.objects.link(cam)
    cam.data.lens = 60; cam.data.clip_start = .01; scene.camera = cam
    sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN')); bpy.context.collection.objects.link(sun)
    sun.data.energy = 3.2; sun.rotation_euler = (math.radians(52), 0, math.radians(35))
    world = bpy.data.worlds.new('preview'); scene.world = world; world.use_nodes = True
    world.node_tree.nodes['Background'].inputs[0].default_value = (.55, .68, .8, 1)
    world.node_tree.nodes['Background'].inputs[1].default_value = .9
    scene.view_settings.view_transform = 'Standard'

inventory = []
if PREVIEW: (WORK / 'preview').mkdir(exist_ok=True); setup_preview()
for group, builders in GROUPS.items():
    if ONLY and group not in ONLY: continue
    pieces = [build() for build in builders]
    if PREVIEW:
        for piece in pieces: preview(piece, group)
    bpy.ops.object.select_all(action='DESELECT')
    for piece in pieces:
        for ob in piece.objects: ob.hide_render = False; ob.select_set(True)
    bpy.context.view_layer.objects.active = pieces[0].objects[0]
    bpy.ops.export_scene.gltf(filepath=str(OUT / f'hr-prop-setpiece-{group}.glb'), export_format='GLB', use_selection=True,
                              export_yup=True, export_tangents=True, export_apply=True, export_image_format='AUTO')
    inventory.append({'id': f'hr-prop-setpiece-{group}', 'file': f'hr-prop-setpiece-{group}.glb',
                      'pieces': [{'name': piece.name, 'triangles': piece.triangles, 'draws': len(piece.objects) - 1} for piece in pieces]})
    for piece in pieces:
        for ob in piece.objects: bpy.data.objects.remove(ob, do_unlink=True)
    print('HR-FIX-SETPIECE', group, [(piece.name, piece.triangles) for piece in pieces])
path = WORK / 'inventory.json'
existing = json.loads(path.read_text()) if path.exists() and ONLY else []
merged = [entry for entry in existing if entry['id'] not in {e['id'] for e in inventory}] + inventory
path.write_text(json.dumps(sorted(merged, key=lambda e: e['id']), indent=2))
print('HR-FIX-SETPIECE authored', [entry['id'] for entry in inventory])
