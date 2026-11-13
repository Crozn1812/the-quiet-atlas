// GFX-P1 reproducible Poly Haven -> linear RGBM16 -> UASTC KTX2 pipeline.
// node src/features/world/sky/export-env.mjs [--packed] (BLENDER_PORT defaults to 9877).
// --packed reuses the two HDRIs already imported into this worker by Blender MCP.
import net from "node:net";
import { mkdir, stat } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("../../../../", import.meta.url));
const temporary = path.join(root, "tmp/gfx-p1");
const output = path.join(root, "public/world/env");
await mkdir(temporary, { recursive: true }); await mkdir(output, { recursive: true });
function mcp(type, params) {
  return new Promise((resolve, reject) => {
    let buffer = "";
    const socket = net.createConnection(Number(process.env.BLENDER_PORT ?? 9877), "127.0.0.1", () => socket.write(JSON.stringify({ type, params })));
    socket.on("error", reject);
    socket.setTimeout(60000, () => { socket.destroy(); reject(new Error("Blender MCP timeout")); });
    socket.on("data", data => {
      buffer += data;
      let response; try { response = JSON.parse(buffer); } catch { return; }
      socket.end();
      if (response.status !== "success" || response.result?.error) reject(new Error(JSON.stringify(response)));
      else resolve(response.result);
    });
  });
}
const sources = ["kiara_1_dawn", "venice_sunset"];
if (!process.argv.includes("--packed")) for (const asset_id of sources) {
  console.log(await mcp("download_polyhaven_asset", { asset_id, asset_type: "hdris", resolution: "2k", file_format: "hdr" }));
}
console.log(await mcp("execute_code", { code: `import bpy, math
from array import array
for slug in ${JSON.stringify(sources)}:
    source = bpy.data.images[slug + '_2k']
    for width in [2048, 1024]:
        scaled = source.copy()
        scaled.scale(width, width // 2)
        values = array('f', [0.0]) * (width * width // 2 * 4)
        scaled.pixels.foreach_get(values)
        for i in range(0, len(values), 4):
            rgb = [max(0.0, min(16.0, values[i+c])) / 16.0 for c in range(3)]
            multiplier = max(1.0/255.0, math.ceil(max(rgb)*255.0)/255.0)
            for c in range(3): values[i+c] = rgb[c] / multiplier
            values[i+3] = multiplier
        image = bpy.data.images.new('gfx-p1-rgbm', width=width, height=width//2, alpha=True)
        image.colorspace_settings.name = 'Non-Color'
        image.alpha_mode = 'CHANNEL_PACKED'
        image.pixels.foreach_set(values)
        image.file_format = 'PNG'
        image.filepath_raw = ${JSON.stringify(temporary.replaceAll("\\", "/"))} + '/' + slug + '-' + str(width) + '.png'
        image.save()
        bpy.data.images.remove(image)
        bpy.data.images.remove(scaled)
print('Exported four linear RGBM16 panoramas; radiance above 16 is limited (sun is a separate light).')` }));
const encoder = process.env.TOKTX ?? "C:/Program Files/KTX-Software/bin/toktx.exe";
for (const slug of sources) for (const size of [2048, 1024]) {
  const destination = path.join(output, `${slug}-${size}.ktx2`);
  const result = spawnSync(encoder, ["--t2", "--encode", "uastc", "--uastc_quality", "2", "--zcmp", "18", "--assign_oetf", "linear", "--assign_primaries", "bt709", "--target_type", "RGBA", destination, path.join(temporary, `${slug}-${size}.png`)], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr || result.error?.message || "toktx failed");
  console.log(path.relative(root, destination), (await stat(destination)).size);
}
