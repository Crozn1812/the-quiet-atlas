"""Original low-poly pine. Blender -b --factory-startup -P this.py -- out.glb."""
import math
import os
import sys
import bpy

# Copied from src/features/world/art/palette.ts: forestDeep and forestLight.
TRUNK_HEX = "#2F5446"
FOLIAGE_HEX = "#5E8C6A"


def material(name, value):
    # glTF baseColorFactor is linear; the source palette is sRGB.
    srgb = [int(value[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    linear = [c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in srgb]
    result = bpy.data.materials.new(name)
    result.diffuse_color = (*linear, 1)
    result.use_nodes = True
    shader = result.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = (*linear, 1)
    shader.inputs["Metallic"].default_value = 0
    shader.inputs["Roughness"].default_value = 1
    return result


args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
if len(args) != 1 or not args[0].lower().endswith(".glb"):
    raise SystemExit("Usage: blender -b --factory-startup -P tools/assets/blender/pine.py -- <out.glb>")
output = os.path.abspath(args[0])
os.makedirs(os.path.dirname(output), exist_ok=True)
bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)
trunk = material("forestDeep", TRUNK_HEX)
foliage = material("forestLight", FOLIAGE_HEX)
bpy.ops.mesh.primitive_cylinder_add(vertices=6, radius=0.13, depth=1.5, location=(0, 0, 0.75))
bpy.context.object.name = "pine-trunk"
bpy.context.object.data.materials.append(trunk)
for index, (x, y, z, radius, height) in enumerate([
    (0.00, 0.00, 1.35, 0.85, 1.4),
    (0.05, -0.03, 2.00, 0.64, 1.2),
    (-0.02, 0.02, 2.60, 0.43, 1.1),
]):
    bpy.ops.mesh.primitive_cone_add(vertices=7, radius1=radius, radius2=0,
                                    depth=height, location=(x, y, z),
                                    rotation=(0, 0, index * math.pi / 7))
    bpy.context.object.name = f"pine-crown-{index + 1}"
    bpy.context.object.data.materials.append(foliage)
for obj in bpy.context.scene.objects:
    if obj.type == "MESH":
        for polygon in obj.data.polygons:
            polygon.use_smooth = False
bpy.ops.export_scene.gltf(filepath=output, export_format="GLB", export_materials="EXPORT",
                          export_yup=True, export_animations=False, export_cameras=False,
                          export_lights=False)
