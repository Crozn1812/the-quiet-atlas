"""Original CC0 timber/coating bakes and lathed storm lantern. No downloads.
Blender --background --python tools/assets/blender/hr-fix-wood.py
Images are deterministic authored surfaces, not photographic scans.
"""
import bpy
import math
import json
import numpy as np
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
OUT = ROOT / 'tmp/hr-fix-wood/assets'
OUT.mkdir(parents=True, exist_ok=True)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
rng = np.random.default_rng(110515)
size = 2048
y, x = np.mgrid[0:size, 0:size].astype(np.float32) / size

def image(name, values, color=False):
    im = bpy.data.images.new(name, width=size, height=size, alpha=True)
    if not color: im.colorspace_settings.name = 'Non-Color'
    rgba = np.ones((size, size, 4), dtype=np.float32)
    rgba[:, :, :3] = values if values.ndim == 3 else values[:, :, None]
    im.pixels.foreach_set(rgba.ravel())
    im.filepath_raw = str(OUT / (name + '.png'))
    im.file_format = 'PNG'
    im.save()
    return im

def baked_material(name, height, color, roughness, metallic=0):
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    nodes, links = material.node_tree.nodes, material.node_tree.links
    bsdf = nodes.get('Principled BSDF')
    bsdf.inputs['Metallic'].default_value = metallic
    # Periodic finite differences keep repeated timber seams tangent-continuous.
    dx = (np.roll(height, -1, axis=1)-np.roll(height, 1, axis=1))*9
    dy = (np.roll(height, -1, axis=0)-np.roll(height, 1, axis=0))*9
    normals = np.stack((-dx, -dy, np.ones_like(dx)), axis=2)
    normals /= np.linalg.norm(normals, axis=2)[:, :, None]
    maps = {'color': image(name+'-color', color, True), 'normal': image(name+'-normal', normals*.5+.5),
            'roughness': image(name+'-roughness', roughness)}
    for channel, im in maps.items():
        tex = nodes.new('ShaderNodeTexImage'); tex.image = im
        if channel == 'color': links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
        elif channel == 'roughness': links.new(tex.outputs['Color'], bsdf.inputs['Roughness'])
        else:
            normal = nodes.new('ShaderNodeNormalMap')
            links.new(tex.outputs['Color'], normal.inputs['Color'])
            links.new(normal.outputs['Normal'], bsdf.inputs['Normal'])
    return material

# A half-metre wide, two-metre long sawn face. Sinusoidal displacement bends
# fibres around knots; several frequencies prevent broad bark-like blotches.
warp = x + .005*np.sin(y*math.tau*3) + .003*np.sin(y*math.tau*7+x*math.tau*4)
knots = np.zeros_like(x)
for kx, ky, radius in [(.28,.31,.045),(.76,.79,.032),(.61,.52,.017)]:
    xx, yy = x-kx, (y-ky)*3.1
    r = np.sqrt(xx*xx+yy*yy)
    envelope = np.exp(-(r/(radius*2.3))**2)
    warp += xx*envelope*.45
    knots += (np.sin(r*920)*.035 + .20*np.exp(-(r/radius)**2))*envelope
fibres = .5+.5*np.sin(warp*math.tau*151 + np.sin(warp*math.tau*13)*2)
fine = .5+.5*np.sin(warp*math.tau*487 + np.sin(y*math.tau*11)*.4)
pores = rng.random((size,size), dtype=np.float32)
cracks = np.zeros_like(x)
for i in range(17):
    cx, cy = rng.uniform(0,1,2); length=rng.uniform(.03,.16)
    curve = cx+.0015*np.sin(y*math.tau*5+i)
    cracks += np.exp(-((x-curve)*size*.8)**2)*np.exp(-((y-cy)/length)**8)
height = fibres*.028 + fine*.008 + pores*.007 - cracks*.16 - knots*.11
tone = .42 + fibres*.40 + fine*.085 + pores*.035 - knots - cracks*.23
color = np.clip(tone[:,:,None]*np.array([.56,.43,.29]),0,1)
wood = baked_material('sawn-timber',height,color,np.clip(.78+fibres*.1+cracks*.12,0,1))

# Neutral, salt-pitted coating: geometry vertex pigments retain white/red/grey.
noise = rng.random((size,size),dtype=np.float32)
pits = np.maximum(0, noise-.94)*11
streak = .5+.5*np.sin(x*math.tau*143+np.sin(y*math.tau*3))
coating = baked_material('coastal-coating',noise*.012-pits*.07,
    np.repeat((.72+noise*.13-pits*.30+streak*.025)[:,:,None],3,axis=2),
    np.clip(.55+noise*.25+pits*.18,0,1), .3)

def plain(name, color, metal=0, rough=.4, alpha=1, emission=None):
    mat=bpy.data.materials.new(name); mat.use_nodes=True
    node=mat.node_tree.nodes.get('Principled BSDF')
    node.inputs['Base Color'].default_value=(*color,alpha)
    node.inputs['Metallic'].default_value=metal
    node.inputs['Roughness'].default_value=rough
    node.inputs['Alpha'].default_value=alpha
    if alpha<1: mat.surface_render_method='DITHERED'
    if emission:
        node.inputs['Emission Color'].default_value=(*emission,1)
        node.inputs['Emission Strength'].default_value=2.4
    return mat
iron=plain('oxidised-lantern-iron',(.065,.071,.062),.72,.46)
brass=plain('worn-lantern-rivets',(.30,.20,.095),.7,.38)
glass=plain('smoked-clear-glass',(.67,.72,.61),0,.13,.21)
wick=plain('warm-wick',(.9,.30,.035),0,.8,1,(1,.25,.025))

def cube(name, mat):
    bpy.ops.mesh.primitive_cube_add(size=1)
    obj=bpy.context.object; obj.name=name; obj.data.materials.append(mat)
    bevel=obj.modifiers.new('worn arris','BEVEL'); bevel.width=.012; bevel.segments=3
    bpy.context.view_layer.objects.active=obj; bpy.ops.object.modifier_apply(modifier=bevel.name)
    return obj

def lathe(name, profile, mat, sides=48):
    verts=[]; faces=[]
    for radius,z in profile:
        verts.extend((radius*math.cos(j/sides*math.tau),radius*math.sin(j/sides*math.tau),z) for j in range(sides))
    for row in range(len(profile)-1):
        for j in range(sides):
            a=row*sides+j;b=row*sides+(j+1)%sides
            faces.append((a,b,b+sides,a+sides))
    faces.extend([tuple(reversed(range(sides))),tuple(range((len(profile)-1)*sides,len(profile)*sides))])
    mesh=bpy.data.meshes.new(name);mesh.from_pydata(verts,[],faces);mesh.materials.append(mat)
    obj=bpy.data.objects.new(name,mesh);bpy.context.collection.objects.link(obj)
    for p in mesh.polygons:p.use_smooth=True
    return obj

def torus(major, minor, location, mat, rotation=(0,0,0)):
    bpy.ops.mesh.primitive_torus_add(major_radius=major,minor_radius=minor,major_segments=40,minor_segments=8,location=location,rotation=rotation)
    obj=bpy.context.object;obj.data.materials.append(mat)
    for p in obj.data.polygons:p.use_smooth=True
    return obj

def export(name, objects):
    # One primitive per material, independent of authored modelling pieces.
    groups={}
    for obj in objects:groups.setdefault(obj.data.materials[0].name,[]).append(obj)
    objects=[]
    for group in groups.values():
        bpy.ops.object.select_all(action='DESELECT')
        for obj in group:obj.select_set(True)
        bpy.context.view_layer.objects.active=group[0]
        bpy.ops.object.join();objects.append(bpy.context.object)
    for level in [0,1]:
        if level==1:
            for obj in objects:
                bpy.context.view_layer.objects.active=obj
                decimate=obj.modifiers.new('distance LOD','DECIMATE');decimate.ratio=.32
                bpy.ops.object.modifier_apply(modifier=decimate.name)
        bpy.ops.object.select_all(action='DESELECT')
        for obj in objects:obj.select_set(True)
        bpy.context.view_layer.objects.active=objects[0]
        bpy.ops.export_scene.gltf(filepath=str(OUT/(name+f'-lod{level}.glb')),export_format='GLB',use_selection=True,export_yup=True,export_tangents=True)
    for obj in objects:bpy.data.objects.remove(obj,do_unlink=True)

export('hr-prop-sawn-timber',[cube('material-carrier',wood)])
export('hr-prop-coastal-coating',[cube('material-carrier',coating)])
parts=[
    lathe('rolled-foot',[(.06,-.79),(.13,-.785),(.155,-.77),(.159,-.74),(.153,-.72),(.125,-.69),(.12,-.66)],iron),
    lathe('vented-hood',[(.18,-.39),(.187,-.38),(.188,-.362),(.174,-.351),(.13,-.34),(.095,-.28),(.065,-.263),(.065,-.25)],iron),
    lathe('glass-chimney',[(.10,-.68),(.125,-.64),(.133,-.58),(.13,-.49),(.115,-.405)],glass),
    lathe('burner-collar',[(.045,-.68),(.05,-.65),(.045,-.63),(.02,-.625)],brass),
    lathe('wick-flame',[(.013,-.63),(.019,-.60),(.014,-.57),(.003,-.535)],wick,24),
    torus(.117,.009,(0,0,-.68),brass),
    torus(.128,.011,(0,0,-.41),iron),
    torus(.129,.012,(0,0,-.135),iron,(math.pi/2,0,0)),
]
for sign in [-1,1]:
    bar=lathe('curved-cage-rib',[(.012,-.72),(.013,-.67),(.012,-.4),(.012,-.35)],iron,16)
    bar.location.x=sign*.151;parts.append(bar)
    rivet=lathe('brass-rivet',[(.023,0),(.024,.008),(.016,.016)],brass,20)
    rivet.rotation_euler.x=math.pi/2;rivet.location=(sign*.15,-.023,-.39);parts.append(rivet)
for j in range(12):
    # Raised hood seam ribs remain within the original hanging envelope.
    a=j*math.tau/12
    obj=lathe('hood-rib',[(.003,-.34),(.004,-.30)],brass,8)
    obj.location=(math.cos(a)*.104,math.sin(a)*.104,0);parts.append(obj)
export('hr-prop-storm-lantern',parts)
(OUT/'inventory.json').write_text(json.dumps(['hr-prop-sawn-timber','hr-prop-coastal-coating','hr-prop-storm-lantern']))
print('HR-FIX-WOOD authored 3 assets; original CC0; no downloads')
