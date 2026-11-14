"""HR-TREE1b: deterministic, metre-scale bamboo; original work dedicated CC0.

Run Blender CLI --background --threads 4 --python this-file. No network.
Photographic inputs are the SHA-verified, previously licensed Poly Haven cache.
These are authored bamboo studies, not bamboo scans. See bamboo handoff.
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
OUT, CACHE = common.OUT, common.CACHE


def maps():
    # Smooth longitudinal culm grain: average across the existing bark photo,
    # stretch along the culm, repigment. No pine-bark cracks on bamboo.
    bark = common.photo('pine_bark-diff.jpg')[:, :, :3].mean(axis=2)
    y, x = np.mgrid[0:2048, 0:2048]
    grain = bark[(y // 7) % 2048, x]
    grain = sum(np.roll(grain, i, axis=1) for i in range(-7, 8)) / 15
    fleck = .008 * np.sin(x * 1.71 + y * .13)
    pigment = .66 + grain * .55 + .028 * np.sin(x * .041) + fleck
    culm = np.ones((2048, 2048, 4), dtype=np.float32)
    culm[:, :, :3] = pigment[:, :, None] * np.array([.44, .52, .23])
    # Small wax bloom and age streaks, not painted-on fake nodes.
    bloom = np.maximum(0, np.sin(x*.016 + np.sin(y*.004))-.85)*.21
    culm[:, :, :3] += bloom[:, :, None]

    # Four single, long pointed leaf islands. Photo samples supply surface
    # variation; outline, parallel veins and midrib are original authoring.
    floor = common.photo('forest_floor-diff.jpg')
    atlas = np.zeros((2048, 2048, 4), dtype=np.float32)
    for tile in range(4):
        yy, xx = np.mgrid[0:1024, 0:1024]
        t = (yy-35)/954
        center = 512 + (tile-1.5)*15*np.sin(np.clip(t,0,1)*math.pi)
        half = (94 + tile*7) * np.sin(np.clip(t,0,1)*math.pi)**.85 * (1-.36*np.clip(t,0,1))
        across = (xx-center)/np.maximum(half,1)
        mask = (t>0)&(t<1)&(np.abs(across)<1)
        sample = floor[(650+yy//3+tile*127)%2048, (1200+xx//2+tile*83)%2048, :3].mean(axis=2)
        luma = .67 + sample*.58 + .045*np.cos(across*33+t*8)
        rgb = luma[:, :, None]*np.array([.16+tile*.012, .32+tile*.014, .065])
        rgb += (np.exp(-((xx-center)/2.7)**2)*.11)[:, :, None]*np.array([.6,.8,.24])
        rgb *= (1-.17*np.abs(across).clip(0,1))[:, :, None]
        oy, ox = tile//2*1024, tile%2*1024
        atlas[oy:oy+1024, ox:ox+1024, :3] = rgb
        atlas[oy:oy+1024, ox:ox+1024, 3] = mask
    return common.image_file('hr-bamboo-culm', culm), common.image_file('hr-bamboo-lanceolate', atlas)


def mark(obj, weight, tint=(1,1,1), tip=False):
    mesh = obj.data
    wind = mesh.attributes.new('_HR_WIND', 'FLOAT', 'POINT')
    color = mesh.color_attributes.new(name='Color', type='FLOAT_COLOR', domain='POINT')
    mesh.color_attributes.active_color = color
    for i, vertex in enumerate(mesh.vertices):
        wind.data[i].value = weight * (min(1,max(0,vertex.co.z)/12) if not tip else 1)
        color.data[i].color = (*tint, 1)
    return obj


def blades(items, mat, level, name='bamboo-leaf-cutout', dry=False):
    verts, faces, uvcoords = [], [], []
    for i, (base, direction, length, width, tile) in enumerate(items):
        if level and i%3 == 1:
            continue  # Drop whole leaves; never collapse the pointed silhouette.
        axis = direction.normalized()
        side = axis.cross(Vector((.15,.11,1))).normalized()
        if side.length<.1:
            side=Vector((1,0,0))
        k=len(verts)
        # Two folded, drooping halves; measured length/width is 9-15:1.
        middle=base+axis*length*.48+Vector((0,0,-length*.07))
        tip=base+axis*length+Vector((0,0,-length*.24))
        verts.extend([base-side*width*.16,base+side*width*.16,
                      middle-side*width*.5,middle+axis.cross(side)*width*.16,
                      middle+side*width*.5,tip])
        faces.extend([(k,k+2,k+3,k+1),(k+1,k+3,k+4),(k+2,k+5,k+3),(k+3,k+5,k+4)])
        u,v=tile%2*.5,tile//2*.5
        uvcoords.extend([(u+.195,v+.02),(u+.305,v+.02),(u+.195,v+.25),
                         (u+.25,v+.25),(u+.305,v+.25),(u+.25,v+.49)])
    mesh=bpy.data.meshes.new(name);mesh.from_pydata(verts,[],faces);mesh.materials.append(mat)
    uv=mesh.uv_layers.new(name='UVMap')
    for face in mesh.polygons:
        face.use_smooth=True
        for li in face.loop_indices:
            uv.data[li].uv=uvcoords[mesh.loops[li].vertex_index]
    obj=bpy.data.objects.new(name,mesh);bpy.context.scene.collection.objects.link(obj)
    return mark(obj,0 if dry else 1,(1.35,.85,.5) if dry else (1,1,1),True)


def author(name, seed, culm_mat, node_mat, leaf_mat, dry_mat):
    rng=random.Random(seed)
    riverside=name=='bamboo-riverside'
    arching=name=='bamboo-arching'
    count=13 if riverside else 17 if arching else 19
    stems, collars, branches, leaves, shoots, litter, sheaths=[],[],[],[],[],[],[]
    for stem in range(count):
        angle=stem*2.39996+rng.uniform(-.18,.18)
        spread=rng.uniform(.25,1.25)
        base=Vector((math.cos(angle)*spread,math.sin(angle)*spread,0))
        height=rng.uniform(10.3,14.8) if not riverside else rng.uniform(9.8,12.7)
        bend=(5.3 if arching else 4.5 if riverside else 2.3)*rng.uniform(.65,1.15)
        outward=Vector((math.cos(angle),math.sin(angle),0))
        if riverside:
            outward=Vector((.85+math.cos(angle)*.3,math.sin(angle)*.7,0)).normalized()
        radius=rng.uniform(.065,.105)
        tip_drop=.29 if arching else .22 if riverside else .10

        def at(t):
            return base+outward*bend*t**2.7+Vector((.07*math.sin(t*8+stem)*t,.04*math.sin(t*10)*t,height*(t-tip_drop*t**5)))

        nodes=round(height/.42)
        steps=nodes*3
        points=[at(i/steps) for i in range(steps+1)]
        radii=[max(.004,radius*(1-.97*(i/steps)**2.7)*(.985+.015*math.sin(i*math.pi/1.5))) for i in range(steps+1)]
        stems.append((points,radii))
        for node in range(1,nodes):
            t=node/nodes
            c=at(t);tangent=(at(min(1,t+.002))-at(t-.002)).normalized()
            side=tangent.cross(Vector((1,0,0))).normalized();cross=tangent.cross(side)
            rad=max(.004,radius*(1-.97*t**2.7))
            ring=[c+(side*math.cos(a*math.tau/16)+cross*math.sin(a*math.tau/16))*rad*1.065 for a in range(17)]
            collars.append((ring,[max(.003,rad*.065)]*17))
            if node<3:
                sheaths.append((c, (outward*.4+Vector((0,0,1))).normalized(), .34, .20, stem%4))
            # Nodes on the lower half stay readable; upper nodes bear airy fans.
            if t<(.42 if stem%3 else .53) or node%2:
                continue
            a=angle+node*2.4+rng.uniform(-.3,.3)
            direct=Vector((math.cos(a),math.sin(a),rng.uniform(.15,.45)))
            length=rng.uniform(.9,1.8)*(1-.25*t)
            bp=[c+direct*length*s+Vector((0,0,-.30*length*s*s)) for s in (0,.25,.5,.75,1)]
            branches.append((bp,[.009,.007,.005,.003,.0015]))
            for twig in range(4):
                origin=bp[2+twig%3]
                ta=a+(-.7 if twig%2 else .7)
                td=Vector((math.cos(ta),math.sin(ta),rng.uniform(-.15,.25)))
                tl=rng.uniform(.45,.85)
                tp=[origin+td*tl*s+Vector((0,0,-.14*s*s)) for s in (0,.5,1)]
                branches.append((tp,[.004,.0025,.001]))
                for j in range(7):
                    f=.08+j*.12
                    lb=origin+td*tl*f+Vector((0,0,-.14*f*f))
                    la=ta+((-1 if j%2 else 1)*rng.uniform(.5,1.05))
                    ld=Vector((math.cos(la),math.sin(la),rng.uniform(-.35,.18)))
                    ll=rng.uniform(.28,.46)
                    leaves.append((lb,ld,ll,ll/rng.uniform(9,12),rng.randrange(4)))
    for i in range(6):
        a=i*2.4;p=Vector((math.cos(a)*1.35,math.sin(a)*1.35,0));h=rng.uniform(.30,.95)
        shoots.append(([p+Vector((.08*s,0,h*s)) for s in (0,.25,.5,.75,1)], [.105,.085,.06,.035,.002]))
    for i in range(95):
        a=rng.random()*math.tau;r=rng.random()**.5*2.15
        p=Vector((math.cos(a)*r,math.sin(a)*r,.018+rng.random()*.025))
        litter.append((p,Vector((math.cos(a+1),math.sin(a+1),.02)),rng.uniform(.16,.32),.028,rng.randrange(4)))
    entry=dict(id='hr-tree-'+name,category='tree',license='CC0-1.0',
        source=['https://polyhaven.com/a/pine_bark','https://polyhaven.com/a/forest_floor'],
        seed=seed,architecture='bamboo',branchLevels=3,ivy=False,lods=[],
        culmCount=count,nodeSpacingMeters=.42,leafAspectRatio=[9,14],habitat='river' if riverside else 'edge',
        wind=dict(attribute='_HR_WIND',culmMax=.12,branchMax=.36,leaf=1,
                  runtime='Existing HR material alpha-cutout classification adds leaf flutter; _HR_WIND reserved for per-vertex weighting.'),
        derivation='Original Blender swept segmented culms; smooth repigmented Poly Haven pine_bark grain; authored lanceolate outlines/veins with forest_floor photo variation; shoots/sheaths/litter; no bamboo scan claim')
    for level in (0,1):
        objects=[mark(common.tube_mesh('bamboo-culms',[(p[::2]+([p[-1]] if len(p)%2==0 else []),r[::2]+([r[-1]] if len(r)%2==0 else [])) for p,r in stems] if level else stems,culm_mat,8 if level else 14),.12),
            mark(common.tube_mesh('bamboo-node-collars',collars,node_mat,4 if level else 6),.12,(1.38,1.25,.85)),
            mark(common.tube_mesh('bamboo-branchlets',branches[::2] if level else branches,culm_mat,4 if level else 6),.36),
            blades(leaves,leaf_mat,level),
            mark(common.tube_mesh('bamboo-shoots',shoots,dry_mat,8 if level else 12),0,(.65,.55,.38)),
            blades(litter+sheaths,dry_mat,level,'bamboo-dry-sheaths-litter',True)]
        bpy.ops.object.select_all(action='DESELECT')
        for obj in objects:obj.select_set(True)
        bpy.context.view_layer.objects.active=objects[0];bpy.ops.object.join()
        obj=bpy.context.object;obj.name=entry['id']
        obj['hrArchitecture']='bamboo';obj['hrSeed']=seed;obj['hrCulmCount']=count
        obj['hrWindAttribute']='_HR_WIND: culm <= .12; branch <= .36; leaf = 1; litter = 0'
        filename=entry['id']+'-lod'+str(level)+'.glb'
        bpy.ops.export_scene.gltf(filepath=str(OUT/filename),use_selection=True,use_active_scene=True,
            export_format='GLB',export_yup=True,export_materials='EXPORT',export_extras=True,export_attributes=True,
            export_vertex_color='NAME',export_vertex_color_name='Color')
        entry['lods'].append(dict(level=level,file=filename))
        bpy.data.objects.remove(obj,do_unlink=True)
    print('BAMBOO',entry['id'],'culms',len(stems),'nodes',len(collars),'leaves',len(leaves),flush=True)
    return entry


def main():
    scene=bpy.data.scenes.new('HR-TREE1b isolated bamboo');bpy.context.window.scene=scene
    culm_image,leaf_image=maps()
    culm=common.material('hr-bamboo-culm',culm_image)
    culm.node_tree.nodes.get('Principled BSDF').inputs['Roughness'].default_value=.61
    node=common.material('hr-bamboo-node',culm_image)
    leaf=common.material('hr-bamboo-leaf-cutout',leaf_image,True)
    dry=common.material('hr-bamboo-dry',culm_image)
    entries=[author(name,seed,culm,node,leaf,dry) for name,seed in
             [('bamboo-clump',62767),('bamboo-arching',62978),('bamboo-riverside',64361)]]
    (OUT/'bamboo-inventory.json').write_text(json.dumps(entries,indent=2)+'\n')


if __name__=='__main__':main()
