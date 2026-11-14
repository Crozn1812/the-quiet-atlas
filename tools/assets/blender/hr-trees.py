"""HR-TREE1 offline authoring. Blender --background --python this-file.

Original geometry is dedicated to CC0. No downloads or shared Blender scene.
Uses cached, checksum-verified Poly Haven photographs, not AI images.
Curve to Mesh geometry nodes produce tapered, multilevel branch/ivy tubes.
"""
import bpy
import json
import math
import random
import hashlib
import runpy
from pathlib import Path
import numpy as np
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[3]
OUT = ROOT / 'tmp/hr-trees'
OUT.mkdir(parents=True, exist_ok=True)
CACHE = ROOT / 'tmp/gfx-p2'
SOURCES = json.loads((ROOT / 'tools/assets/textures/cc0-sources.json').read_text())['sources']
for record in SOURCES:
    if record['id'] in ('pine_bark', 'forest_floor'):
        for item in record['maps'].values():
            if hashlib.sha256((CACHE / item['file']).read_bytes()).hexdigest() != item['sha256']:
                raise ValueError('Source checksum mismatch: ' + item['file'])

# Architectural studies, not claims of scanned botanical species.
SPECS = [
    ('buttress-emergent', 19, 5.8, .72, 24, 4, True, 'buttress'),
    ('buttress-fluted', 16, 5.0, .62, 22, 5, True, 'buttress'),
    ('spreading-crown', 12, 6.7, .46, 26, 3, True, 'spreading'),
    ('umbrella-crown', 10, 6.0, .42, 28, 3, False, 'umbrella'),
    ('slender-upright', 15, 2.7, .22, 20, 3, True, 'slender'),
    ('slender-forked', 13, 3.6, .28, 21, 4, True, 'forked'),
    ('bamboo-clump', 11, 2.5, .11, 11, 3, False, 'bamboo'),
    ('bamboo-arching', 8, 3.4, .085, 15, 3, False, 'bamboo'),
    ('leaning-riverside', 12, 4.2, .40, 22, 3, True, 'leaning'),
    ('fallen-living', 13, 3.2, .44, 19, 4, True, 'fallen'),
    ('dead-snag', 14, 3.5, .51, 18, 3, False, 'dead'),
    ('dead-forked', 10, 4.1, .38, 21, 4, False, 'dead'),
]


def image_file(name, array):
    h, w = array.shape[:2]
    image = bpy.data.images.new(name, width=w, height=h, alpha=True)
    image.pixels.foreach_set(array.astype(np.float32).ravel())
    image.filepath_raw = str(OUT / (name + '.png'))
    image.file_format = 'PNG'
    image.save()
    return image


def photo(name):
    image = bpy.data.images.load(str(CACHE / name), check_existing=True)
    w, h = image.size
    return np.array(image.pixels[:], dtype=np.float32).reshape(h, w, 4)


def textures():
    # Four actual photographed leaves, traced from the cached 2K forest-floor
    # photograph. Coordinates use top-left image space. Small source islands
    # remain small; the 2K atlas is NOT a claim of 2K native leaf detail.
    source = photo('forest_floor-diff.jpg')[::-1]
    outlines = [
        [(1556, 664), (1568, 632), (1580, 613), (1607, 605), (1626, 594), (1638, 610), (1634, 633), (1615, 651), (1580, 660)],
        [(1453, 501), (1478, 485), (1493, 483), (1512, 489), (1533, 506), (1524, 522), (1505, 533), (1476, 526)],
        [(1574, 311), (1591, 319), (1617, 339), (1619, 356), (1608, 371), (1593, 380), (1563, 370), (1556, 352)],
        [(890, 61), (910, 63), (925, 79), (929, 100), (917, 118), (891, 133), (880, 118), (879, 91)],
    ]
    # Build a 2K cluster atlas with four distinct sprigs, transparent gutters.
    atlas = np.zeros((2048, 2048, 4), dtype=np.float32)
    rng = random.Random(42091)
    for tile in range(4):
        ox, oy = tile % 2 * 1024, tile // 2 * 1024
        for leaf_index in range(9):
            poly = outlines[(leaf_index + tile) % len(outlines)]
            x0, x1 = min(p[0] for p in poly)-2, max(p[0] for p in poly)+3
            y0, y1 = min(p[1] for p in poly)-2, max(p[1] for p in poly)+3
            # Point-in-polygon mask preserves the traced photographic outline.
            yy, xx = np.mgrid[y0:y1, x0:x1]
            mask = np.zeros(xx.shape, dtype=bool)
            a = poly[-1]
            for b in poly:
                mask ^= ((a[1] > yy) != (b[1] > yy)) & (xx < (b[0]-a[0])*(yy-a[1])/(b[1]-a[1]+1e-8)+a[0])
                a = b
            crop = source[y0:y1, x0:x1].copy()
            # Re-pigment senescent leaves, retaining photographed veins/damage.
            luma = crop[:, :, :3].mean(axis=2)
            crop[:, :, :3] = luma[:, :, None] * np.array([.24, .54 + tile*.025, .12])
            crop[:, :, 3] = mask
            side = -1 if leaf_index % 2 else 1
            angle = side * (.55 + rng.random()*.6)
            length = 225 + rng.randrange(80)
            width = 120 + rng.randrange(55)
            cx, cy = 512 + side*(110 + leaf_index*11), 150 + leaf_index*78
            gy, gx = np.mgrid[max(0,cy-length):min(1024,cy+length), max(0,cx-length):min(1024,cx+length)]
            dx, dy = gx-cx, gy-cy
            u = (dx*math.cos(angle) + dy*math.sin(angle))/width+.5
            v = (-dx*math.sin(angle)+dy*math.cos(angle))/length+.5
            valid = (u>=0)&(u<1)&(v>=0)&(v<1)
            sampled = crop[np.clip((v*(y1-y0)).astype(int),0,y1-y0-1), np.clip((u*(x1-x0)).astype(int),0,x1-x0-1)]
            take = valid & (sampled[:,:,3]>.5)
            target = atlas[oy+gy, ox+gx]
            target[take] = sampled[take]
            atlas[oy+gy, ox+gx] = target
        # Thin branching petiole, behind overlapping leaf islands.
        for y in range(90, 930):
            x = 512 + int(14*math.sin(y*.007))
            atlas[oy+y, ox+x-2:ox+x+3] = (.075,.11,.025,1)
    return image_file('hr-leaf-clusters', atlas[::-1].copy())


def material(name, texture=None, alpha=False):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    p = m.node_tree.nodes.get('Principled BSDF')
    p.inputs['Roughness'].default_value = .87
    if texture:
        t = m.node_tree.nodes.new('ShaderNodeTexImage')
        t.image = texture
        m.node_tree.links.new(t.outputs['Color'], p.inputs['Base Color'])
        if alpha:
            m.node_tree.links.new(t.outputs['Alpha'], p.inputs['Alpha'])
            m.surface_render_method = 'DITHERED'
            m.alpha_threshold = .45
            m.use_backface_culling = False
    return m


def tube_mesh(name, paths, mat, sides):
    curve = bpy.data.curves.new(name, 'CURVE')
    curve.dimensions = '3D'
    for points, radii in paths:
        s = curve.splines.new('POLY')
        s.points.add(len(points)-1)
        for p, xyz, radius in zip(s.points, points, radii):
            p.co = (*xyz, 1)
            p.radius = radius
    obj = bpy.data.objects.new(name, curve)
    bpy.context.scene.collection.objects.link(obj)
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    group = bpy.data.node_groups.new(name+'-sweep', 'GeometryNodeTree')
    group.interface.new_socket(name='Geometry', in_out='INPUT', socket_type='NodeSocketGeometry')
    group.interface.new_socket(name='Geometry', in_out='OUTPUT', socket_type='NodeSocketGeometry')
    nodes, links = group.nodes, group.links
    inp, output = nodes.new('NodeGroupInput'), nodes.new('NodeGroupOutput')
    circle = nodes.new('GeometryNodeCurvePrimitiveCircle')
    circle.inputs['Resolution'].default_value = sides
    circle.inputs['Radius'].default_value = 1
    sweep = nodes.new('GeometryNodeCurveToMesh')
    sweep.inputs['Fill Caps'].default_value = True
    radius_field = nodes.new('GeometryNodeInputRadius')
    links.new(radius_field.outputs['Radius'], sweep.inputs['Scale'])
    links.new(inp.outputs['Geometry'], sweep.inputs['Curve'])
    links.new(circle.outputs['Curve'], sweep.inputs['Profile Curve'])
    links.new(sweep.outputs['Mesh'], output.inputs['Geometry'])
    mod = obj.modifiers.new('Tapered branch sweep', 'NODES')
    mod.node_group = group
    bpy.ops.object.convert(target='MESH')
    obj.data.materials.append(mat)
    # All joined parts MUST share the UV-layer name; otherwise Blender creates
    # separate layers and exports zero UVs on the leaf material's active layer.
    uv = obj.data.uv_layers.new(name='UVMap')
    vertex_uv = []
    for points, radii in paths:
        distance = 0
        for ring, point in enumerate(points):
            if ring:
                distance += (point-points[ring-1]).length
            vertex_uv.extend([(side/sides, distance/1.4) for side in range(sides)])
    for face in obj.data.polygons:
        face.use_smooth = True
        values = [vertex_uv[obj.data.loops[li].vertex_index] for li in face.loop_indices]
        seam = max(v[0] for v in values)-min(v[0] for v in values) > .5
        for li, value in zip(face.loop_indices, values):
            uv.data[li].uv = (value[0]+(1 if seam and value[0]<.5 else 0),value[1])
    obj.select_set(False)
    return obj


def buttress_fins(radius, mat):
    verts, faces = [], []
    for root in range(7):
        angle = root*math.tau/7+.09*math.sin(root*4)
        outward=Vector((math.cos(angle),math.sin(angle),0))
        across=Vector((-math.sin(angle),math.cos(angle),0))
        k=len(verts)
        for j in range(15):
            t=j/14
            distance=radius*(.55+4.9*t)
            top=radius*(3.9*(1-t)**3+.05)
            thickness=radius*(.20*(1-t)+.018)
            for side,z in ((-1,.025),(-1,top),(1,top),(1,.025)):
                verts.append(outward*distance+across*side*thickness+Vector((0,0,z)))
        for j in range(14):
            for side in range(4):
                a=k+j*4+side; b=k+j*4+(side+1)%4
                faces.append((a,a+4,b+4,b))
    mesh=bpy.data.meshes.new('concave-buttress-fins'); mesh.from_pydata(verts,[],faces)
    mesh.materials.append(mat)
    uv=mesh.uv_layers.new()
    for face in mesh.polygons:
        face.use_smooth=True
        for li in face.loop_indices:
            co=mesh.vertices[mesh.loops[li].vertex_index].co
            uv.data[li].uv=(co.x*.4+co.y*.3,co.z*.7)
    obj=bpy.data.objects.new('buttress-fins',mesh)
    bpy.context.scene.collection.objects.link(obj)
    return obj


def leaves_mesh(clusters, mat, level):
    verts, faces, coords = [], [], []
    for i, (c, direction, size, tile) in enumerate(clusters):
        if level and i % 3:
            continue
        up = direction.normalized()
        side = up.cross(Vector((.13,.21,1))).normalized()
        if side.length < .1:
            side = Vector((1,0,0))
        # Folded card, two curved halves. LOD thins WHOLE sprigs, never decimates
        # individual alpha cards. Scale compensates only partly for lost cover.
        factor = 1.24 if level else 1
        d, s = up*size*factor, side*size*.49*factor
        ridge = up.cross(side)*size*.11
        k = len(verts)
        verts.extend([c-d-s,c-d+ridge,c-d+s,c+d-s,c+d+ridge,c+d+s])
        faces.extend([(k,k+3,k+4,k+1),(k+1,k+4,k+5,k+2)])
        u, v = tile%2*.5, tile//2*.5
        coords.extend([[(u+.015,v+.015),(u+.015,v+.485),(u+.25,v+.485),(u+.25,v+.015)],
                       [(u+.25,v+.015),(u+.25,v+.485),(u+.485,v+.485),(u+.485,v+.015)]])
    mesh = bpy.data.meshes.new('intact-photographic-sprigs')
    mesh.from_pydata(verts, [], faces)
    mesh.materials.append(mat)
    uv = mesh.uv_layers.new()
    for face, values in zip(mesh.polygons, coords):
        face.use_smooth = True
        for li, value in zip(face.loop_indices, values):
            uv.data[li].uv = value
    obj = bpy.data.objects.new('leaf-clusters', mesh)
    bpy.context.scene.collection.objects.link(obj)
    return obj


def skeleton(spec, seed):
    _, height, width, radius, count, _, ivy, shape = spec
    rng = random.Random(seed)
    paths, clusters, ivy_paths = [], [], []
    fallen = shape == 'fallen'
    lean = .8 if fallen else .35 if shape == 'leaning' else .035

    def trunk(t, offset=Vector((0,0,0))):
        return offset + Vector((height*lean*t**1.3, .15*math.sin(t*5), height*t*(.14 if fallen else 1)))

    def branch(start, direction, length, rad, depth):
        points = []
        tangent = direction.normalized()
        for step in range(7):
            t = step/6
            p = start+tangent*length*t+Vector((.08*length*math.sin(t*3), .045*length*math.sin(t*4), length*t*t*.20))
            points.append(p)
        paths.append((points, [max(.003,rad*(1-t/6)**1.5) for t in range(7)]))
        if depth:
            for j in range(3 if depth < 3 else 4):
                index = 3+j%4
                angle = rng.random()*math.tau
                direction2 = (tangent*.45 + Vector((math.cos(angle),math.sin(angle),rng.uniform(.05,.65)))).normalized()
                branch(points[index], direction2, length*rng.uniform(.39,.61), rad*.40, depth-1)
        elif shape != 'dead':
            for j in range(7):
                c = points[2+j%5] + Vector((rng.uniform(-.24,.24),rng.uniform(-.24,.24),rng.uniform(-.12,.23)))
                size = rng.uniform(.28,.48) if shape != 'bamboo' else rng.uniform(.22,.34)
                clusters.append((c, Vector((rng.uniform(-1,1),rng.uniform(-1,1),rng.uniform(-.3,.8))), size, rng.randrange(4)))

    stems = count if shape == 'bamboo' else 1
    for stem in range(stems):
        offset = Vector((rng.uniform(-.85,.85),rng.uniform(-.85,.85),0)) if stems>1 else Vector((0,0,0))
        points = [trunk(i/40,offset) for i in range(41)]
        if shape == 'bamboo':
            bend = Vector((rng.uniform(-1.9,1.9),rng.uniform(-1.9,1.9),rng.uniform(-1.5,.2)))
            points = [p+bend*(i/40)**2 for i,p in enumerate(points)]
        radii = [radius*(1-i/44)**.8*(1+.10*math.sin(i*1.7)) for i in range(41)]
        paths.append((points,radii))
        if shape == 'bamboo':
            # Node collars, not identical disconnected cylinders.
            for i in range(2,37,3):
                center = points[i]
                ring = [center+Vector((math.cos(a*math.tau/20),math.sin(a*math.tau/20),0))*radii[i]*1.08 for a in range(21)]
                paths.append((ring,[.012]*21))
        for j in range(8 if stems>1 else count):
            t = .36 + .59*j/(8 if stems>1 else count)
            if shape in ('umbrella','spreading'):
                t = .57 + .34*j/count
            angle = j*2.39996+seed*.19+stem
            length = width*(.35+.65*math.sin(math.pi*(j+1)/((8 if stems>1 else count)+2)))
            direction = Vector((math.cos(angle),math.sin(angle),rng.uniform(.12,.7)))
            branch(points[min(39,int(t*40))],direction,length,radius*.31*(1-t*.5),2 if stems>1 else 3)
    if shape != 'bamboo':
        for j in range(8):
            angle=j*math.tau/8+rng.uniform(-.16,.16)
            length=radius*(4.5 if shape=='buttress' else 2.4)
            a=Vector((0,0,radius*(2.7 if shape=='buttress' else .75)))
            b=Vector((math.cos(angle)*length,math.sin(angle)*length,.035))
            points=[a.lerp(b,i/10)+Vector((0,0,-math.sin(i/10*math.pi)*radius*.5)) for i in range(11)]
            paths.append((points,[max(.018,radius*.32*(1-i/11)) for i in range(11)]))
    if ivy:
        for vine in range(5):
            points=[]
            for step in range(100):
                t=step/99*.79
                angle=t*25+vine*1.256
                p=trunk(t)+Vector((math.cos(angle),math.sin(angle),0))*radius*(1-t*.70)*1.03
                points.append(p)
                if step%4==0:
                    clusters.append((p,Vector((math.cos(angle),math.sin(angle),.3)),.16, vine%4))
            ivy_paths.append((points,[.018*(1-i/130) for i in range(100)]))
        # Adventitious vines follow three primary branch paths and hang at tips.
        for branch_points, radii in paths[1:4]:
            pts=[p+Vector((math.cos(i*2)*radii[i],math.sin(i*2)*radii[i],0)) for i,p in enumerate(branch_points)]
            pts += [pts[-1]+Vector((.05*i,0,-.25*i)) for i in range(1,8)]
            ivy_paths.append((pts,[.012]*len(pts)))
    return paths,clusters,ivy_paths


def main():
    scene=bpy.data.scenes.new('HR-TREE1 isolated authoring')
    bpy.context.window.scene=scene
    bark=material('hr-photographic-bark',bpy.data.images.load(str(CACHE/'pine_bark-diff.jpg')))
    normal=bpy.data.images.load(str(CACHE/'pine_bark-nor_gl.jpg'))
    normal.colorspace_settings.name='Non-Color'
    tex=bark.node_tree.nodes.new('ShaderNodeTexImage'); tex.image=normal
    n=bark.node_tree.nodes.new('ShaderNodeNormalMap')
    bark.node_tree.links.new(tex.outputs['Color'],n.inputs['Color'])
    bark.node_tree.links.new(n.outputs['Normal'],bark.node_tree.nodes.get('Principled BSDF').inputs['Normal'])
    leaf=material('hr-photographic-leaf-cutout',textures(),True)
    # glTF volume/thickness is applied by the packager; standard translucency
    # survives KTX2 and is rendered with MeshPhysicalMaterial by GLTFLoader.
    vine=material('hr-ivy-bark',bpy.data.images.load(str(CACHE/'pine_bark-diff.jpg')))
    moss=material('hr-root-moss',bpy.data.images.load(str(CACHE/'pine_bark-diff.jpg')))
    moss.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value=(.055,.105,.022,1)
    inventory=[]
    bamboo_entries=None
    for index,spec in enumerate(SPECS):
        name,height,width,radius,count,_,has_ivy,shape=spec
        if shape=='bamboo':
            # Keep full-library regeneration on the corrected bamboo authoring
            # path. Do not recreate the retired broadleaf-sprig bamboo bushes.
            if bamboo_entries is None:
                runpy.run_path(str(Path(__file__).with_name('hr-trees-bamboo.py')),run_name='__main__')
                bamboo_entries=json.loads((OUT/'bamboo-inventory.json').read_text())
            inventory.append(next(e for e in bamboo_entries if e['id']=='hr-tree-'+name))
            continue
        paths,clusters,ivy=skeleton(spec,61501+index*211)
        entry=dict(id='hr-tree-'+name,category='tree',license='CC0-1.0',
                   source=['https://polyhaven.com/a/pine_bark','https://polyhaven.com/a/forest_floor'],
                   seed=61501+index*211,architecture=shape,branchLevels=4,ivy=has_ivy,lods=[],
                   derivation='Original geometry-node curve sweeps; photographed CC0 bark and repigmented traced leaf clusters; procedural root moss')
        for level in (0,1):
            objects=[]
            subset=paths if level==0 else [p for i,p in enumerate(paths) if i%3==0 or max(p[1])>radius*.09]
            objects.append(tube_mesh('wood',subset,bark,12 if level==0 else 7))
            if shape=='buttress':
                objects.append(buttress_fins(radius,bark))
            if clusters:
                objects.append(leaves_mesh(clusters,leaf,level))
            if ivy:
                objects.append(tube_mesh('ivy',ivy,vine,6 if level==0 else 4))
            # Irregular thin moss growth conforms to root tubes, avoids a disk.
            moss_paths=[]
            for j in range(28 if level==0 else 12):
                a=j*2.39996
                extent=radius*(1.2+.5*math.sin(j*3.7))
                pts=[Vector((math.cos(a)*extent*t, math.sin(a)*extent*t, .04+radius*.5*(1-t))) for t in (.1,.35,.6,.85,1)]
                moss_paths.append((pts,[radius*.12*(1-k*.12) for k in range(5)]))
            objects.append(tube_mesh('moss',moss_paths,moss,5))
            bpy.ops.object.select_all(action='DESELECT')
            for obj in objects: obj.select_set(True)
            bpy.context.view_layer.objects.active=objects[0]
            bpy.ops.object.join()
            obj=bpy.context.object
            obj.name=entry['id']
            obj['hrArchitecture']=shape; obj['hrIvy']=has_ivy; obj['hrSeed']=entry['seed']
            filename=entry['id']+'-lod'+str(level)+'.glb'
            bpy.ops.export_scene.gltf(filepath=str(OUT/filename),use_selection=True,use_active_scene=True,
                export_format='GLB',export_yup=True,export_materials='EXPORT',export_extras=True)
            entry['lods'].append(dict(level=level,file=filename))
            bpy.data.objects.remove(obj,do_unlink=True)
        inventory.append(entry)
        print('HR-TREE exported',entry['id'], 'branches',len(paths),'sprigs',len(clusters),flush=True)
    if bamboo_entries:
        inventory.append(next(e for e in bamboo_entries if e['id']=='hr-tree-bamboo-riverside'))
    (OUT/'inventory.json').write_text(json.dumps(inventory,indent=2)+'\n')


if __name__=='__main__':
    main()
