import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { PALETTE } from '../../../src/features/world/art/palette';

const readScript = (name: string) => readFile(
  new URL(`../../../tools/assets/blender/${name}.py`, import.meta.url), 'utf8',
);

describe('character Blender authoring scripts (static Node checks)', () => {
  it.each(['character', 'turnaround'])('%s exists with an explicit CLI entry and original geometry only', async (name) => {
    const source = await readScript(name);
    expect(source).toMatch(/^def main\(argv\):/m);
    expect(source).toContain('if __name__ == "__main__":');
    expect(source).toContain('sys.argv.index("--")');
    expect(source).not.toMatch(/logo|bpy\.data\.images\.load|text_add|type\s*=\s*["'](?:FONT|TEXT)["']|bpy\.data\.curves\.new\([^\n]*["']FONT["']/i);
    // Only these named character materials may depart from the world palette.
    const characterColors = { CREAM_WHITE: '#F4F0E6', SKIN: '#D9B48F' };
    let paletteSource = source;
    if (name === 'character') {
      for (const [constant, color] of Object.entries(characterColors)) {
        const declaration = `${constant} = "${color}"`;
        expect(source).toContain(declaration);
        paletteSource = paletteSource.replace(declaration, '');
      }
    }
    const colors = paletteSource.match(/#[\da-f]{6}\b/gi) ?? [];
    expect(colors.length).toBeGreaterThan(0);
    for (const color of colors) expect(Object.values(PALETTE)).toContain(color);
  });

  it('locks the revised human proportions and uses them in the geometry', async () => {
    const source = await readScript('character');
    const number = (name: string) => {
      const match = source.match(new RegExp(`^${name} = ([\\d.]+)$`, 'm'));
      expect(match, name).not.toBeNull();
      return Number(match?.[1]);
    };
    expect(number('NECK_LENGTH')).toBeGreaterThanOrEqual(0.12);
    expect(number('NECK_LENGTH')).toBeLessThanOrEqual(0.14);
    expect(number('NECK_RADIUS')).toBeGreaterThan(0.046);
    expect(number('LEG_WIDTH_SCALE')).toBe(1.35);
    expect(number('ARM_WIDTH_SCALE')).toBe(1.20);
    expect(number('SHOE_SCALE')).toBe(1.12);
    expect(number('STRAP_WIDTH')).toBeLessThan(0.018);
    expect(number('HAIR_CROWN_HEIGHT')).toBeLessThan(0.065);
    expect(source).toContain('1.345 + NECK_LENGTH), NECK_RADIUS, skin)');
    expect(source).toContain('0.048 * LEG_WIDTH_SCALE, skin, 0.061 * LEG_WIDTH_SCALE');
    expect(source).toContain('0.032 * LEG_WIDTH_SCALE, skin, 0.049 * LEG_WIDTH_SCALE');
    expect(source).toContain('0.031 * ARM_WIDTH_SCALE, skin, 0.045 * ARM_WIDTH_SCALE');
    expect(source).toContain('0.095 * SHOE_SCALE, 0.212 * SHOE_SCALE');
    expect(source).toContain('(STRAP_WIDTH, 0.005, direction.length');
    expect(source).toContain('(0.088, 0.083, HAIR_CROWN_HEIGHT)');
    expect(source).toContain('loose_shirt(cloth)');
    expect(source).toContain('segment("quiet smile", start, end, 0.0012, smile)');
  });

  it('exports the named untextured GLB with post-modifier triangle and byte gates', async () => {
    const source = await readScript('character');
    expect(source).toContain('os.path.abspath(argv[0])');
    expect(source).toContain('"character-duy.glb"');
    expect(source).toContain('calc_loop_triangles()');
    expect(source).toContain('MAX_TRIANGLES = 12000');
    expect(source).toContain('MAX_BYTES = 600000');
    expect(source).toContain('os.path.getsize(output)');
    expect(source).toContain('print(f"character-duy triangles:');
    expect(source).toMatch(/inputs\["Roughness"\]\.default_value = 1/);
    expect(source).toMatch(/inputs\["Metallic"\]\.default_value = 0/);
    expect(source).toContain('HEIGHT = 1.72');
  });

  it('uses the supplied output directory and shared model for three orthographic PNG views', async () => {
    const source = await readScript('turnaround');
    expect(source).toContain('os.path.abspath(argv[0])');
    expect(source).toContain('os.makedirs(output_dir, exist_ok=True)');
    expect(source).toContain('from character import build_character');
    expect(source).toContain('build_character()');
    expect(source).toContain('(("front", 0), ("three-quarter", 45), ("back", 180))');
    expect(source).toContain('camera.data.type = "ORTHO"');
    expect(source).toContain('scene.render.resolution_x = 1024');
    expect(source).toContain('scene.render.resolution_y = 1024');
    expect(source).toContain('scene.render.image_settings.file_format = "PNG"');
    expect(source).toContain('os.path.join(output_dir, f"character-duy-{name}.png")');
    expect(source).toContain('scene.world.color = linear_color(PAPER)');
  });
});
