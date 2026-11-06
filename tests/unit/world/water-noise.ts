// Run the scalar noise functions from the shipped shader, not a CPU copy.
export function waterNoiseFunctions(source: string): string {
  return source.slice(source.indexOf('// Begin water noise functions.'), source.indexOf('// End water noise functions.'))
    .replace(/float (\w+)\(([^)]*)\)/g, (_, name: string, args: string) =>
      'function ' + name + '(' + args.replace(/float /g, '') + ')')
    .replace(/\bfloat\s+/g, 'let ')
    .replace(/\bfloor\(/g, 'Math.floor(');
}
export const fract = (x: number) => x - Math.floor(x);
export const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
export const mix = (a: number, b: number, t: number) => a + (b - a) * t;
export function waterNoiseSampler(source: string) {
  return new Function('fract', 'mix', 'smoothstep', waterNoiseFunctions(source)
    + 'return { field: waterField, streak: waterStreak };')(fract, mix, smoothstep) as {
      field: (x: number, y: number) => number;
      streak: (x: number, y: number) => number;
    };
}
