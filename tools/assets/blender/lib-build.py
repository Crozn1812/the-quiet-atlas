"""GFX-02. Execute through Blender MCP, without resetting Blender.

Input: existing tmp/raw-polyhaven (no network). Output: tmp/lib-export,
assets/lib/library.blend. Optimize and capture final GLBs with lib-package.mjs.
"""
import bpy
import math
import random
import json
from pathlib import Path
from mathutils import Vector

ROOT = Path('D:/tqa-worktrees/GFX-02')
RAW = ROOT / 'tmp/raw-polyhaven'
OUT = ROOT / 'tmp/lib-export'
OUT.mkdir(parents=True, exist_ok=True)
(ROOT / 'assets/lib').mkdir(parents=True, exist_ok=True)
previous = bpy.context.window.scene
try:
    scene = bpy.data.scenes.new('GFX02-library')
    bpy.context.window.scene = scene
    rng = random.Random(20261113)
    # Preserve the approved meshes exactly; revision only replaces vegetation.
    with bpy.data.libraries.load(str(ROOT / 'assets/lib/library.blend'), link=False) as (old, loaded):
        loaded.objects = [n for n in old.objects if n.startswith(('rock-', 'prop-fern', 'prop-fallen-log'))]
    approved = {o.name.split('.')[0]: o for o in loaded.objects}


    def material(name, color):
        m = bpy.data.materials.new('GFX02-' + name)
        m.diffuse_color = (*color, 1)
        m.use_nodes = True
        p = m.node_tree.nodes.get('Principled BSDF')
        p.inputs['Base Color'].default_value = (*color, 1)
        p.inputs['Roughness'].default_value = .92
        return m


    def textured(name, filename, alpha=None):
        m = material(name, (1, 1, 1))
        image = bpy.data.images.load(str(RAW / 'textures' / filename), check_existing=False)
        if name == 'pine-twig':
            # Crop the complete source sprig before resampling.
            iw, ih = image.size
            original = list(image.pixels[:])
            pixels = []
            for y in range(128):
                sy = min(ih-1, int((.55 + .45*y/127)*(ih-1)))
                for x in range(128):
                    sx = int(.245*x/127*(iw-1))
                    at = (sy*iw+sx)*4
                    pixels.extend(original[at:at+4])
        else:
            image.scale(128, 128)
            pixels = list(image.pixels[:])
        if name == 'pine-twig':
            for i in range(128 * 128):
                luma = sum(pixels[i * 4:i * 4 + 3]) / 3
                # Retain photographed needle detail, with a living forest-green hue.
                pixels[i * 4:i * 4 + 3] = [.12 + luma * .28, .24 + luma * .50, .10 + luma * .25]
        if alpha:
            mask = bpy.data.images.load(str(RAW / 'textures' / alpha), check_existing=False)
            if name == 'pine-twig':
                mw, mh = mask.size
                original = list(mask.pixels[:])
                for y in range(128):
                    sy = min(mh-1, int((.55 + .45*y/127)*(mh-1)))
                    for x in range(128):
                        sx = int(.245*x/127*(mw-1))
                        pixels[(y*128+x)*4+3] = original[(sy*mw+sx)*4]
            else:
                mask.scale(128, 128)
                for i in range(128 * 128):
                    pixels[i * 4 + 3] = mask.pixels[i * 4]
        if name == 'pine-twig':
            # The source atlas mask also marks neighboring UV islands white.
            # Remove only border-connected islands; keep the intact central sprig.
            pending = [(x, y) for y in range(128) for x in range(128)
                       if x in (0, 127) or y in (0, 127)]
            visited = set()
            while pending:
                x, y = pending.pop()
                if not (0 <= x < 128 and 0 <= y < 128) or (x,y) in visited:
                    continue
                visited.add((x,y))
                at = (y*128+x)*4+3
                if pixels[at] < .1:
                    continue
                pixels[at] = 0
                pending.extend([(x-1,y),(x+1,y),(x,y-1),(x,y+1)])
        baked = bpy.data.images.new('GFX02-' + name, width=128, height=128, alpha=True)
        baked.pixels[:] = pixels
        if name == 'boulder':
            baked.scale(64, 64)
        baked.filepath_raw = str(OUT / (name + '.png'))
        baked.file_format = 'PNG'
        baked.save()
        baked.pack()
        nodes = m.node_tree.nodes
        tex = nodes.new('ShaderNodeTexImage')
        tex.image = baked
        p = nodes.get('Principled BSDF')
        m.node_tree.links.new(tex.outputs['Color'], p.inputs['Base Color'])
        if alpha:
            threshold = nodes.new('ShaderNodeMath')
            threshold.operation = 'GREATER_THAN'
            threshold.inputs[1].default_value = .5
            m.node_tree.links.new(tex.outputs['Alpha'], threshold.inputs[0])
            m.node_tree.links.new(threshold.outputs[0], p.inputs['Alpha'])
            m.surface_render_method = 'DITHERED'
            m.alpha_threshold = .5
            m.use_backface_culling = False
        return m


    bark = textured('pine-bark', 'pine_tree_01_bark_diff.png')
    twig = textured('pine-twig', 'pine_tree_01_twig_diff.png', 'pine_tree_01_twig_alpha.png')
    stone = textured('boulder', 'boulder_01_diff.png')
    fernmat = textured('fern', 'fern_02_diff.png', 'fern_02_alpha.png')
    wood = material('wood', (.085, .065, .047))
    pinewood = material('warm-pine-trunk', (.12, .065, .028))
    cutwood = material('cutwood', (.49, .40, .26))
    greens = [material('leaf-' + str(i), c) for i, c in enumerate([
        (.025, .072, .034), (.043, .115, .043), (.075, .175, .061)])]
    with bpy.data.libraries.load(str(RAW / 'batch1_pine_boulder_fern.blend'), link=False) as (src, dst):
        source_names = list(src.objects)
        dst.objects = src.objects
    sources = dict(zip(source_names, dst.objects))
    assets = []


    def mesh(name, vertices, faces, mat):
        data = bpy.data.meshes.new(name)
        data.from_pydata(vertices, [], faces)
        data.materials.append(mat)
        obj = bpy.data.objects.new(name, data)
        scene.collection.objects.link(obj)
        return obj


    def select(objects):
        bpy.ops.object.select_all(action='DESELECT')
        for o in objects:
            o.select_set(True)
        bpy.context.view_layer.objects.active = objects[0]


    def reduce(obj, limit):
        select([obj])
        tri = obj.modifiers.new('triangulate', 'TRIANGULATE')
        bpy.ops.object.modifier_apply(modifier=tri.name)
        count = len(obj.data.polygons)
        if count > limit:
            dec = obj.modifiers.new('LOD-budget', 'DECIMATE')
            dec.ratio = (limit - 8) / count
            bpy.ops.object.modifier_apply(modifier=dec.name)


    def copy_source(key, name, mat, budget):
        src = sources[key]
        obj = bpy.data.objects.new(name, src.data.copy())
        scene.collection.objects.link(obj)
        obj.matrix_world = src.matrix_world.copy()
        obj.data.materials.clear()
        obj.data.materials.append(mat)
        for p in obj.data.polygons:
            p.material_index = 0
        reduce(obj, budget)
        return obj


    def branch(a, b, radius, objects, mat=wood, sides=7):
        delta = Vector(b) - Vector(a)
        bpy.ops.mesh.primitive_cone_add(vertices=sides, radius1=radius, radius2=radius * .38,
                                        depth=delta.length, location=(Vector(a) + Vector(b)) / 2)
        o = bpy.context.object
        o.rotation_euler = delta.to_track_quat('Z', 'Y').to_euler()
        o.data.materials.append(mat)
        objects.append(o)


    def vertex_shade(obj, strength=.4):
        color = obj.data.color_attributes.new(name='CanopyAO', type='FLOAT_COLOR', domain='CORNER')
        zmin = min(v.co.z for v in obj.data.vertices)
        span = max(v.co.z for v in obj.data.vertices) - zmin or 1
        for poly in obj.data.polygons:
            for li in poly.loop_indices:
                v = obj.data.vertices[obj.data.loops[li].vertex_index]
                ao = (1 - strength) + strength * (v.co.z - zmin) / span
                tint = obj.data.materials[0].diffuse_color
                color.data[li].color = (tint[0]*ao, tint[1]*ao, tint[2]*ao, 1)
        mat = obj.data.materials[0]
        if not mat.node_tree.nodes.get('CanopyAO'):
            node = mat.node_tree.nodes.new('ShaderNodeVertexColor')
            node.name = 'CanopyAO'
            node.layer_name = 'CanopyAO'
            mat.node_tree.links.new(node.outputs['Color'], mat.node_tree.nodes.get('Principled BSDF').inputs['Base Color'])

    def leaf_cluster(center, scale, objects, variant, count=18):
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=1, location=center)
        core = bpy.context.object
        core.scale = (scale*.9, scale*.85, scale*.65)
        core.data.materials.append(greens[variant % 3])
        vertex_shade(core, .5)
        objects.append(core)
        verts, faces = [], []
        for i in range(count):
            a = i*2.399 + rng.uniform(-.3,.3)
            z = rng.uniform(-.6,.7)
            r = math.sqrt(1-z*z)*scale*.86
            c = Vector(center)+Vector((math.cos(a)*r,math.sin(a)*r,z*scale*.8))
            direction = Vector((math.cos(a),math.sin(a),rng.uniform(-.4,.5)))*scale*.46
            side = Vector((-math.sin(a),math.cos(a),.1))*scale*.25
            k = len(verts)
            verts.extend([c-direction,c+side,c+Vector((0,0,.12*scale)),c-side,c+direction])
            faces.extend([(k,k+1,k+2),(k,k+2,k+3),(k+1,k+4,k+2),(k+2,k+4,k+3)])
        leaves = mesh('overlapping-leaves',verts,faces,greens[variant % 3])
        vertex_shade(leaves,.48)
        objects.append(leaves)


    def finish(name, category, parts, source, low):
        select(parts)
        if len(parts)>1:
            bpy.ops.object.join()
        obj = bpy.context.object
        obj.name = name
        bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
        coords = [v.co.copy() for v in obj.data.vertices]
        offset = Vector(((min(v.x for v in coords)+max(v.x for v in coords))/2,
                         (min(v.y for v in coords)+max(v.y for v in coords))/2,min(v.z for v in coords)))
        for v in obj.data.vertices:
            v.co -= offset
        reduce(obj,{'tree':1180,'rock':380,'prop':290}[category])
        entry = {'id':name,'category':category,'source':source,'license':'CC0-1.0','lods':[]}
        for level,budget in [(0,None),(1,low)]:
            lod = obj if level==0 else obj.copy()
            if level:
                lod.data = obj.data.copy()
                scene.collection.objects.link(lod)
                reduce(lod,budget)
            select([lod])
            filename = name+'-lod'+str(level)+'.glb'
            bpy.ops.export_scene.gltf(filepath=str(OUT/filename),use_selection=True,use_active_scene=True,
                                      export_format='GLB',export_yup=True,export_materials='EXPORT',export_image_format='AUTO')
            entry['lods'].append({'level':level,'file':filename,'triangles':len(lod.data.polygons)})
            if level:
                bpy.data.objects.remove(lod,do_unlink=True)
        assets.append((entry,obj))
        obj.hide_render=True


    for i,letter in enumerate('abc'):
        parts=[]
        height=[10.2,11.4,9.0][i]
        branch((0,0,0),(.06,0,height*.96),.22,parts,pinewood,sides=9)
        verts,faces=[],[]
        # Whole photographed sprigs, one large card per branch in overlapping tiers.
        for tier in range(14):
            t=tier/14
            z=height*(.23+.75*t)
            radius=(1-t)*[2.65,2.45,2.8][i]+.18
            for j in range(10):
                angle=j*math.tau/10+tier*1.13+i*.4
                radial=Vector((math.cos(angle),math.sin(angle),0))
                side=Vector((-math.sin(angle),math.cos(angle),0))*radius*.72
                start=radial*.04+Vector((0,0,z+.40))
                end=radial*radius+Vector((0,0,z-.28))
                for tilt in [-.7,0,.7]:
                    spread=side*math.cos(tilt)+Vector((0,0,radius*.72*math.sin(tilt)))
                    k=len(verts)
                    verts.extend([start-spread*.22,start+spread*.22,end+spread,end-spread])
                    faces.append((k,k+1,k+2,k+3))
                if j==0:
                    branch((0,0,z),end,.035*(1-t)+.009,parts,pinewood,sides=5)
        cards=mesh('whole-branch-cutouts',verts,faces,twig)
        uv=cards.data.uv_layers.new()
        for poly in cards.data.polygons:
            for li,coord in zip(poly.loop_indices,[(0,0),(1,0),(1,1),(0,1)]):
                uv.data[li].uv=coord
        finish('tree-pine-'+letter,'tree',parts+[cards],['https://polyhaven.com/a/pine_tree_01'],510)

    for variant in range(3):
        parts=[]
        height=[6.8,8.3,5.6][variant]
        branch((0,0,0),(.15,.1,height*.8),.22,parts)
        for j in range(10):
            a=j*2.399+variant
            z=height*(.48+.42*j/10)
            width=math.sin(math.pi*(j+1)/12)*[2.0,1.8,2.2][variant]
            end=(math.cos(a)*width,math.sin(a)*width,z)
            branch((.1,0,z-.8),end,.075,parts,sides=5)
            leaf_cluster(end,1.3,parts,j)
        finish('tree-broadleaf-'+str(variant+1),'tree',parts,['project-original: tools/assets/blender/lib-build.py'],550)

    # Keep approved source geometry and public exports. Do not rerun their simplifier.
    old_manifest=json.loads((ROOT/'public/world/lib/manifest.json').read_text())
    for entry in old_manifest['assets']:
        if entry['id'].startswith('rock-') or entry['id'] in ('prop-fern','prop-fallen-log'):
            obj=approved.get(entry['id'])
            if obj is None:
                obj=next(o for n,o in approved.items() if n.startswith(entry['id']+'.'))
            scene.collection.objects.link(obj)
            obj.hide_render=True
            assets.append((entry,obj))

    parts=[]
    for j in range(3):
        a=j*2.399
        end=(math.cos(a)*.45,math.sin(a)*.45,.6+j*.1)
        branch((0,0,0),end,.025,parts,sides=5)
        leaf_cluster(end,.63,parts,j,count=14)
    finish('prop-bush','prop',parts,['project-original: tools/assets/blender/lib-build.py'],150)
    verts,faces=[],[]
    for j in range(20):
        a=j*2.399
        radial=Vector((math.cos(a),math.sin(a),0))
        side=Vector((-math.sin(a),math.cos(a),0))*.022
        base=radial*rng.uniform(.01,.17)
        height=rng.uniform(.3,.6)
        mid=base+radial*.045+Vector((0,0,height*.62))
        tip=base+radial*.22+Vector((0,0,height))
        k=len(verts)
        verts.extend([base-side,base+side,mid-side*.65,mid+side*.65,tip])
        faces.extend([(k,k+1,k+2,k+3),(k+2,k+3,k+4)])
    grass=mesh('curved-grass',verts,faces,greens[1])
    vertex_shade(grass,.72)
    finish('prop-grass','prop',[grass],['project-original: tools/assets/blender/lib-build.py'],36)
    # Preserve the original contact-sheet order.
    order=[e['id'] for e in old_manifest['assets']]
    assets.sort(key=lambda item:order.index(item[0]['id']))
    library=bpy.data.collections.new('GFX02-assets')
    for entry,obj in assets:
        library.objects.link(obj)
    bpy.data.libraries.write(str(ROOT/'assets/lib/library.blend'),{library},fake_user=True)
    (OUT/'inventory.json').write_text(json.dumps([a for a,o in assets],indent=2))
    # Preview the actual compressed GLBs in Edge via lib-package.mjs.
    bpy.context.window.scene=previous
    print('GFX02 exported',len(assets),'assets; previous scene restored; no reset.')

finally:
    bpy.context.window.scene = previous
