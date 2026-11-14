"""GFX-P5: original Blender bakes and a D-23 compatible close-up skin.

Run main(workspace) through execute_code on the assigned Blender MCP. All
construction happens in a temporary scene; the user's scene is restored.
No external images, scene reset, or changes to the approved rig/animations.
Then: node tools/assets/blender/character-c-package.mjs
"""
import json
import math
import os
import re
import sys

import bpy


# Atlas order is shared with character/baked-appearance.ts.
SWATCHES = ("linen", "shorts", "skin", "hair", "glass", "paint", "metal", "rubber", "leather")
ROUGHNESS = (.88, .91, .64, .74, .28, .52, .58, .96, .82)


def tile_uv(slot, u, v):
    # 3x3 atlas; an inset also protects the coarsest useful mip levels.
    return ((slot % 3 + .06 + .88 * u) / 3, (slot // 3 + .06 + .88 * v) / 3)


def bake_atlas(directory):
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.samples = 1
    scene.cycles.device = "CPU"
    scene.render.bake.margin = 8
    images = [bpy.data.images.new("P5 " + name, width=2048, height=2048, alpha=False)
              for name in ("normal", "orm")]
    for image in images:
        image.colorspace_settings.name = "Non-Color"
    planes, targets = [], []
    for slot, name in enumerate(SWATCHES):
        bpy.ops.mesh.primitive_plane_add(size=1, location=(slot * 2, 0, 0))
        plane = bpy.context.object
        planes.append(plane)
        # Bake the whole cell, including padding. Runtime samples inside it.
        for uv in plane.data.uv_layers.active.data:
            uv.uv = ((slot % 3 + uv.uv.x) / 3, (slot // 3 + uv.uv.y) / 3)
        mat = bpy.data.materials.new("P5 baked " + name)
        mat.use_nodes = True
        plane.data.materials.append(mat)
        nodes, links = mat.node_tree.nodes, mat.node_tree.links
        shader = nodes.get("Principled BSDF")
        noise = nodes.new("ShaderNodeTexNoise")
        noise.inputs["Scale"].default_value = 150 if slot in (0, 1) else 90
        noise.inputs["Detail"].default_value = 2
        wave = nodes.new("ShaderNodeTexWave")
        wave.bands_direction = "X" if slot != 3 else "Y"
        wave.inputs["Scale"].default_value = 100 if slot != 3 else 60
        mix = nodes.new("ShaderNodeMath")
        mix.operation = "MULTIPLY"
        links.new(noise.outputs["Fac"], mix.inputs[0])
        links.new(wave.outputs["Color"], mix.inputs[1])
        bump = nodes.new("ShaderNodeBump")
        bump.inputs["Strength"].default_value = .16 if slot in (0, 1, 8) else .045
        bump.inputs["Distance"].default_value = .012
        links.new(noise.outputs["Fac"] if slot in (2, 4, 5, 6, 7) else mix.outputs[0], bump.inputs["Height"])
        links.new(bump.outputs["Normal"], shader.inputs["Normal"])
        target = nodes.new("ShaderNodeTexImage")
        target.image = images[0]
        nodes.active = target
        targets.append((mat, target, noise))
    bpy.ops.object.select_all(action="DESELECT")
    for plane in planes:
        plane.select_set(True)
    bpy.context.view_layer.objects.active = planes[0]
    bpy.ops.object.join()
    swatch = bpy.context.object
    bpy.ops.object.bake(type="NORMAL")
    for slot, (mat, target, noise) in enumerate(targets):
        nodes, links = mat.node_tree.nodes, mat.node_tree.links
        target.image = images[1]
        rough = nodes.new("ShaderNodeMath")
        rough.operation = "MULTIPLY_ADD"
        rough.inputs[1].default_value = .08
        rough.inputs[2].default_value = ROUGHNESS[slot] - .04
        links.new(noise.outputs["Fac"], rough.inputs[0])
        rgb = nodes.new("ShaderNodeCombineXYZ")
        rgb.inputs["X"].default_value = 1
        rgb.inputs["Z"].default_value = .78 if slot == 6 else 0
        links.new(rough.outputs[0], rgb.inputs["Y"])
        emission = nodes.new("ShaderNodeEmission")
        links.new(rgb.outputs[0], emission.inputs["Color"])
        links.new(emission.outputs[0], nodes.get("Material Output").inputs["Surface"])
        nodes.active = target
    bpy.ops.object.bake(type="EMIT")
    for name, image in zip(("normal", "orm"), images):
        for size in (1024, 512):
            image.scale(size, size)
            image.filepath_raw = os.path.join(directory, f"{name}-{size}.png")
            image.file_format = "PNG"
            image.save()
    bpy.data.objects.remove(swatch, do_unlink=True)


def build_closeup(workspace, directory):
    sys.path.insert(0, os.path.join(workspace, "tools/assets/blender"))
    import character as source
    import character_rig as rigging
    original_oval = source.oval

    def smooth_oval(name, *args, **kwargs):
        obj = original_oval(name, *args, **kwargs)
        # Subdivision is applied before binding/export and before the material bake.
        if name in ("quiet face", "relaxed hand", "thumb suggestion"):
            modifier = obj.modifiers.new("P5 skin subdivision before bake", "SUBSURF")
            modifier.levels = 1
            bpy.context.view_layer.objects.active = obj
            bpy.ops.object.modifier_apply(modifier=modifier.name)
        return obj

    source.oval = smooth_oval
    try:
        model = source.build_character()
    finally:
        source.oval = original_oval
    # Existing user scenes can already own the same material names.
    parts = [(indices, center, re.sub(r"\.\d+$", "", name))
             for indices, center, name in rigging.islands(model.data)]
    scale, floor = rigging.authoring_transform(parts)
    rig = rigging.make_armature(scale, floor)
    rigging.bind_mesh(model, rig, parts, scale, floor)
    uv = model.data.uv_layers.new(name="P5 atlas")
    uv.active_render = True
    model.data.uv_layers.active = uv
    for face in model.data.polygons:
        name = model.data.materials[face.material_index].name
        slot = (2 if "skin" in name else 6 if "frame" in name else
                0 if "shirt" in name or "canvas" in name else 1)
        center = face.center
        if slot == 1 and center.z > 1.45:
            slot = 3
        face.use_smooth = True
        for loop in face.loop_indices:
            p = model.data.vertices[model.data.loops[loop].vertex_index].co
            uv.data[loop].uv = tile_uv(slot, (p.x * 1.9 + .5) % 1, (p.z * 1.4) % 1)
    # Smooth round forms, retaining the collar, soles and cut cloth edges.
    model.data.set_sharp_from_angle(angle=math.radians(50))
    rigging.consolidate_materials(model.data)
    model.data.calc_loop_triangles()
    triangles = len(model.data.loop_triangles)
    print(f"REPORT ADR0019 closeup triangles: {triangles}; legacy reference: 12000", flush=True)
    bpy.ops.object.select_all(action="DESELECT")
    model.select_set(True)
    rig.select_set(True)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.export_scene.gltf(
        filepath=os.path.join(directory, "character-duy-c.glb"), export_format="GLB",
        use_selection=True, use_active_scene=True, export_yup=True, export_apply=False,
        export_materials="EXPORT", export_vertex_color="NAME",
        export_vertex_color_name="D23Color", export_texcoords=True,
        export_animations=False, export_skins=True, export_influence_nb=4,
        export_leaf_bone=False, export_cameras=False, export_lights=False)
    return {"triangles": triangles, "bones": len(rig.data.bones)}


def main(workspace):
    directory = os.path.join(workspace, "tmp/gfx-p5")
    os.makedirs(directory, exist_ok=True)
    window = bpy.context.window
    previous = window.scene
    previous_objects = set(bpy.data.objects)
    previous_materials = set(bpy.data.materials)
    previous_images = set(bpy.data.images)
    scene = bpy.data.scenes.new("GFX-P5 isolated bake")
    window.scene = scene
    try:
        bake_atlas(directory)
        result = build_closeup(workspace, directory)
        with open(os.path.join(directory, "manifest.json"), "w") as stream:
            json.dump(result, stream)
        print(json.dumps(result))
    finally:
        window.scene = previous
        for obj in set(bpy.data.objects) - previous_objects:
            bpy.data.objects.remove(obj, do_unlink=True)
        bpy.data.scenes.remove(scene)
        for mat in set(bpy.data.materials) - previous_materials:
            if not mat.users:
                bpy.data.materials.remove(mat)
        for image in set(bpy.data.images) - previous_images:
            if not image.users:
                bpy.data.images.remove(image)


if __name__ == "__main__":
    main(sys.argv[sys.argv.index("--") + 1])
