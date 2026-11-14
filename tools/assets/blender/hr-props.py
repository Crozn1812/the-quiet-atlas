"""Deterministic CC0 authoring. Blender --background --python hr-props.py.

Photographs are already cached and verified; this script never downloads.
Original curved leaves, pinnate fronds, swept wood and eroded stones are CC0.
"""
import bpy
import hashlib
import json
import math
import random
from pathlib import Path
import numpy as np
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[3]
OUT = ROOT / 'tmp/hr-props'
OUT.mkdir(parents=True, exist_ok=True)
CACHE = ROOT / 'tmp/gfx-p2'
SOURCES = json.loads((ROOT / 'tools/assets/textures/cc0-sources.json').read_text())['sources']
for record in SOURCES:
    if record['id'] in ('pine_bark', 'forest_floor', 'river_small_rocks'):
        for item in record['maps'].values():
            if hashlib.sha256((CACHE / item['file']).read_bytes()).hexdigest() != item['sha256']:
                raise ValueError('Source checksum mismatch: ' + item['file'])

bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)

def pixels(name):
    image = bpy.data.images.load(str(CACHE / name), check_existing=True)
    return np.array(image.pixels[:], dtype=np.float32).reshape(image.size[1], image.size[0], 4)

def save_image(name, values):
    image = bpy.data.images.new(name, width=2048, height=2048, alpha=True)
    image.pixels.foreach_set(values.astype(np.float32).ravel())
    image.filepath_raw = str(OUT / (name + '.png'))
    image.file_format = 'PNG'
    image.save()
    return image

def atlas(map_name):
    # Four 1024-pixel tiles: stone, bark, living foliage, moss/fungus.
    image = np.ones((2048, 2048, 4), np.float32)
    for tile, source in enumerate(('river_small_rocks', 'pine_bark', 'forest_floor', 'forest_floor')):
        photo = pixels(source + '-' + map_name + '.jpg')[::2, ::2].copy()
        if map_name == 'diff' and tile >= 2:
            luma = photo[:, :, :3].mean(axis=2)
            if tile == 2:
                y, x = np.mgrid[0:1024, 0:1024] / 1023
                vein = np.exp(-((x-.5)*145)**2) + .12*np.exp(-(np.sin((y + abs(x-.5)*.38)*105)*18)**2)
                photo[:, :, :3] = (.48 + luma[:, :, None]*.65) * np.array([.20, .40, .075])
                photo[:, :, :3] += vein[:, :, None] * np.array([.07, .09, .02])
            else:
                stone = pixels('river_small_rocks-diff.jpg')[::2, ::2]
                y, x = np.mgrid[0:1024, 0:1024] / 1023
                growth = np.clip((np.sin(x*17+y*9) + np.cos(y*23-x*8))*.5 + luma*2-.55, 0, 1)
                moss = (.3 + luma[:, :, None]) * np.array([.20, .29, .055])
                photo[:, :, :3] = stone[:, :, :3]*(1-growth[:, :, None]) + moss*growth[:, :, None]
        if map_name == 'diff' and tile == 1:
            # Small warm ivory islands for fungi/petals, retaining photographic grain.
            luma = photo[880:1024, 880:1024, :3].mean(axis=2)
            photo[880:1024, 880:1024, :3] = (.5 + luma[:, :, None]*.6)*np.array([.86,.72,.48])
        ox, oy = tile % 2 * 1024, tile // 2 * 1024
        # Duplicate border pixels to prevent mip bleed into adjacent pigments.
        image[oy:oy+1024, ox:ox+1024] = photo
    return save_image('hr-prop-atlas-' + map_name, image)

material = bpy.data.materials.new('hr-props-photographic-pbr')
material.use_nodes = True
nodes, links = material.node_tree.nodes, material.node_tree.links
bsdf = nodes.get('Principled BSDF')
for channel in ('diff', 'nor_gl', 'rough'):
    tex = nodes.new('ShaderNodeTexImage')
    tex.image = atlas(channel)
    if channel != 'diff': tex.image.colorspace_settings.name = 'Non-Color'
    if channel == 'diff': links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
    elif channel == 'rough': links.new(tex.outputs['Color'], bsdf.inputs['Roughness'])
    else:
        normal = nodes.new('ShaderNodeNormalMap')
        normal.inputs['Strength'].default_value = .55
        links.new(tex.outputs['Color'], normal.inputs['Color'])
        links.new(normal.outputs['Normal'], bsdf.inputs['Normal'])
material.use_backface_culling = False

class Builder:
    def __init__(self, name, lod, seed):
        self.name, self.lod, self.rng = name, lod, random.Random(seed)
        self.vertices, self.faces, self.uvs = [], [], []

    def vertex(self, p, uv, tile):
        if tile == 4:
            tile, uv = 1, (.88+uv[0]*.10, .88+uv[1]*.10)
        self.vertices.append(tuple(p))
        self.uvs.append(((tile % 2 + .012 + uv[0]*.976)/2, (tile // 2 + .012 + uv[1]*.976)/2))
        return len(self.vertices)-1

    def leaf(self, origin, direction, length, width, tile=2, bend=.15):
        # A folded, curved blade with a continuous central vein, never a billboard.
        axis = Vector(direction).normalized()
        across = axis.cross(Vector((0, 0, 1)))
        if across.length < .01: across = axis.cross(Vector((0, 1, 0)))
        across.normalize()
        up = across.cross(axis).normalized()
        segments = 7 if self.lod == 0 else 3
        rows = []
        for i in range(segments+1):
            t = i/segments
            center = Vector(origin) + axis*(length*t) + up*(math.sin(t*math.pi*.8)*length*bend)
            spread = max(.003, math.sin(math.pi*t)**.8)*width*.5
            rows.append([self.vertex(center + across*spread*s - up*abs(s)*width*.12, ((s+1)/2, t), tile) for s in (-1, 0, 1)])
        for a, b in zip(rows, rows[1:]):
            for j in range(2): self.faces.append((a[j], b[j], b[j+1], a[j+1]))

    def tube(self, points, radii, tile=1, sides=None):
        sides = sides or (14 if self.lod == 0 else 7)
        rows = []
        for i, p in enumerate(points):
            axis = (Vector(points[min(i+1,len(points)-1)]) - Vector(points[max(i-1,0)])).normalized()
            across = axis.cross(Vector((0,1,0)))
            if across.length < .01: across = axis.cross(Vector((1,0,0)))
            across.normalize(); up = axis.cross(across).normalized()
            rows.append([self.vertex(Vector(p) + radii[i]*(across*math.cos(j/sides*math.tau)+up*math.sin(j/sides*math.tau)), (j/sides, i/max(1,len(points)-1)), tile) for j in range(sides+1)])
        for a, b in zip(rows, rows[1:]):
            for j in range(sides): self.faces.append((a[j], a[j+1], b[j+1], b[j]))
        self.faces.extend([tuple(reversed(rows[0][:-1])), tuple(rows[-1][:-1])])

    def fern(self, variant, origin=(0,0,0), scale=1):
        count = (12, 16, 9)[variant] if self.lod == 0 else (7, 9, 5)[variant]
        for i in range(count):
            angle = i*2.399963 + variant*.37
            length = scale*self.rng.uniform(.55, 1.1)
            nodes = 15 if self.lod == 0 else 8
            points = [Vector(origin)+Vector((math.cos(angle)*length*t, math.sin(angle)*length*t, scale*(.08+.52*math.sin(t*math.pi*.83)))) for t in np.linspace(0,1,nodes)]
            self.tube(points, [scale*.009*(1-j/nodes*.85) for j in range(nodes)], 1, 5)
            for j in range(1,nodes):
                t = j/nodes
                for side in (-1,1):
                    direction = (math.cos(angle+side*1.05), math.sin(angle+side*1.05), .1-t*.3)
                    self.leaf(points[j], direction, length*.25*math.sin(t*math.pi)**.7, scale*(.05 if variant != 2 else .095), bend=.11)

    def bush(self, variant):
        stems = (18, 35, 25, 13)[variant] if self.lod == 0 else (10, 18, 13, 7)[variant]
        for i in range(stems):
            angle = i*2.399963
            height = self.rng.uniform(.42,1.05)
            tip = Vector((math.cos(angle)*.45, math.sin(angle)*.45, height))
            points = [Vector((tip.x*t*t,tip.y*t*t,height*t)) for t in np.linspace(0,1,7)]
            self.tube(points, [.014*(1-j/8) for j in range(7)], 1, 6)
            for j in range(2,7):
                for side in (-1,1):
                    a = angle+side*1.2+j*.3
                    length = (.30,.24,.19,.34)[variant]*self.rng.uniform(.7,1.3)
                    width = (.15,.026,.085,.035)[variant]
                    self.leaf(points[j], (math.cos(a),math.sin(a),.08), length,width)
            if variant == 2 and i%3 == 0:
                for petal in range(5):
                    a=petal*math.tau/5
                    self.leaf(tip,(math.cos(a),math.sin(a),.3),.045,.027,4,bend=.3)

    def rock(self, variant):
        sides, rings = (48,25) if self.lod == 0 else (20,12)
        rows=[]
        for i in range(rings+1):
            v=i/rings; phi=v*math.pi
            row=[]
            for j in range(sides+1):
                u=j/sides; a=u*math.tau
                erosion=1+.065*math.sin(a*5+v*17+variant)+.035*math.sin(a*11-v*23)
                if variant in (1,4): erosion=1+.018*math.sin(a*3+v*7)
                x=math.sin(phi)*math.cos(a)*erosion
                y=math.sin(phi)*math.sin(a)*erosion*.8
                z=max(.025,(math.cos(phi)+1)*(.13 if variant in (2,5) else .39))
                if variant in (2,5): z += .015*math.sin(a*8+v*19)
                tile=3 if variant>=3 else 0
                row.append(self.vertex((x,y,z),(u,v),tile))
            rows.append(row)
        for a,b in zip(rows,rows[1:]):
            for j in range(sides): self.faces.append((a[j],b[j],b[j+1],a[j+1]))

    def log(self, variant):
        nodes=36 if self.lod==0 else 16
        points=[(t*2.8-1.4,.06*math.sin(t*8),.25+.07*math.sin(t*5)) for t in np.linspace(0,1,nodes)]
        self.tube(points,[.22*(1+.10*math.sin(j*.9)) for j in range(nodes)],1,32 if self.lod==0 else 14)
        for i in range(9 if self.lod==0 else 5):
            x=-1.1+i*.24
            # Layered bracket fungi anchored into the decayed wood.
            self.leaf((x,.13,.29),(0,1,.04),.21,.25,4,bend=.12)
            self.leaf((x,-.12,.33),(0,-1,.03),.16,.2,3,bend=.16)
        for i in range(6):
            self.leaf((-.8+i*.3,.02,.46),(1,.2,.01),.3,.16,3,bend=.02)
        if variant:
            self.tube([(1,0,.25),(1.2,.3,.5),(1.3,.6,.55)],[.10,.065,.025])

    def palm(self, variant):
        height=(6.5,8.2,5.1)[variant]
        lean=(.65,1.45,-.5)[variant]
        nodes=42 if self.lod==0 else 18
        points=[(lean*t*t,.12*math.sin(t*3),height*t) for t in np.linspace(0,1,nodes)]
        self.tube(points,[.14*(1-.47*j/nodes)*(1+.035*math.sin(j*3.1)) for j in range(nodes)],1,22 if self.lod==0 else 11)
        crown=Vector(points[-1]); fronds=16 if self.lod==0 else 10
        for i in range(fronds):
            angle=i*2.399963+variant
            length=self.rng.uniform(1.8,2.7)
            segments=22 if self.lod==0 else 11
            path=[crown+Vector((math.cos(angle)*length*t,math.sin(angle)*length*t,length*(.7*t-1.1*t*t))) for t in np.linspace(0,1,segments)]
            self.tube(path,[.027*(1-j/segments*.94) for j in range(segments)],1,5)
            for j in range(1,segments):
                t=j/segments
                for side in (-1,1):
                    a=angle+side*1.1
                    self.leaf(path[j],(math.cos(a),math.sin(a),-.35),length*.26*math.sin(t*math.pi)**.65,.055 if self.lod==0 else .08,bend=.06)
        for i in range(4):
            a=i*1.6
            self.tube([crown+Vector((math.cos(a)*.13,math.sin(a)*.13,-.12)),crown+Vector((math.cos(a)*.15,math.sin(a)*.15,-.36))],[.12,.085],1,10)

    def grass(self):
        for i in range(160 if self.lod==0 else 65):
            a=i*2.399963; r=self.rng.random()**.5*.45
            self.leaf((math.cos(a)*r,math.sin(a)*r,0),(math.cos(a)*.35,math.sin(a)*.35,1),self.rng.uniform(.3,.9),.018,bend=.25)

    def export(self):
        mesh=bpy.data.meshes.new(self.name)
        mesh.from_pydata(self.vertices,[],self.faces); mesh.update()
        uv=mesh.uv_layers.new(name='UVMap')
        for loop in mesh.loops: uv.data[loop.index].uv=self.uvs[loop.vertex_index]
        for poly in mesh.polygons: poly.use_smooth=True
        obj=bpy.data.objects.new(self.name,mesh); bpy.context.collection.objects.link(obj)
        obj.data.materials.append(material)
        bpy.ops.object.select_all(action='DESELECT'); obj.select_set(True); bpy.context.view_layer.objects.active=obj
        file=f'{self.name}-lod{self.lod}.glb'
        bpy.ops.export_scene.gltf(filepath=str(OUT/file),use_selection=True,export_format='GLB',export_materials='EXPORT',export_yup=True)
        triangles=sum(len(p.vertices)-2 for p in mesh.polygons)
        bounds={'min':[min(v.co[i] for v in mesh.vertices) for i in range(3)],'max':[max(v.co[i] for v in mesh.vertices) for i in range(3)]}
        bpy.data.objects.remove(obj,do_unlink=True); bpy.data.meshes.remove(mesh)
        return {'level':self.lod,'file':file,'triangles':triangles,'authoringBoundsZup':bounds}

specs=[]
for variant,name in enumerate(('broadleaf','needle','wildflower','bamboo')): specs.append(('hr-prop-bush-'+name,'bush',variant))
for variant,name in enumerate(('arching','sword','round')): specs.append(('hr-prop-fern-'+name,'fern',variant))
for variant,name in enumerate(('boulder','river','slate','moss-boulder','moss-river','moss-slate')): specs.append(('hr-rock-'+name,'rock',variant))
for variant,name in enumerate(('fungi','moss')): specs.append(('hr-prop-log-'+name,'log',variant))
for variant,name in enumerate(('coconut','leaning','shore')): specs.append(('hr-palm-'+name,'palm',variant))
specs.append(('hr-prop-grass-meadow','grass',0))
inventory=[]
for index,(name,kind,variant) in enumerate(specs):
    entry={'id':name,'category':'tree' if kind=='palm' else 'rock' if kind=='rock' else 'prop','seed':18401+index*997,'license':'CC0-1.0','source':['https://polyhaven.com/a/forest_floor','https://polyhaven.com/a/pine_bark','https://polyhaven.com/a/river_small_rocks'],'derivation':'Original Blender curved meshes; verified cached CC0 photographs; no downloaded assets','lods':[]}
    for lod in (0,1):
        builder=Builder(name,lod,entry['seed']); getattr(builder,kind)(variant) if kind!='grass' else builder.grass()
        entry['lods'].append(builder.export())
    inventory.append(entry)
(OUT/'inventory.json').write_text(json.dumps(inventory,indent=2))
print('HR-PROPS authored',len(inventory),'assets /',len(inventory)*2,'LODs')
