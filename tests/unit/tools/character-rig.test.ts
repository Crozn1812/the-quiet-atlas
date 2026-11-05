import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const readRig = () => readFile(
  new URL('../../../tools/assets/blender/character_rig.py', import.meta.url), 'utf8',
);

describe('D-23 character rig script (static checks; Blender runs on Lead machine)', () => {
  it('reuses the approved builder and declares all three 30 fps cycles', async () => {
    const source = await readRig();
    expect(source).toContain('from character import build_character, MAX_TRIANGLES');
    expect(source).toContain('model = build_character()');
    expect(source).toMatch(/^FPS = 30$/m);
    expect(source).toMatch(/^ACTION_FRAMES = \{"Idle": 120, "Walk": 30, "Run": 21\}$/m);
    expect(source).toContain('action = bpy.data.actions.new(name)');
    expect(source).toContain('(i % frames) / frames');
    expect(source).toContain('key.interpolation = "LINEAR"');
    expect(source).toContain('action.fcurve_ensure_for_datablock');
    expect(source).not.toMatch(/action\.fcurves\./);
    expect(source).toContain('return rotations, (0, -crouch * scale, 0)');
    expect(source).toMatch(/^STEP_LENGTH = 0\.70\b/m);
  });

  it('declares a complete parented skeleton within the 20-bone ceiling', async () => {
    const source = await readRig();
    const declaration = source.match(/^BONES = \(\r?\n([\s\S]*?)^\)/m)?.[1] ?? '';
    const definitions = [...declaration.matchAll(/^\s*\("([\w.]+)", (None|"[\w.]+"),/gm)];
    const names = definitions.map((match) => match[1]);
    const expected = ['hips', 'spine', 'chest', 'neck', 'head'];
    for (const side of ['L', 'R']) {
      for (const part of ['shoulder', 'upper_arm', 'forearm', 'hand', 'thigh', 'shin', 'foot']) {
        expected.push(`${part}.${side}`);
      }
    }
    expect(names).toHaveLength(19);
    expect(names.length).toBeLessThanOrEqual(20);
    expect(new Set(names).size).toBe(names.length);
    expect([...names].sort()).toEqual(expected.sort());
    const seen = new Set<string>();
    for (const [, name = '', parent = ''] of definitions) {
      if (parent !== 'None') expect(seen.has(parent.slice(1, -1)), `${name} parent`).toBe(true);
      else expect(name).toBe('hips');
      seen.add(name);
    }
    // Bones can only be created from that declaration, not hidden extra bones.
    expect(source.match(/edit_bones\.new\(/g)).toHaveLength(1);
    expect(source).toContain('for name, parent, head, tail in BONES:');
  });

  it('loads no images, external assets, or network resources', async () => {
    const source = await readRig();
    const imports = [...source.matchAll(/^(?:import (\w+)|from (\w+) import)/gm)]
      .map((match) => match[1] ?? match[2]);
    expect(imports.sort()).toEqual(['bpy', 'character', 'json', 'math', 'mathutils', 'os', 'struct', 'sys']);
    expect(source).toContain('sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))');
    expect(source).not.toMatch(/bpy\.data\.(?:images|libraries)\.load|bpy\.ops\.(?:import_scene|wm\.(?:append|link|open_mainfile))/);
    expect(source).not.toMatch(/https?:\/\/|urllib|requests|socket|subprocess|__import__|\b(?:eval|exec)\s*\(/);
    const fileReads = [...source.matchAll(/\bopen\(([^\n]+)\)/g)].map((match) => match[1]);
    expect(fileReads).toEqual(['output, "rb"']); // inspect only the GLB just exported
    expect(source).not.toMatch(/["'][^"'\n]*\.(?:png|jpe?g|webp|blend|fbx|obj|gltf)["']/i);
  });

  it('binds accessories, preserves colors, and exports a checked Y-up skin', async () => {
    const source = await readRig();
    expect(source).toContain('weights = {"shoulder.L": 1.0}');
    expect(source).toContain('material == "pale matte frame" or center.z > 1.48');
    expect(source).toContain('weights = {"head": 1.0}');
    expect(source).toContain('model.parent = rig');
    expect(source).toContain('model.modifiers.new("D-23 skin", "ARMATURE")');
    expect(source).toContain('colors.data[loop].color = color');
    expect(source).toContain('mesh.materials.clear()');
    expect(source).toContain('mesh.materials.append(material)');
    expect(source).toContain('export_skins=True');
    expect(source).toContain('export_animations=True');
    expect(source).toContain('export_yup=True');
    expect(source).toContain('export_cameras=False, export_lights=False');
    expect(source).toContain('export_animation_mode="NLA_TRACKS"');
    expect(source).toContain('export_rest_position_armature=True');
    expect(source).toContain('strip.action_slot = slot');
    expect(source).toContain('len(meshes) <= 4');
    expect(source).toContain('len(primitives) != 1');
    expect(source).toContain('exported_triangles != triangles');
    expect(source).toContain('verify_export(output, triangles)');
    expect(source).toContain('"character-duy-rig.glb"');
    expect(source).toContain('sys.argv.index("--")');
  });
});
