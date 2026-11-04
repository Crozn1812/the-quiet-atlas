"""Blender -b -P tools/assets/blender/turnaround.py -- <output-directory>.

Builds the same character study; writes three PNGs for separate art approval.
Uses Workbench studio soft lighting and flat polygon normals, without textures.
"""
import math
import os
import sys

import bpy
from mathutils import Vector

# Blender does not consistently put the script directory on sys.path.
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from character import build_character, linear_color  # noqa: E402


PAPER = "#EEE8D8"
VIEWS = (("front", 0), ("three-quarter", 45), ("back", 180))


def main(argv):
    if len(argv) != 1:
        raise SystemExit("Usage: blender -b -P tools/assets/blender/turnaround.py -- <output-directory>")
    output_dir = os.path.abspath(argv[0])
    os.makedirs(output_dir, exist_ok=True)
    build_character()
    scene = bpy.context.scene
    # Lead: same look as the GD110 turnaround (Cycles, soft area light, exact paper background),
    # so the character and vehicle sheets read consistently; Workbench studio light greyed the cream shirt.
    scene.render.engine = "CYCLES"
    scene.cycles.samples = 16
    scene.render.resolution_x = 1024
    scene.render.resolution_y = 1024
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.film_transparent = False
    scene.view_settings.view_transform = "Standard"
    scene.view_settings.look = "None"
    scene.world = bpy.data.worlds.new("paper background")
    scene.world.use_nodes = True
    background = scene.world.node_tree.nodes["Background"]
    background.inputs["Color"].default_value = (*linear_color(PAPER), 1)
    background.inputs["Strength"].default_value = 1.0
    bpy.ops.object.light_add(type="AREA", location=(-3, -5, 4))
    light = bpy.context.object
    light.data.energy = 450
    light.data.shape = "DISK"
    light.data.size = 5
    light.rotation_euler = (Vector((0, 0, 0.9)) - light.location).to_track_quat("-Z", "Y").to_euler()
    bpy.ops.object.camera_add()
    camera = bpy.context.object
    camera.name = "turnaround orthographic"
    camera.data.type = "ORTHO"
    camera.data.ortho_scale = 2.12
    scene.camera = camera
    target = Vector((0, 0, 0.86))
    for name, degrees in VIEWS:
        angle = math.radians(degrees)
        camera.location = target + Vector((4 * math.sin(angle), -4 * math.cos(angle), 0))
        camera.rotation_euler = (target - camera.location).to_track_quat("-Z", "Y").to_euler()
        scene.render.filepath = os.path.join(output_dir, f"character-duy-{name}.png")
        bpy.ops.render.render(write_still=True)


if __name__ == "__main__":
    main(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])
