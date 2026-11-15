"""Original Casuarina equisetifolia studies, dedicated CC0-1.0.
Blender CLI --background --threads 4 --python tools/assets/blender/hr-casuarina.py.
No network. Reuses checksum-verified CC0 Poly Haven bark from the local cache.
Upturned woody scaffolds carry flexible, pendulous photosynthetic branchlets;
the crown deliberately exposes sky between branches. Not a scanned specimen.
"""
import importlib.util
import json
import math
import random
from pathlib import Path
import bpy
import numpy as np
from mathutils import Vector

spec = importlib.util.spec_from_file_location('hr_trees', Path(__file__).with_name('hr-trees.py'))
common = importlib.util.module_from_spec(spec)
spec.loader.exec_module(common)
OUT = common.ROOT / 'tools/assets/blender/hr-casuarina-review/test-results/raw'
OUT.mkdir(parents=True, exist_ok=True)
common.OUT = OUT


def textures():
    photograph = common.photo('pine_bark-diff.jpg')
    luminance = photograph[:, :, :3].mean(axis=2)
    # Grey-brown scaly longitudinal fissures retain the photographic relief.
    y, x = np.mgrid[0:2048, 0:2048]
    grain = luminance[(y//2) % 2048, x]
    bark = np.ones((2048, 2048, 4), dtype=np.float32)
    bark[:, :, :3] = (.26 + grain[:, :, None]*.70) * np.array([.83, .76, .65])
    bark_image = common.image_file('hr-casuarina-bark-color', bark)
    atlas = np.zeros((2048, 2048, 4), dtype=np.float32)
    atlas[:, :, :3] = (.30, .40, .33)  # dilated RGB through transparent gutters
    rng = random.Random(71821)
    def line(tile, a, b, radius, color):
        ox, oy = tile % 2*1024, tile//2*1024
        ax, ay = a; bx, by = b
        x0, x1 = max(0, int(min(ax,bx)-radius-2)), min(1024, int(max(ax,bx)+radius+3))
        y0, y1 = max(0, int(min(ay,by)-radius-2)), min(1024, int(max(ay,by)+radius+3))
        yy, xx = np.mgrid[y0:y1, x0:x1]
        t = np.clip(((xx-ax)*(bx-ax)+(yy-ay)*(by-ay))/max(1,(bx-ax)**2+(by-ay)**2),0,1)
        distance = np.sqrt((xx-ax-(bx-ax)*t)**2+(yy-ay-(by-ay)*t)**2)
        coverage = np.clip(radius+.6-distance,0,1)
        target = atlas[oy+y0:oy+y1, ox+x0:ox+x1]
        mask = coverage > target[:,:,3]
        target[mask,:3] = color
        target[:,:,3] = np.maximum(target[:,:,3],coverage)
    # Four different branchlet fans. Each strand is curved and segmented with
    # subtle nodes, never a broad leaf, opaque ellipse or filled crown disk.
    for tile in range(4):
        line(tile,(512,984),(495+tile*8,650),3,(.24,.29,.22))
        for strand in range(36):
            side = -1 if strand % 2 else 1
            spread = rng.uniform(45,445)*side
            start = np.array([512+rng.uniform(-115,115),rng.uniform(570,950)])
            tip = np.array([512+spread,rng.uniform(55,370)])
            previous = start
            tint = np.array([.30,.42,.35])*rng.uniform(.68,1.30)
            radius = rng.uniform(2.2,4.6)
            for j in range(1,23):
                t = j/22
                point = start*(1-t)+tip*t
                point[0] += side*85*math.sin(t*math.pi)+12*math.sin(t*9+strand)*t
                point[1] += 85*math.sin(t*math.pi)
                line(tile,previous,point,max(.65,radius*(1-.78*t)),tint*(.82 if j%4==0 else 1))
                previous = point
    return bark_image, common.image_file('hr-casuarina-pendulous-branchlets',atlas)


def sprays(items, material, level):
    vertices, faces, coords, shades = [], [], [], []
    for i, (base, yaw, width, length, tile, pigment) in enumerate(items):
        if level and i%3 == 1:
            continue
        side = Vector((math.cos(yaw),math.sin(yaw),0))
        across = Vector((-math.sin(yaw),math.cos(yaw),0))
        k = len(vertices)
        for rib in range(5):
            t = rib/4
            for sign in (-1,1):
                vertices.append(base+side*sign*width*.5+across*math.sin(t*math.pi)*width*.22+Vector((.12*t*t,0,-length*t)))
                coords.append((tile%2*.5+(0 if sign==-1 else .5),tile//2*.5+(1-t)*.5))
                shades.append((*pigment,1))
            if rib<4:
                a=k+rib*2; faces.append((a,a+1,a+3,a+2))
    mesh = bpy.data.meshes.new('casuarina-soft-drooping-sprays')
    mesh.from_pydata(vertices,[],faces); mesh.materials.append(material)
    uv=mesh.uv_layers.new(name='UVMap')
    color=mesh.color_attributes.new(name='Color',type='FLOAT_COLOR',domain='POINT')
    mesh.color_attributes.active_color=color
    for i, shade in enumerate(shades): color.data[i].color=shade
    for face in mesh.polygons:
        face.use_smooth=True
        for li in face.loop_indices: uv.data[li].uv=coords[mesh.loops[li].vertex_index]
    obj=bpy.data.objects.new('casuarina-branchlet-cutout',mesh)
    bpy.context.scene.collection.objects.link(obj)
    return obj


def author(variant, seed, height, bark, leaf):
    rng=random.Random(seed)
    windy=variant=='wind'
    lean=2.0 if windy else .18 if variant=='young' else .35
    def trunk(t): return Vector((lean*t**2.2,.10*math.sin(t*5)*t,height*t))
    radius=.12 if variant=='young' else .23
    stem=([trunk(j/32) for j in range(33)],[radius*(1-j/32)**.9+.006 for j in range(33)])
    limbs, twigs, fans=[],[],[]
    branches=24 if variant=='young' else 32
    for i in range(branches):
        t=.30+.66*(i+.5)/branches
        angle=i*2.399963+rng.uniform(-.20,.20)
        outward=Vector((math.cos(angle),math.sin(angle),0))
        root=trunk(t)
        reach=(2.45 if variant=='young' else 3.7)*(1-(t-.30)/.72)**.72*rng.uniform(.75,1.12)
        rise=.4+reach*.38
        def at(s): return root+outward*reach*s+Vector(((.45 if windy else .03)*s*s,0,rise*s-.27*s*s))
        points=[at(j/6) for j in range(7)]
        limbs.append((points,[max(.002,radius*.25*(1-t)*1.8*(1-j/6)**.8) for j in range(7)]))
        for twig in range(5):
            s=.30+twig*.15
            origin=at(s)
            a=angle+(-1 if twig%2 else 1)*rng.uniform(.35,.9)
            length=reach*(.22+rng.random()*.17)
            direction=Vector((math.cos(a),math.sin(a),.3))
            tip=origin+direction*length
            twigs.append(([origin,origin.lerp(tip,.5)+Vector((0,0,.12)),tip],[.013*(1-t)+.003,.005,.001]))
            for spray in range(3):
                attachment=origin.lerp(tip,.25+spray*.36)
                # Transparent curtains hang from actual woody branchlets.
                width=rng.uniform(.65,1.05)*(1-.25*t)
                drop=rng.uniform(1.0,1.8)*(1-.25*t)
                shade=rng.uniform(.82,1.18)
                fans.append((attachment,a+spray*1.23,width,drop,rng.randrange(4),(shade*.97,shade,shade*1.03)))
    entry=dict(id='hr-tree-casuarina-'+variant,category='tree',architecture='casuarina',
               species='Casuarina equisetifolia',seed=seed,heightMeters=height,license='CC0-1.0',
               source=['https://polyhaven.com/a/pine_bark','https://polyhaven.com/license'],
               derivation='Original Blender geometry-node swept trunk and ascending branches; authored 2K pendulous segmented needle atlas; repigmented cached CC0 bark photograph. Not a scan.',
               delivery='deferred-after-play',textureMaxDimension=2048,branchLevels=3,ivy=False,lods=[])
    for level in (0,1):
        objects=[common.tube_mesh('casuarina-trunk',[stem],bark,12 if level else 22),
                 common.tube_mesh('casuarina-ascending-boughs',limbs[::2] if level else limbs,bark,5 if level else 8),
                 common.tube_mesh('casuarina-fine-twigs',twigs[::2] if level else twigs,bark,4 if level else 5),
                 sprays(fans,leaf,level)]
        # Joining meshes with a leaf Color layer fills missing wood colors with
        # black. Explicit white preserves the photographed bark on every LOD.
        for wood in objects[:-1]:
            color=wood.data.color_attributes.new(name='Color',type='FLOAT_COLOR',domain='POINT')
            wood.data.color_attributes.active_color=color
            for item in color.data: item.color=(1,1,1,1)
        bpy.ops.object.select_all(action='DESELECT')
        for obj in objects: obj.select_set(True)
        bpy.context.view_layer.objects.active=objects[0]; bpy.ops.object.join()
        obj=bpy.context.object; obj.name=entry['id']; obj['species']=entry['species']; obj['seed']=seed
        file=entry['id']+'-lod'+str(level)+'.glb'
        bpy.ops.export_scene.gltf(filepath=str(OUT/file),use_selection=True,use_active_scene=True,export_format='GLB',
            export_yup=True,export_materials='EXPORT',export_extras=True,
            export_vertex_color='NAME',export_vertex_color_name='Color')
        entry['lods'].append(dict(level=level,file=file))
        bpy.data.objects.remove(obj,do_unlink=True)
    print('CASUARINA',variant,'boughs',len(limbs),'sprays',len(fans),flush=True)
    return entry


def main():
    scene=bpy.data.scenes.new('HR Casuarina isolated authoring'); bpy.context.window.scene=scene
    bark_image,leaf_image=textures()
    bark=common.material('hr-casuarina-scaly-bark',bark_image)
    nodes=bark.node_tree.nodes; links=bark.node_tree.links
    normal=nodes.new('ShaderNodeTexImage'); normal.image=bpy.data.images.load(str(common.CACHE/'pine_bark-nor_gl.jpg'))
    normal.image.colorspace_settings.name='Non-Color'
    mapping=nodes.new('ShaderNodeNormalMap'); mapping.inputs['Strength'].default_value=.65
    links.new(normal.outputs['Color'],mapping.inputs['Color']); links.new(mapping.outputs['Normal'],nodes.get('Principled BSDF').inputs['Normal'])
    leaf=common.material('hr-casuarina-branchlet-cutout',leaf_image,True)
    entries=[author(v,s,h,bark,leaf) for v,s,h in [('young',73103,8.5),('mature',73247,14.2),('wind',73411,12.7)]]
    (OUT/'inventory.json').write_text(json.dumps(entries,indent=2)+'\n')


if __name__=='__main__': main()
