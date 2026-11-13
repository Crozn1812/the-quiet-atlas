import net from 'node:net';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

// Dedicated GFX-P2 Blender MCP worker. Never uses another worker's scene.
export function blenderRequest(type, params = {}, port = 9878) {
  return new Promise((resolve, reject) => {
    let response = '';
    const socket = net.createConnection(port, '127.0.0.1', () => {
      socket.write(JSON.stringify({ type, params }));
    });
    socket.setTimeout(600000, () => socket.destroy(new Error('Blender MCP timeout')));
    socket.on('error', reject);
    socket.on('data', data => {
      response += data;
      let parsed;
      try { parsed = JSON.parse(response); } catch { return; }
      socket.end();
      if (parsed.status === 'error') reject(new Error(JSON.stringify(parsed)));
      else resolve(parsed);
    });
  });
}

if (process.argv[1]?.endsWith('blender-client.mjs')) {
  const [type = 'get_scene_info', argument] = process.argv.slice(2);
  const params = type === 'execute_code' ? { code: `__file__ = ${JSON.stringify(resolve(argument).replaceAll('\\', '/'))}\n` + await readFile(argument, 'utf8') }
    : argument ? JSON.parse(argument) : {};
  console.info(JSON.stringify(await blenderRequest(type, params), null, 2));
}
