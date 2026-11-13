"""GFX-P3: refine the three GFX-02 original broadleaf trees, offline.

Execute through Blender MCP 9876. No scene reset, downloads, or blend overwrite.
Exports tmp/p3-library; lib-canopy.mjs packages only these six GLBs.
Original geometry/leaf atlas are dedicated to CC0-1.0, like GFX-02.
"""
import bpy
import math
import random
from pathlib import Path
from mathutils import Vector

ROOT = Path('D:/tqa-worktrees/W-A')
OUT = ROOT / 'tmp/p3-library'
OUT.mkdir(parents=True, exist_ok=True)
previous = bpy.context.window.scene
previous_meshes = set(bpy.data.meshes)
scene = bpy.data.scenes.new('GFX-P3-canopy')
objects = []
materials = []
image = None
try:
    bpy.context.window.scene = scene
    # A rounded, tapered leaf with a fine midrib. Colour is neutral: COLOR_0
    # supplies the existing forest palette. Transparent border survives mipmaps.
    size = 256
    image = bpy.data.images.new('GFX-P3-original-leaf', width=size, height=size, alpha=True)
    pixels = []
    for y in range(size):
        v = y / (size - 1)
        width = .40 * math.sin(math.pi * v) ** .72
        for x in range(size):
            u = x / (size - 1) - .5
            edge = width - abs(u + .025 * math.sin(v * math.pi * 2))
            alpha = max(0., min(1., edge * size)) * min(1., v * 80, (1-v)*80)
            vein = math.exp(-abs(u) * 150) * .12
            detail = .88 + .07 * math.sin(v * 45 + abs(u) * 25) + vein
            pixels.extend((detail, detail, detail, alpha))
    image.pixels[:] = pixels
    image.filepath_raw = str(OUT / 'leaf.png')
    image.file_format = 'PNG'
    image.save()
    image.pack()

    def material(name, color, leaf=False):
        m = bpy.data.materials.new('GFX-P3-' + name)
        materials.append(m)
        m.diffuse_color = (*color, 1)
        m.use_nodes = True
        p = m.node_tree.nodes.get('Principled BSDF')
        p.inputs['Base Color'].default_value = (*color, 1)
        p.inputs['Roughness'].default_value = .95
        if leaf:
            tex = m.node_tree.nodes.new('ShaderNodeTexImage')
            tex.image = image
            m.node_tree.links.new(tex.outputs['Color'], p.inputs['Base Color'])
            m.node_tree.links.new(tex.outputs['Alpha'], p.inputs['Alpha'])
            m.surface_render_method = 'DITHERED'
            m.alpha_threshold = .45
            m.use_backface_culling = False
        return m

    bark = material('wood', (.085, .065, .047))
    coremat = material('inner-leaf-mass', (.07, .14, .046))
    leafmat = material('leaf-cutout', (1, 1, 1), True)

    def pigment(obj, rgb, gradient=True):
        attr = obj.data.color_attributes.new(name='CanopyAO', type='FLOAT_COLOR', domain='CORNER')
        for poly in obj.data.polygons:
            poly.use_smooth = True
            for li in poly.loop_indices:
                vertex = obj.data.vertices[obj.data.loops[li].vertex_index]
                ao = .68 + .32 * max(0., min(1., vertex.co.z / 9)) if gradient else 1
                attr.data[li].color = (*[v * ao for v in rgb], 1)
        vc = obj.data.materials[0].node_tree.nodes.get('CanopyAO')
        if vc is None:
            vc = obj.data.materials[0].node_tree.nodes.new('ShaderNodeVertexColor')
            vc.name = 'CanopyAO'
            vc.layer_name = 'CanopyAO'
            p = obj.data.materials[0].node_tree.nodes.get('Principled BSDF')
            # Leaf images multiply vertex pigment after export in the packager.
            if obj.data.materials[0] != leafmat:
                obj.data.materials[0].node_tree.links.new(vc.outputs['Color'], p.inputs['Base Color'])
            else:
                nodes = leafmat.node_tree.nodes
                mix = nodes.new('ShaderNodeMixRGB')
                mix.blend_type = 'MULTIPLY'
                mix.inputs[0].default_value = 1
                leafmat.node_tree.links.new(next(n for n in nodes if n.type == 'TEX_IMAGE').outputs['Color'], mix.inputs[1])
                leafmat.node_tree.links.new(vc.outputs['Color'], mix.inputs[2])
                leafmat.node_tree.links.new(mix.outputs[0], p.inputs['Base Color'])

    def branch(a, b, radius, parts):
        delta = Vector(b) - Vector(a)
        bpy.ops.mesh.primitive_cone_add(vertices=5, radius1=radius, radius2=radius*.38,
            depth=delta.length, location=(Vector(a)+Vector(b))/2, end_fill_type='NOTHING')
        obj = bpy.context.object
        obj.rotation_euler = delta.to_track_quat('Z', 'Y').to_euler()
        obj.data.materials.append(bark)
        pigment(obj, (.12, .082, .048), False)
        parts.append(obj)

    for variant in range(3):
        for level in range(2):
            rng = random.Random(20261113 + variant)
            parts = []
            height = [6.8, 8.3, 5.6][variant]
            branch((0,0,0),(.15,.1,height*.89),.22,parts)
            for j in range(10):
                angle = j*2.399+variant
                z = height*(.32+.54*j/10)
                width = math.sin(math.pi*(j+1)/12)*[2.0,1.8,2.2][variant]
                center = Vector((math.cos(angle)*width, math.sin(angle)*width, z))
                # All random placements are computed on both levels, then thinned.
                leaves = []
                for i in range(18):
                    a = i*2.399+j*.7
                    h = rng.uniform(-.85,.85)
                    r = math.sqrt(1-h*h)*1.22
                    c = center+Vector((math.cos(a)*r,math.sin(a)*r,h*1.0))
                    direction = Vector((math.cos(a),math.sin(a),rng.uniform(-.6,.7))).normalized()*.60
                    side = Vector((-math.sin(a),math.cos(a),rng.uniform(-.15,.15)))*.38
                    leaves.append((c,direction,side))
                if level and j in (2,7):
                    continue
                branch((.1,0,z-.8),center,.075,parts)
                bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1,radius=1,location=center)
                core = bpy.context.object
                core.scale=(1.34,1.34,1.08)
                core.data.materials.append(coremat)
                pigment(core,(.09,.18,.055))
                parts.append(core)
                verts, faces, uv_values = [], [], []
                for i,(c,direction,side) in enumerate(leaves):
                    if i >= 16:
                        continue
                    if level and i % 2:
                        continue
                    k=len(verts)
                    # Folded four-triangle card, with an upturned middle.
                    verts.extend([c-direction-side,c-direction+side,c+Vector((0,0,.12)),c+direction+side,c+direction-side])
                    faces.extend([(k,k+1,k+2),(k+1,k+3,k+2),(k+3,k+4,k+2),(k+4,k,k+2)])
                    uv_values.extend([((0,0),(1,0),(.5,.5)),((1,0),(1,1),(.5,.5)),((1,1),(0,1),(.5,.5)),((0,1),(0,0),(.5,.5))])
                data=bpy.data.meshes.new('GFX-P3-rounded-leaves')
                data.from_pydata(verts,[],faces)
                obj=bpy.data.objects.new('rounded-leaf-cutouts',data)
                scene.collection.objects.link(obj)
                data.materials.append(leafmat)
                uv=data.uv_layers.new()
                for poly,coords in zip(data.polygons,uv_values):
                    for li,coord in zip(poly.loop_indices,coords):
                        uv.data[li].uv=coord
                pigment(obj,(.12,.26,.075))
                parts.append(obj)
            bpy.ops.object.select_all(action='DESELECT')
            for obj in parts:
                obj.select_set(True)
            bpy.context.view_layer.objects.active=parts[0]
            bpy.ops.object.join()
            obj=bpy.context.object
            obj.name='tree-broadleaf-'+str(variant+1)
            bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
            bpy.ops.export_scene.gltf(filepath=str(OUT/('tree-broadleaf-'+str(variant+1)+'-lod'+str(level)+'.glb')),
                use_selection=True,use_active_scene=True,export_format='GLB',export_yup=True,
                export_materials='EXPORT',export_image_format='AUTO')
            objects.append(obj)
            bpy.data.objects.remove(obj,do_unlink=True)
finally:
    bpy.context.window.scene = previous
    for obj in list(scene.objects):
        bpy.data.objects.remove(obj,do_unlink=True)
    bpy.data.scenes.remove(scene)
    for mesh in list(bpy.data.meshes):
        if mesh not in previous_meshes and mesh.users == 0:
            bpy.data.meshes.remove(mesh)
    for m in materials:
        if m.users == 0:
            bpy.data.materials.remove(m)
    if image and image.users == 0:
        bpy.data.images.remove(image)
