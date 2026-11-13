import { ACESFilmicToneMapping, PCFShadowMap, WebGLRenderer } from 'three';
import { createStudy } from './scene';
import { createPost } from './post';
import { createMeter, type Cost } from './metrics';
import { INITIAL, SCENES, type Selection } from './settings';

declare global {
  interface Window {
    __aaaBench: { ready: boolean; selection: Selection; select: (value: Selection) => Promise<void>; clean: (value: boolean) => void; cost: () => Cost | undefined; error?: string };
  }
}
function element<T extends HTMLElement>(id: string) { const node = document.getElementById(id); if (!node) throw new Error(`Missing ${id}`); return node as T; }
const canvas = element<HTMLCanvasElement>('frame'), controls = element('controls'), output = element('metrics');
const renderer = new WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
// r187 removed PCFSoftShadowMap. PCFShadowMap now uses hardware filtering + Vogel taps.
renderer.toneMapping = ACESFilmicToneMapping; renderer.shadowMap.enabled = true; renderer.shadowMap.type = PCFShadowMap;
renderer.info.autoReset = false;
let study: Awaited<ReturnType<typeof createStudy>> | undefined;
let post: ReturnType<typeof createPost> | undefined, meter: ReturnType<typeof createMeter> | undefined;
let animation = 0, loading = false, stopped = false, lastOutput = 0;
const selects = { scene: element<HTMLSelectElement>('scene'), variant: element<HTMLSelectElement>('variant'), quality: element<HTMLSelectElement>('quality') };
function size() {
  if (!study || !post) return;
  const scale = window.__aaaBench.selection.quality === 'Low' ? 0.65 : 1;
  const width = Math.max(1, Math.round(innerWidth * scale)), height = Math.max(1, Math.round(innerHeight * scale));
  renderer.setPixelRatio(1); renderer.setSize(width, height, false); post.resize(width, height);
  study.camera.aspect = innerWidth / Math.max(1, innerHeight); study.camera.updateProjectionMatrix();
}
async function select(selection: Selection) {
  if (loading) throw new Error('A study is already loading');
  if (!SCENES.includes(selection.scene) || !['A', 'B', 'C'].includes(selection.variant) || !['Low', 'High'].includes(selection.quality)) throw new Error('Invalid study selection');
  loading = true; window.__aaaBench.ready = false; delete window.__aaaBench.error;
  element('error').hidden = true;
  cancelAnimationFrame(animation); meter?.dispose(); post?.dispose(); study?.dispose();
  meter = undefined; post = undefined; study = undefined;
  Object.values(selects).forEach(select => { select.disabled = true; });
  try {
    window.__aaaBench.selection = { ...selection };
    for (const key of ['scene', 'variant', 'quality'] as const) selects[key].value = selection[key];
    output.textContent = 'Đang dựng và làm nóng shader…';
    study = await createStudy(renderer, selection);
    renderer.toneMappingExposure = study.exposure;
    post = createPost(renderer, study.scene, study.camera, selection, study.focus);
    size(); renderer.shadowMap.needsUpdate = true; renderer.shadowMap.autoUpdate = true;
    meter = createMeter(renderer); animation = requestAnimationFrame(render);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    window.__aaaBench.error = message; element('error').hidden = false; element('error').textContent = message;
    throw error;
  } finally { loading = false; Object.values(selects).forEach(select => { select.disabled = false; }); }
}
function render(now: number) {
  if (stopped || !study || !post || !meter) return;
  meter.begin(now); post.render(); meter.end();
  window.__aaaBench.ready = meter.ready;
  if (meter.ready && now - lastOutput >= 250) {
    lastOutput = now;
    const cost = meter.report(), gpu = cost.gpuMedianMs === null ? 'không hỗ trợ timer query' : `${cost.gpuMedianMs.toFixed(2)} ms`;
    output.textContent = `${cost.calls} draw · ${cost.triangles.toLocaleString('vi')} tam giác\nGPU: ${gpu}\nRAF p50/p95: ${cost.frameMedianMs.toFixed(1)} / ${cost.frameP95Ms.toFixed(1)} ms\n${cost.width} × ${cost.height} nội bộ · ${cost.samples} mẫu`;
  }
  animation = requestAnimationFrame(render);
}
window.__aaaBench = { ready: false, selection: { ...INITIAL }, select, clean: value => { controls.hidden = value; }, cost: () => meter?.report() };
for (const selectInput of Object.values(selects)) selectInput.addEventListener('change', () => {
  void select({ scene: selects.scene.value, variant: selects.variant.value, quality: selects.quality.value } as Selection).catch(() => {});
});
element('clean').addEventListener('click', () => { controls.hidden = true; });
window.addEventListener('keydown', event => { if (event.code === 'KeyH' && !(event.target instanceof HTMLSelectElement)) controls.hidden = !controls.hidden; });
window.addEventListener('resize', () => {
  if (loading || !study || !post) return;
  size(); meter?.dispose(); meter = createMeter(renderer); window.__aaaBench.ready = false;
});
window.addEventListener('pagehide', () => { stopped = true; cancelAnimationFrame(animation); meter?.dispose(); post?.dispose(); study?.dispose(); renderer.dispose(); }, { once: true });
void select(INITIAL).catch(() => {});
