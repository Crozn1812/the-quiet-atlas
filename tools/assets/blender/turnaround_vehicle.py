"""Render left, front three-quarter and rear views of the generated vehicle.

blender -b --factory-startup -P tools/assets/blender/turnaround_vehicle.py -- <output-dir>
No asset export or browser required. Shares geometry with gd110.py.
"""
import argparse
import os
import sys

import bpy

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.dont_write_bytecode = True
from gd110 import build_vehicle, point  # noqa: E402


def aim(obj, target):
    obj.rotation_euler = (point(target) - obj.location).to_track_quat('-Z', 'Y').to_euler()


def main(argv):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output_dir")
    args = parser.parse_args(argv)
    os.makedirs(args.output_dir, exist_ok=True)
    build_vehicle()
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.samples = 16
    scene.render.resolution_x = 960
    scene.render.resolution_y = 960
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.world.use_nodes = True
    scene.world.node_tree.nodes['Background'].inputs['Color'].default_value = (.855, .807, .687, 1)  # PALETTE.paper #EEE8D8 in linear
    scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value = 1.0
    scene.view_settings.view_transform = 'Standard'  # keep the paper background exactly paper-coloured
    bpy.ops.object.light_add(type="AREA", location=point((-3, 5, 4)))
    light = bpy.context.object
    light.data.energy = 450
    light.data.shape = "DISK"
    light.data.size = 5
    aim(light, (0, .7, 0))
    bpy.ops.object.camera_add()
    camera = bpy.context.object
    camera.data.type = "ORTHO"
    camera.data.ortho_scale = 2.65
    scene.camera = camera
    for name, position in [("left", (-4, 1.7, 0)),
                           ("front-three-quarter", (-3, 2.1, 4)),
                           ("rear", (0, 1.7, -4))]:
        camera.location = point(position)
        aim(camera, (0, .77, 0))
        scene.render.filepath = os.path.abspath(os.path.join(args.output_dir, name + ".png"))
        bpy.ops.render.render(write_still=True)


if __name__ == "__main__":
    main(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])
