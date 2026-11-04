import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PALETTE } from '../../../src/features/world/art/palette';

const script = readFileSync('tools/assets/blender/gd110.py', 'utf8');
const turnaround = readFileSync('tools/assets/blender/turnaround_vehicle.py', 'utf8');

describe('classic vehicle Blender source contract', () => {
  it('has an import-safe main(argv) and the required output name', () => {
    expect(script).toMatch(/def main\(argv\):/);
    expect(script).toContain('if __name__ == "__main__":');
    expect(script).toContain('vehicle-gd110.glb');
    expect(script).toContain('export_yup=True');
  });

  it('contains no branding or lettering geometry', () => {
    expect(script).not.toMatch(/suzuki|logo|text_add|type\s*=\s*["'](?:FONT|TEXT)["']|bpy\.data\.curves/i);
  });

  it('uses paper and ink from the world palette and warm matte metal', () => {
    expect(script).toContain(`BODY_HEX = "${PALETTE.paper}"`);
    expect(script).toContain(`SEAT_HEX = "${PALETTE.ink}"`);
    const roughness = Number(script.match(/metallic=\.65, roughness=([\d.]+)/)?.[1]);
    expect(roughness).toBeGreaterThanOrEqual(0.6);
  });

  it('exposes a raised scrambler bar, crossbrace and independent accessories', () => {
    for (const name of ['handlebar_scrambler', 'handlebar_crossbrace', 'accessory_helmet', 'accessory_tote']) {
      expect(script).toContain(`"${name}"`);
    }
    expect(script).toContain('--without-helmet');
    expect(script).toContain('--without-tote');
    expect(script).toContain('if with_helmet:');
    expect(script).toContain('if with_tote:');
  });

  it('enforces both export budgets and prints measured triangles', () => {
    expect(script).toContain('MAX_TRIANGLES = 8000');
    expect(script).toContain('MAX_BYTES = 400000');
    expect(script).toContain('calc_loop_triangles()');
    expect(script).toContain('if triangles > MAX_TRIANGLES:');
    expect(script).toContain('if size > MAX_BYTES:');
    expect(script).toContain('print(f"Triangles:');
  });

  it('renders all three approval views from the shared model', () => {
    expect(turnaround).toContain('from gd110 import build_vehicle, point');
    for (const view of ['left', 'front-three-quarter', 'rear']) {
      expect(turnaround).toContain(`"${view}"`);
    }
    expect(turnaround).toContain('bpy.ops.render.render(write_still=True)');
  });
});
