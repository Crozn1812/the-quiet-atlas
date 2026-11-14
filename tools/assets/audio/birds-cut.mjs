#!/usr/bin/env node
// Recreate all clips, licence rows, measurements, and the 30 s forest audition:
//   node tools/assets/audio/birds-cut.mjs
// Requires local ffmpeg/ffprobe (libopus); never downloads or edits source files.
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const sourceDir = resolve(root, "assets/audio-src/birds");
const outputDir = resolve(root, "public/audio/birds");
const evidenceDir = resolve(root, "test-results/audio-birds");
mkdirSync(outputDir, { recursive: true });
mkdirSync(evidenceDir, { recursive: true });

// Source intervals in seconds, selected from the supplied recordings' spectra.
// Avoid the sparrow recording's noisy 40–44 s and the bulbul's low-frequency bump.
// The robin source is only 1.367 s: its three trims overlap; these are NOT three
// independent phrases. No looping, time stretching, or generated notes in assets.
export const cuts = [
  { species: "tailorbird", file: "Cambodia_tailorbird.ogg", highpass: 1800,
    clips: [[0.15, 3.2], [4.15, 3.15], [8.1, 3.6], [12.35, 3.25]] },
  { species: "sparrow", file: "House_Sparrow_202279702.wav", highpass: 1800,
    clips: [[1.7, 1.3], [4.3, 1.4], [6.5, 1.6], [8.5, 1.5], [16.6, 1.7]] },
  { species: "magpie-robin", file: "Oriental_magpie-robin_call.ogg", highpass: 900,
    clips: [[0, 1.36], [0, 1.1], [0.22, 1.14]] },
  { species: "bulbul", file: "Pycnonotus_sinensis_call.ogg", highpass: 1400,
    clips: [[0, 1.05], [1.45, 2.05], [8.2, 1.47]] },
  { species: "gull", file: "XC707075_-_European_Herring_Gull_-_Larus_argentatus.mp3", highpass: 350,
    clips: [[0.15, 3.3], [4.55, 3.4], [8.15, 2.6]] },
];

const commands = [];
function run(program, args) {
  commands.push({ program, args });
  const result = spawnSync(program, args, { cwd: root, encoding: "utf8", windowsHide: true, maxBuffer: 8 * 1024 * 1024 });
  if (result.error || result.status !== 0) throw result.error ?? new Error(`${program}: ${result.stderr}`);
  return result;
}
const sources = readFileSync(resolve(sourceDir, "SOURCES.md"), "utf8");
const licencePath = resolve(root, "assets/LICENSES.csv");
const originalCsv = readFileSync(licencePath, "utf8");
const licenceRows = originalCsv.split(/\r?\n/).filter(line => line && !/^"?public\/audio\/birds\//.test(line));
const csv = value => `"${String(value).replaceAll('"', '""')}"`;
const report = [];

for (const { species, file, highpass, clips } of cuts) {
  const row = sources.split(/\r?\n/).find(line => line.startsWith(`| ${file} |`));
  if (!row) throw new Error(`Missing source provenance: ${file}`);
  const [, , , author, licence, page] = row.split("|").map(cell => cell.trim());
  if (!licence.startsWith("CC0") || !page.startsWith("https://commons.wikimedia.org/wiki/File:")) throw new Error(`Unexpected licence: ${file}`);
  for (const [index, [start, duration]] of clips.entries()) {
    const filename = `${species}-${index + 1}.ogg`;
    const output = resolve(outputDir, filename);
    const base = ["-hide_banner", "-nostdin", "-y", "-ss", String(start), "-t", String(duration), "-i", resolve(sourceDir, file), "-vn"];
    // Gentle spectral cleanup, then two-pass EBU R128 normalization to -25 LUFS.
    // Preserve a bird's natural phrase dynamics; matching integrated loudness only.
    const cleanup = `aformat=channel_layouts=mono,highpass=f=${highpass}:p=2,lowpass=f=11000,afftdn=nr=8:nf=-45:tn=1`;
    const norm = "loudnorm=I=-25:TP=-3:LRA=7";
    const measure = run("ffmpeg", [...base, "-af", `${cleanup},${norm}:print_format=json`, "-f", "null", "-"]);
    const stats = JSON.parse(measure.stderr.match(/\{\s*"input_i"[\s\S]*?\}/)?.[0] ?? "null");
    if (!stats || !Number.isFinite(Number(stats.input_i))) throw new Error(`Silent cut: ${filename}`);
    const measured = `:measured_I=${stats.input_i}:measured_TP=${stats.input_tp}:measured_LRA=${stats.input_lra}:measured_thresh=${stats.input_thresh}:offset=${stats.target_offset}:linear=true`;
    const fades = `afade=t=in:st=0:d=0.03,afade=t=out:st=${(duration - 0.04).toFixed(3)}:d=0.04`;
    run("ffmpeg", [...base, "-af", `${cleanup},${norm}${measured},${fades}`, "-ar", "48000", "-ac", "1", "-c:a", "libopus", "-b:a", "56k", "-vbr", "on", "-application", "audio", "-map_metadata", "-1", output]);
    const probe = JSON.parse(run("ffprobe", ["-v", "error", "-show_entries", "format=duration:stream=codec_name,channels,sample_rate", "-of", "json", output]).stdout);
    const loudness = run("ffmpeg", ["-hide_banner", "-nostdin", "-i", output, "-af", `${norm}:print_format=json`, "-f", "null", "-"]);
    const finalStats = JSON.parse(loudness.stderr.match(/\{\s*"input_i"[\s\S]*?\}/)[0]);
    const stream = probe.streams[0];
    if (stream.codec_name !== "opus" || stream.channels !== 1 || stream.sample_rate !== "48000") throw new Error(`Bad encoding: ${filename}`);
    report.push({ file: filename, species, start, seconds: duration, containerSeconds: Number(probe.format.duration), bytes: statSync(output).size, lufs: Number(finalStats.input_i), truePeakDb: Number(finalStats.input_tp) });
    licenceRows.push([`public/audio/birds/${filename}`, `${author} / ${page}`, "CC0-1.0", "yes", "yes", "yes", author, `${page} ; https://creativecommons.org/publicdomain/zero/1.0/ ; trimmed/filtered/normalized via tools/assets/audio/birds-cut.mjs`, "-", "-", "-", "-"].map(csv).join(","));
  }
}

// Dry audition: the same cleaned clips, separated by rests, no gulls or synth.
const preview = [["tailorbird-1.ogg", 800], ["sparrow-2.ogg", 5200], ["magpie-robin-1.ogg", 10000], ["bulbul-3.ogg", 14000], ["tailorbird-3.ogg", 19000], ["sparrow-4.ogg", 24000], ["bulbul-2.ogg", 27000]];
const inputs = preview.flatMap(([file]) => ["-i", resolve(outputDir, file)]);
const filters = preview.map(([, delay], index) => `[${index}:a]adelay=${delay}:all=1[p${index}]`).join(";");
const mix = `${preview.map((_, index) => `[p${index}]`).join("")}amix=inputs=${preview.length}:normalize=0,apad,atrim=duration=30,afade=t=out:st=29.95:d=0.05[out]`;
run("ffmpeg", ["-hide_banner", "-nostdin", "-y", ...inputs, "-filter_complex", `${filters};${mix}`, "-map", "[out]", "-ar", "48000", "-ac", "1", "-c:a", "libopus", "-b:a", "64k", resolve(evidenceDir, "preview.ogg")]);
writeFileSync(licencePath, licenceRows.join("\n") + "\n");
writeFileSync(resolve(evidenceDir, "clips.json"), JSON.stringify(report, null, 2) + "\n");
writeFileSync(resolve(evidenceDir, "ffmpeg-commands.json"), JSON.stringify(commands, null, 2) + "\n");
writeFileSync(resolve(evidenceDir, "clips.md"), "| File | Species | Seconds | Bytes | LUFS | True peak dB |\n|---|---|---:|---:|---:|---:|\n" + report.map(r => `| ${r.file} | ${r.species} | ${r.seconds.toFixed(3)} | ${r.bytes} | ${r.lufs} | ${r.truePeakDb} |`).join("\n") + "\n\nOpus containers include 6.5 ms decoder pre-skip; audible durations above exclude it.\n");
console.log(`Bird cuts: ${report.length} mono Opus clips, ${report.reduce((sum, clip) => sum + clip.bytes, 0)} bytes; preview: 30 s.`);
console.log(`LUFS range: ${Math.min(...report.map(r => r.lufs))} to ${Math.max(...report.map(r => r.lufs))}; peak: ${Math.max(...report.map(r => r.truePeakDb))} dBTP.`);
