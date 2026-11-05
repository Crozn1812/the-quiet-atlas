"""Rig the approved D-23 character, without rebuilding or editing its geometry.

Blender 5.x: blender -b --factory-startup -P this.py -- <output-directory>.
Metres, Z up / facing -Y internally; one skinned mesh, Y-up on GLB export.
"""
import json
import math
import os
import struct
import sys

import bpy
from mathutils import Quaternion, Vector

# Resolve only the sibling repository script, even when Blender's cwd differs.
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from character import build_character, MAX_TRIANGLES  # noqa: E402


FPS = 30
STEP_LENGTH = 0.70  # metres per step; two steps in the Walk cycle
ACTION_FRAMES = {"Idle": 120, "Walk": 30, "Run": 21}
# Explicit, auditable 19-bone skeleton. Coordinates are authoring landmarks,
# not replacement geometry. Positive X is the character's left (tote) side.
# name, parent, head, tail
BONES = (
    ("hips", None, (0, 0, 0.94), (0, 0, 1.02)),
    ("spine", "hips", (0, 0, 1.02), (0, 0, 1.18)),
    ("chest", "spine", (0, 0, 1.18), (0, 0, 1.345)),
    ("neck", "chest", (0, 0, 1.345), (0, 0, 1.46)),
    ("head", "neck", (0, 0, 1.46), (0, 0, 1.69)),
    ("shoulder.L", "chest", (0.035, 0, 1.345), (0.165, 0, 1.342)),
    ("upper_arm.L", "shoulder.L", (0.165, 0, 1.342), (0.294, 0, 1.103)),
    ("forearm.L", "upper_arm.L", (0.294, 0, 1.103), (0.405, -0.012, 0.902)),
    ("hand.L", "forearm.L", (0.405, -0.012, 0.902), (0.427, -0.014, 0.83)),
    ("shoulder.R", "chest", (-0.035, 0, 1.345), (-0.165, 0, 1.342)),
    ("upper_arm.R", "shoulder.R", (-0.165, 0, 1.342), (-0.294, 0, 1.103)),
    ("forearm.R", "upper_arm.R", (-0.294, 0, 1.103), (-0.405, -0.012, 0.902)),
    ("hand.R", "forearm.R", (-0.405, -0.012, 0.902), (-0.427, -0.014, 0.83)),
    ("thigh.L", "hips", (0.086, 0, 0.94), (0.086, -0.006, 0.54)),
    ("shin.L", "thigh.L", (0.086, -0.006, 0.54), (0.086, 0, 0.105)),
    ("foot.L", "shin.L", (0.086, 0, 0.105), (0.086, -0.14, 0.04)),
    ("thigh.R", "hips", (-0.086, 0, 0.94), (-0.086, -0.006, 0.54)),
    ("shin.R", "thigh.R", (-0.086, -0.006, 0.54), (-0.086, 0, 0.105)),
    ("foot.R", "shin.R", (-0.086, 0, 0.105), (-0.086, -0.14, 0.04)),
)


def islands(mesh):
    """Recover the original disconnected parts after build_character's join."""
    neighbors = [[] for _ in mesh.vertices]
    for edge in mesh.edges:
        a, b = edge.vertices
        neighbors[a].append(b)
        neighbors[b].append(a)
    material = {}
    for face in mesh.polygons:
        for index in face.vertices:
            material[index] = mesh.materials[face.material_index].name
    unseen = set(range(len(mesh.vertices)))
    result = []
    while unseen:
        first = min(unseen)
        unseen.remove(first)
        indices, pending = [], [first]
        while pending:
            index = pending.pop()
            indices.append(index)
            for neighbor in neighbors[index]:
                if neighbor in unseen:
                    unseen.remove(neighbor)
                    pending.append(neighbor)
        center = sum((mesh.vertices[i].co for i in indices), Vector()) / len(indices)
        result.append((indices, center, material[first]))
    return result


def authoring_transform(parts):
    """Recover the source's uniform height normalization from the two soles.

    The source bakes its matrix before returning the joined mesh. Symmetric
    sole centers (X = +/-0.086, Z = 0.016) retain its exact scale and floor
    offset, so skeleton landmarks follow that bake without moving vertices.
    """
    soles = [center for _, center, mat in parts
             if mat == "bright cream shirt and socks" and center.z < 0.04]
    if len(soles) != 2:
        raise RuntimeError("D-23 sole landmarks changed; review rig mapping")
    scale = sum(abs(center.x) for center in soles) / (2 * 0.086)
    floor = 0.016 - sum(center.z for center in soles) / (2 * scale)
    return scale, floor


def make_armature(scale, floor):
    data = bpy.data.armatures.new("character-duy skeleton")
    rig = bpy.data.objects.new("character-duy-rig", data)
    bpy.context.collection.objects.link(rig)
    bpy.ops.object.select_all(action="DESELECT")
    rig.select_set(True)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode="EDIT")
    for name, parent, head, tail in BONES:
        bone = data.edit_bones.new(name)
        bone.head = (Vector(head) - Vector((0, 0, floor))) * scale
        bone.tail = (Vector(tail) - Vector((0, 0, floor))) * scale
        if parent:
            bone.parent = data.edit_bones[parent]
            bone.use_connect = (bone.head - bone.parent.tail).length < 1e-6
    bpy.ops.object.mode_set(mode="OBJECT")
    for bone in rig.pose.bones:
        bone.rotation_mode = "QUATERNION"
    if len(data.bones) != 19 or len(data.bones) > 20:
        raise RuntimeError("Unexpected bone count")
    return rig


def blend_at(height, stops):
    """Normalized region weights with at most two influences per vertex."""
    if height <= stops[0][0]:
        return {stops[0][1]: 1.0}
    for (low, a), (high, b) in zip(stops, stops[1:]):
        if height < high:
            t = (height - low) / (high - low)
            # Lead fix: equal neighbouring stops (e.g. shin -> shin) must sum, not overwrite.
            if a == b:
                return {a: 1.0}
            return {a: 1 - t, b: t}
    return {stops[-1][1]: 1.0}


def bind_mesh(model, rig, parts, scale, floor):
    groups = {name: model.vertex_groups.new(name=name) for name, *_ in BONES}
    for indices, baked_center, material in parts:
        center = baked_center / scale + Vector((0, 0, floor))
        side = ".L" if center.x > 0 else ".R"
        for index in indices:
            z = model.data.vertices[index].co.z / scale + floor
            if material == "cream canvas":
                weights = {"shoulder.L": 1.0}  # whole tote and both handles
            elif material == "pale matte frame" or center.z > 1.48:
                weights = {"head": 1.0}  # glasses stay rigid with tilted D-23 head
            elif abs(center.x) > 0.14 and center.z > 0.8:
                if center.z < 0.90:
                    weights = {"hand" + side: 1.0}
                else:
                    weights = blend_at(z, ((0.90, "hand" + side),
                                              (0.96, "forearm" + side),
                                              (1.06, "forearm" + side),
                                              (1.15, "upper_arm" + side)))
            elif center.z < 0.90 and abs(center.x) > 0.04:
                # Shoes/soles rigid; socks taper into the ankle; knee blends.
                weights = blend_at(z, ((0.12, "foot" + side),
                                          (0.23, "shin" + side),
                                          (0.49, "shin" + side),
                                          (0.59, "thigh" + side),
                                          (0.88, "thigh" + side),
                                          (0.97, "hips")))
            else:
                weights = blend_at(z, ((1.00, "hips"), (1.15, "spine"),
                                          (1.32, "chest"), (1.43, "neck"),
                                          (1.48, "head")))
            for name, weight in weights.items():
                if weight > 0:
                    groups[name].add([index], weight, "REPLACE")
    model.parent = rig  # both object matrices remain identity
    modifier = model.modifiers.new("D-23 skin", "ARMATURE")
    modifier.object = rig
    modifier.use_deform_preserve_volume = False  # glTF linear skinning parity
    for vertex in model.data.vertices:
        if not 1 <= len(vertex.groups) <= 2 or not math.isclose(
                sum(g.weight for g in vertex.groups), 1.0, abs_tol=1e-6):
            raise RuntimeError(f"Invalid skin weights on vertex {vertex.index}")


def consolidate_materials(mesh):
    """One primitive/draw call: bake unchanged linear base colors to COLOR_0.

    All approved materials already share roughness=1 and metallic=0. Corner
    attributes preserve material boundaries without welding or changing faces.
    """
    colors = mesh.color_attributes.new(name="D23Color", type="FLOAT_COLOR", domain="CORNER")
    for face in mesh.polygons:
        shader = mesh.materials[face.material_index].node_tree.nodes.get("Principled BSDF")
        color = tuple(shader.inputs["Base Color"].default_value)
        for loop in face.loop_indices:
            colors.data[loop].color = color
    material = bpy.data.materials.new("D-23 original colors")
    material.use_nodes = True
    shader = material.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Roughness"].default_value = 1
    shader.inputs["Metallic"].default_value = 0
    attribute = material.node_tree.nodes.new("ShaderNodeVertexColor")
    attribute.layer_name = colors.name
    material.node_tree.links.new(attribute.outputs["Color"], shader.inputs["Base Color"])
    mesh.materials.clear()
    mesh.materials.append(material)
    for face in mesh.polygons:
        face.material_index = 0


def axis_rotation(bone, angle):
    rest = bone.bone.matrix_local.to_quaternion()
    return rest.inverted() @ Quaternion((1, 0, 0), angle) @ rest


def foot_path(phase, duty, span, lift):
    """Constant-speed planted stance, then C1-continuous return and toe lift."""
    if phase < duty:
        return span * (phase / duty - 0.5), 0.0, 0.0
    u = (phase - duty) / (1 - duty)
    smooth = u * u * (3 - 2 * u)
    tangent = span * (1 - duty) / duty
    y = span * (0.5 - smooth) + tangent * (2 * u ** 3 - 3 * u * u + u)
    arc = math.sin(math.pi * u) ** 2
    return y, lift * arc, -0.12 * arc


def leg_pose(rig, side, y, lift, pitch, crouch, scale):
    """Analytic sagittal two-link IK baked as FK: no exported constraints."""
    thigh, shin, foot = (rig.pose.bones[name + side] for name in ("thigh", "shin", "foot"))
    hip = thigh.bone.head_local - Vector((0, 0, crouch * scale))
    ankle = shin.bone.tail_local + Vector((0, y * scale, lift * scale))
    delta = ankle - hip
    distance = delta.length
    a, b = thigh.bone.length, shin.bone.length
    if not abs(a - b) < distance < a + b:
        raise RuntimeError("Gait target outside leg reach")
    along = delta.normalized()
    forward = Vector((0, along.z, -along.y))
    projection = (a * a - b * b + distance * distance) / (2 * distance)
    knee = hip + along * projection + forward * math.sqrt(max(0, a * a - projection * projection))
    result = {}
    parent_world = rig.data.bones["hips"].matrix_local.to_quaternion()
    for bone, direction in ((thigh, knee - hip), (shin, ankle - knee), (foot, None)):
        rest = bone.bone.matrix_local.to_quaternion()
        if direction is None:
            target = Quaternion((1, 0, 0), pitch) @ rest
        else:
            rest_direction = bone.bone.tail_local - bone.bone.head_local
            target = rest_direction.rotation_difference(direction) @ rest
        relative_rest = bone.parent.bone.matrix_local.to_quaternion().inverted() @ rest
        result[bone.name] = relative_rest.inverted() @ parent_world.inverted() @ target
        parent_world = target
    return result


def sample_pose(rig, action, phase, scale):
    rotations = {bone.name: Quaternion() for bone in rig.pose.bones}
    wave = math.sin(2 * math.pi * phase)
    crouch = 0.0
    if action == "Idle":
        rotations["spine"] = axis_rotation(rig.pose.bones["spine"], 0.006 * wave)
        rotations["chest"] = axis_rotation(rig.pose.bones["chest"], -0.010 * wave)
        rotations["neck"] = axis_rotation(rig.pose.bones["neck"], 0.004 * wave)
    else:
        running = action == "Run"
        crouch = 0.11 if running else 0.095
        # A constant pelvis lowering permits a natural stride with no bounce.
        # No horizontal hips translation or armature/object motion is authored.
        rotations["spine"] = axis_rotation(rig.pose.bones["spine"], 0.07 if running else 0.025)
        rotations["chest"] = axis_rotation(rig.pose.bones["chest"], 0.009 * wave)
        for side, offset in ((".L", 0.0), (".R", 0.5)):
            local = (phase + offset) % 1.0
            y, lift, pitch = foot_path(local, 0.54 if running else 0.60,
                                       0.74 if running else STEP_LENGTH,
                                       0.10 if running else 0.055)
            rotations.update(leg_pose(rig, side, y, lift, pitch, crouch, scale))
            # Arms counter the legs; the tote-side arm has a quieter swing.
            swing = math.cos(2 * math.pi * local) * (0.28 if running else 0.18)
            swing *= 0.55 if side == ".L" else 1.0
            rotations["upper_arm" + side] = axis_rotation(rig.pose.bones["upper_arm" + side], swing)
            rotations["forearm" + side] = axis_rotation(rig.pose.bones["forearm" + side],
                                                       -0.48 if running else -0.10)
    # hips local Y is world +Z. This offset is constant throughout each clip.
    return rotations, (0, -crouch * scale, 0)


def make_actions(rig, scale):
    # Standalone authoring scene: prevent stale actions from a supplied .blend.
    for action in list(bpy.data.actions):
        bpy.data.actions.remove(action)
    animation = rig.animation_data_create()
    for name, frames in ACTION_FRAMES.items():
        action = bpy.data.actions.new(name)
        action.use_fake_user = True
        action.use_frame_range = True
        action.frame_start, action.frame_end = 1, frames + 1
        action.use_cyclic = True
        slot = action.slots.new(id_type="OBJECT", name=rig.name)
        animation.action = action
        animation.action_slot = slot
        samples = [sample_pose(rig, name, (i % frames) / frames, scale)
                   for i in range(frames + 1)]  # exact duplicate endpoint
        channels = [(f'pose.bones["{bone}"].rotation_quaternion', component,
                     [pose[bone][component] for pose, _ in samples], bone)
                    for bone, *_ in BONES for component in range(4)]
        channels += [('pose.bones["hips"].location', component,
                      [location[component] for _, location in samples], "hips")
                     for component in range(3)]
        # Blender 5.x layered/slotted API; no legacy action.fcurves access.
        for path, component, values, group in channels:
            curve = action.fcurve_ensure_for_datablock(rig, path, index=component, group_name=group)
            curve.keyframe_points.add(len(values))
            curve.keyframe_points.foreach_set("co", [v for i, value in enumerate(values)
                                                     for v in (i + 1, value)])
            for key in curve.keyframe_points:
                key.interpolation = "LINEAR"
            curve.modifiers.new("CYCLES")
            curve.update()
        track = animation.nla_tracks.new()
        track.name = name
        strip = track.strips.new(name, 1, action)
        strip.action_slot = slot
        strip.extrapolation = "NOTHING"
        strip.blend_type = "REPLACE"
    animation.action = None


def verify_export(output, triangles):
    """Fail loudly on a missing clip/skin or accidental exporter regression."""
    with open(output, "rb") as stream:
        header = stream.read(20)
        magic, version, _, length, chunk = struct.unpack("<4sIIII", header)
        if magic != b"glTF" or version != 2 or chunk != 0x4E4F534A:
            raise RuntimeError("Expected a GLB 2.0 JSON chunk")
        document = json.loads(stream.read(length))
    clips = document.get("animations", [])
    if len(clips) != 3 or {clip["name"] for clip in clips} != set(ACTION_FRAMES):
        raise RuntimeError("Expected exactly Idle, Walk, Run clips")
    for clip in clips:
        times = [document["accessors"][sampler["input"]] for sampler in clip["samplers"]]
        duration = max(t["max"][0] for t in times) - min(t["min"][0] for t in times)
        if not math.isclose(duration, ACTION_FRAMES[clip["name"]] / FPS, abs_tol=1e-5):
            raise RuntimeError(f"Wrong duration: {clip['name']} = {duration}")
    skins = document.get("skins", [])
    meshes = document.get("meshes", [])
    primitives = [p for mesh in meshes for p in mesh["primitives"]]
    if len(skins) != 1 or len(skins[0]["joints"]) != len(BONES):
        raise RuntimeError("Missing 19-joint skin")
    if not 1 <= len(meshes) <= 4 or len(primitives) != 1:
        raise RuntimeError("Expected one mesh primitive after color consolidation")
    if any(not {"JOINTS_0", "WEIGHTS_0", "COLOR_0"} <= set(p["attributes"]) for p in primitives):
        raise RuntimeError("Missing skin or approved vertex colors")
    exported_triangles = sum(document["accessors"][p["indices"]]["count"] // 3 for p in primitives)
    if exported_triangles != triangles or triangles > MAX_TRIANGLES:
        raise RuntimeError("Export changed approved triangle count")
    if document.get("images") or document.get("cameras") or document.get("extensions", {}).get("KHR_lights_punctual"):
        raise RuntimeError("Unexpected image, camera or light")
    print(f"character-duy-rig: {triangles} triangles, {len(BONES)} bones, "
          f"{len(meshes)} mesh, {len(primitives)} primitive; Idle=4s Walk=1s Run=0.7s @ {FPS}fps", flush=True)
    print(f"character-duy-rig raw bytes: {os.path.getsize(output)}; "
          "Lead: verify <= 600000 bytes AFTER meshopt", flush=True)


def main(argv):
    if len(argv) != 1:
        raise SystemExit("Usage: blender -b -P tools/assets/blender/character_rig.py -- <output-directory>")
    output_dir = os.path.abspath(argv[0])
    os.makedirs(output_dir, exist_ok=True)
    model = build_character()
    parts = islands(model.data)
    scale, floor = authoring_transform(parts)
    rig = make_armature(scale, floor)
    bind_mesh(model, rig, parts, scale, floor)
    consolidate_materials(model.data)
    model.data.calc_loop_triangles()
    triangles = len(model.data.loop_triangles)
    make_actions(rig, scale)
    scene = bpy.context.scene
    scene.render.fps, scene.render.fps_base = FPS, 1.0
    scene.frame_start, scene.frame_end = 1, 121
    scene.frame_set(0)  # strips start at 1: export the unchanged rest shape
    bpy.ops.object.select_all(action="DESELECT")
    model.select_set(True)
    rig.select_set(True)
    bpy.context.view_layer.objects.active = rig
    output = os.path.join(output_dir, "character-duy-rig.glb")
    bpy.ops.export_scene.gltf(
        filepath=output, export_format="GLB", use_selection=True,
        export_yup=True, export_apply=False, export_materials="EXPORT",
        export_vertex_color="NAME", export_vertex_color_name="D23Color",
        export_all_vertex_colors=False, export_texcoords=False,
        export_animations=True, export_skins=True, export_influence_nb=4,
        export_animation_mode="NLA_TRACKS", export_merge_animation="NONE",
        export_frame_range=False, export_frame_step=1, export_force_sampling=True,
        export_anim_slide_to_zero=True, export_reset_pose_bones=True,
        export_rest_position_armature=True, export_current_frame=False,
        export_leaf_bone=False, export_cameras=False, export_lights=False)
    verify_export(output, triangles)


if __name__ == "__main__":
    main(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])
