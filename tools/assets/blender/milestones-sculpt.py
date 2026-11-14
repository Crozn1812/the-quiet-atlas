"""MS-C2 character-derived static porcelain study. Project-owned source only.
Blender --background --python tools/assets/blender/milestones-sculpt.py -- <root>
Authors a smooth subdivision surface, then exports a single static mesh.
Runtime coordinates: X right, Y up, Z front. Blender coordinates: X, -Z, Y.
"""
import json
import math
import os
import sys

import bpy
import bmesh
from mathutils import Vector

ROOT = sys.argv[sys.argv.index('--') + 1]
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
PARTS = []


def xyz(p):
    return (p[0], -p[2], p[1])


def mesh(name, vertices, faces, subdiv=0):
    data = bpy.data.meshes.new(name)
    data.from_pydata([xyz(p) for p in vertices], [], faces)
    data.update()
    bm = bmesh.new()
    bm.from_mesh(data)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(data)
    bm.free()
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    if subdiv:
        mod = obj.modifiers.new('Sculpted cloth subdivision', 'SUBSURF')
        mod.levels = subdiv
        bpy.ops.object.modifier_apply(modifier=mod.name)
    for polygon in obj.data.polygons:
        polygon.use_smooth = True
    obj.select_set(False)
    PARTS.append(obj)
    return obj


def rings(name, rows, segments=20, folds=0, subdiv=1):
    # rows: x/y/z center, horizontal radius, depth radius.
    if subdiv:
        # Supporting rings keep cuffs, hip and elbow intersections closed
        # after Catmull-Clark, rather than shrinking into separate capsules.
        first, last = rows[0], rows[-1]
        near_first = tuple(a * .94 + b * .06 for a, b in zip(first, rows[1]))
        near_last = tuple(a * .94 + b * .06 for a, b in zip(last, rows[-2]))
        rows = [first, near_first, *rows[1:-1], near_last, last]
    vertices = []
    for j, (x, y, z, rx, rz) in enumerate(rows):
        for i in range(segments):
            a = i * math.tau / segments
            ripple = folds * math.sin(a * 7 + j * .85) * math.sin(math.pi * j / (len(rows) - 1))
            vertices.append((x + (rx + ripple) * math.cos(a), y,
                             z + (rz + ripple * .65) * math.sin(a)))
    faces = [tuple(reversed(range(segments)))]
    for j in range(len(rows) - 1):
        for i in range(segments):
            a = j * segments + i
            b = j * segments + (i + 1) % segments
            faces.append((a, b, b + segments, a + segments))
    faces.append(tuple((len(rows) - 1) * segments + i for i in range(segments)))
    return mesh(name, vertices, faces, subdiv)


def ellipsoid(name, center, scale, segments=24, rings_count=14, sculpt=None):
    vertices = []
    for j in range(rings_count + 1):
        phi = .001 + (math.pi - .002) * j / rings_count
        for i in range(segments):
            a = math.tau * i / segments
            x = scale[0] * math.sin(phi) * math.cos(a)
            y = scale[1] * math.cos(phi)
            z = scale[2] * math.sin(phi) * math.sin(a)
            if sculpt:
                x, y, z = sculpt(x, y, z)
            vertices.append((center[0] + x, center[1] + y, center[2] + z))
    faces = []
    for j in range(rings_count):
        for i in range(segments):
            a = j * segments + i
            b = j * segments + (i + 1) % segments
            faces.append((a, b, b + segments, a + segments))
    return mesh(name, vertices, faces)


def tube(name, points, radius, sides=6):
    vertices = []
    for j, p in enumerate(points):
        tangent = Vector(points[min(j + 1, len(points) - 1)]) - Vector(points[max(0, j - 1)])
        tangent.normalize()
        u = tangent.cross(Vector((0, 0, 1))).normalized()
        if u.length < .1:
            u = tangent.cross(Vector((1, 0, 0))).normalized()
        v = tangent.cross(u).normalized()
        for i in range(sides):
            a = math.tau * i / sides
            vertices.append(Vector(p) + radius * (u * math.cos(a) + v * math.sin(a)))
    faces = []
    for j in range(len(points) - 1):
        for i in range(sides):
            a = j * sides + i
            b = j * sides + (i + 1) % sides
            faces.append((a, b, b + sides, a + sides))
    return mesh(name, vertices, faces)


# Start from the approved 19-bone game character frozen at Walk 0.18 s.
# The source rig and character stay unchanged; only this derived statue is smoothed.
bpy.ops.import_scene.gltf(filepath=os.path.join(ROOT, 'tmp/ms-c2/character-walk.glb'))
body = next(o for o in bpy.context.selected_objects if o.type == 'MESH')
bpy.context.view_layer.objects.active = body
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
bm = bmesh.new()
bm.from_mesh(body.data)
# Remove the game character's tote/straps by their disconnected source islands.
bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=.00001)
seen = set()
remove = []
for vertex in bm.verts:
    if vertex in seen:
        continue
    pending, island = [vertex], []
    seen.add(vertex)
    while pending:
        v = pending.pop()
        island.append(v)
        for edge in v.link_edges:
            other = edge.other_vert(v)
            if other not in seen:
                seen.add(other)
                pending.append(other)
    low = [min(v.co[i] for v in island) for i in range(3)]
    top = [max(v.co[i] for v in island) for i in range(3)]
    if len(island) == 24 and low[0] > .65 and (low[2] < 2.61 or top[2] > 4.4 or (3.52 < low[2] < 3.55 and top[2] < 3.61)):
        remove.extend(island)
    # Replace the torso/neck garment as whole source islands. Cutting the neck
    # out of a connected shirt before voxel remeshing opens that entire shell.
    if low[2] > 3.17 and top[2] < 5.10 and low[0] >= -.73 and top[0] <= .73:
        remove.extend(island)
bmesh.ops.delete(bm, geom=list(set(remove)), context='VERTS')
# Replace the stylised game head with the anonymous sculpt below.
bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.z > 4.92], context='VERTS')
bm.to_mesh(body.data)
bm.free()
# A restrained opposite arm swing makes the frozen walk readable from the front.
# Blend at the shoulder so this does not introduce a disconnected arm seam.
for v in body.data.vertices:
    weight = max(0, min(1, (abs(v.co.x) - .68) / .45))
    if v.co.z < 2.6:
        continue
    angle = math.copysign(math.radians(14), v.co.x) * weight
    y, z = v.co.z - 4.5, -v.co.y
    v.co.z = 4.5 + y * math.cos(angle) - z * math.sin(angle)
    v.co.y = -(z * math.cos(angle) + y * math.sin(angle))
# Fuse shirt/limb intersections before smoothing the source's faceted silhouette.
body.data.remesh_voxel_size = .038
bpy.ops.object.voxel_remesh()
mod = body.modifiers.new('Relax source anatomical transitions', 'SMOOTH')
mod.factor = .8
mod.iterations = 7
bpy.ops.object.modifier_apply(modifier=mod.name)
for polygon in body.data.polygons:
    polygon.use_smooth = True
body.select_set(False)
PARTS.append(body)

# Tapered anatomical neck bridges the imported collar to the downcast head.
rings('Shirt yoke and anatomical neck', [(0,3.02,0,.55,.36),(0,3.48,0,.64,.40),(0,3.95,0,.72,.40),
    (0,4.30,0,.78,.38),(0,4.48,0,.73,.33),(0,4.62,0,.55,.25),
    (0,4.75,0,.34,.21),(0,4.85,-.01,.19,.18),
    (0,5.00,-.02,.17,.18),(0,5.15,-.02,.21,.20)], 24)
# Full-length loose trousers follow the same frozen hip/knee/ankle positions.
# The game character's original shorts and socks remain inside this garment.
pose = json.load(open(os.path.join(ROOT, 'tmp/ms-c2/character-walk-pose.json'), encoding='utf-8'))
for side in ('L', 'R'):
    hip, knee, ankle = [Vector(pose[name + side]) for name in ('thigh', 'shin', 'foot')]
    hem = ankle.lerp(knee, .13)
    calf = ankle.lerp(knee, .45)
    thigh = knee.lerp(hip, .62)
    rows = [(*hem, .28, .29), (*calf, .30, .31), (*knee, .33, .35),
            (*thigh, .35, .36), (*hip, .34, .34)]
    rings('Loose walking trouser ' + side, rows, 24, folds=.009)
# Keep the closed clothing shells as a single joined display mesh. Voxel
# remeshing overlapping closed garments can cancel their shared interior.
for side in (-1,1):
    mesh('Soft turned collar',[(side*.04,4.87,.18),(side*.25,4.82,.24),
        (side*.36,4.65,.35),(side*.18,4.57,.40)],[(0,1,2,3)],1)
HEAD_START = len(PARTS)


def face(x, y, z):
    # Bilateral, anonymous facial planes: chin, cheek bones, nasal bridge,
    # downcast orbital hollows and closed lips; no painted smile or eyeballs.
    x *= .90 + .10 * (y + .5)
    if z > 0:
        def g(cx, cy, sx, sy):
            return math.exp(-((x - cx) / sx) ** 2 - ((y - cy) / sy) ** 2)
        z += .105 * g(0, .015, .065, .19) + .10 * g(0, -.10, .09, .065)
        z += .030 * (g(-.17, -.12, .10, .10) + g(.17, -.12, .10, .10))
        z -= .045 * (g(-.15, .07, .09, .055) + g(.15, .07, .09, .055))
        z -= .018 * g(0, -.26, .14, .015)
        z += .019 * g(0, -.24, .13, .035)
        z -= .014 * (g(-.045, -.13, .024, .018) + g(.045, -.13, .024, .018))
        z -= .009 * g(0, -.20, .023, .045)
        z -= .025 * g(0, -.38, .22, .07)
    return x, y, z

ellipsoid('Neutral sculpted face', (0, 5.40, -.035), (.365, .50, .335), 48, 30, face)
for side in (-1, 1):
    ellipsoid('Ear', (side * .35, 5.39, -.04), (.07, .125, .065), 12, 10)
    tube('Downcast upper eyelid', [(side * .15 + u * .087, 5.444 - .012 * (1 - u*u), .287 + .015 * (1-u*u))
                                  for u in (-1, -.5, 0, .5, 1)], .009, 5)
    # Fine round spectacles are part of the single body draw, colored via
    # vertex pigment in the package step rather than separate materials.
    tube('Thin round glasses', [(side * .156 + .136 * math.cos(i * math.tau / 40),
                                5.445 + .132 * math.sin(i * math.tau / 40), .333)
                               for i in range(41)], .010, 5)
    tube('Glasses temple', [(side * .29, 5.46, .33), (side * .35, 5.47, .10), (side * .35, 5.42, -.10)], .009, 5)
tube('Glasses bridge', [(-.024, 5.47, .335), (0, 5.49, .35), (.024, 5.47, .335)], .009, 5)

# Quiet swept hair cap: small grooves in stone instead of graphic black hair.
def hair(x, y, z):
    return x, y, z + .006 * math.sin(x * 65 + y * 15)
ellipsoid('Sculpted hair', (0, 5.68, -.10), (.355, .23, .30), 28, 12, hair)

# Adult proportions: the head occupies about one eighth of the figure's
# height. Apply the same reduction to lids/ears/glasses, preserving their fit.
for obj in PARTS[HEAD_START:]:
    for vertex in obj.data.vertices:
        vertex.co.x *= .90
        vertex.co.y *= .90
        vertex.co.z = 5.39 + (vertex.co.z - 5.40) * .80
        # Seven-degree downcast inclination, including glasses and eyelids.
        a = math.radians(7)
        y, z = vertex.co.z - 5.23, -vertex.co.y
        vertex.co.z = 5.23 + y*math.cos(a)-z*math.sin(a)
        vertex.co.y = -(z*math.cos(a)+y*math.sin(a))

# Per-part pigment keeps brass glasses separate from facial planes, within the
# same draw. In particular, never paint a dark mask across the nose/cheeks.
for obj in PARTS:
    color = obj.data.color_attributes.new(name='COLOR_0', type='FLOAT_COLOR', domain='CORNER')
    for polygon in obj.data.polygons:
        for loop in polygon.loop_indices:
            p = obj.data.vertices[obj.data.loops[loop].vertex_index].co
            ao = .87 if 2.9 < p.z < 3.15 or 4.75 < p.z < 5.10 else .98
            pigment = (ao, ao * .985, ao * .95, 1)
            if 'glasses' in obj.name.lower() or 'temple' in obj.name.lower():
                pigment = (.36, .29, .17, 1)
            elif 'eyelid' in obj.name:
                pigment = (.61, .57, .49, 1)
            color.data[loop].color = pigment

# Bake high-poly cloth folds into a tangent normal map, keeping the walking
# silhouette and the low-poly mesh inside the ticket's triangle budget.
for obj in PARTS:
    obj.select_set(True)
bpy.context.view_layer.objects.active = PARTS[0]
bpy.ops.object.join()
body = bpy.context.object
body.name = 'MS-C2 approved character frozen Walk 0.18s'
bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.mesh.normals_make_consistent(inside=False)
bpy.ops.object.mode_set(mode='OBJECT')
triangles = sum(len(p.vertices) - 2 for p in body.data.polygons)
mod = body.modifiers.new('Display surface budget', 'DECIMATE')
mod.ratio = min(1, 6800 / triangles)
bpy.ops.object.modifier_apply(modifier=mod.name)
body.data.validate(clean_customdata=True)
bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.uv.smart_project(angle_limit=1.15, island_margin=.015)
bpy.ops.object.mode_set(mode='OBJECT')
# High surface has real shallow cloth wrinkles, baked onto the display mesh.
high = body.copy()
high.data = body.data.copy()
bpy.context.collection.objects.link(high)
bpy.context.view_layer.objects.active = high
body.select_set(False)
high.select_set(True)
mod = high.modifiers.new('High cloth surface', 'SUBSURF')
mod.levels = 2
mod.subdivision_type = 'SIMPLE'
bpy.ops.object.modifier_apply(modifier=mod.name)
for v in high.data.vertices:
    x, z, y = v.co.x, -v.co.y, v.co.z
    if .4 < y < 4.6:
        # Broad diagonal tension creases at knees/waist, quieter vertical pleats.
        joint = math.exp(-((y-1.5)/.38)**2)+math.exp(-((y-3.0)/.28)**2)
        crease = .012 * math.sin(y*33+x*9+z*6) * joint
        crease += .005 * math.sin(x*37+z*21) * math.sin(y*5)**2
        v.co += v.normal * crease
normal = bpy.data.images.new('Milestones baked cloth normals', width=512, height=512, alpha=False)
normal.colorspace_settings.name = 'Non-Color'
material = bpy.data.materials.new('Normal bake target')
material.use_nodes = True
image_node = material.node_tree.nodes.new('ShaderNodeTexImage')
image_node.image = normal
material.node_tree.nodes.active = image_node
body.data.materials.clear()
body.data.materials.append(material)
for polygon in body.data.polygons:
    polygon.material_index = 0
body.select_set(True)
bpy.context.view_layer.objects.active = body
scene = bpy.context.scene
scene.render.engine = 'CYCLES'
scene.cycles.samples = 8
scene.render.bake.use_selected_to_active = True
scene.render.bake.cage_extrusion = .12
scene.render.bake.max_ray_distance = .24
scene.render.bake.margin = 5
bpy.ops.object.bake(type='NORMAL')
directory = os.path.join(ROOT, 'tmp/ms-c2')
os.makedirs(directory, exist_ok=True)
normal.filepath_raw = os.path.join(ROOT, 'public/world/milestones/cloth-normal.png')
normal.file_format = 'PNG'
normal.save()
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(directory, 'milestones-sculpt.blend'))
bpy.data.objects.remove(high, do_unlink=True)
body.select_set(True)
bpy.context.view_layer.objects.active = body
bpy.ops.export_scene.gltf(filepath=os.path.join(directory, 'sculpt.glb'), export_format='GLB',
                         use_selection=True, export_animations=False, export_normals=True,
                         export_materials='NONE', export_all_vertex_colors=True)
print('MS-C2 character-derived sculpt exported', len(body.data.polygons), 'polygons')
