import { defineConfig } from 'vite';
import fs from 'node:fs';
import path from 'node:path';

// Dev-only frame capture endpoint. The page renders a frame (or contact sheet)
// to a data URL and POSTs it here; we write it to .shots/<name>.png so the
// agent can Read the file. Same mechanism Sakura Crossing proved out.
function shotEndpoint() {
  return {
    name: 'shot-endpoint',
    configureServer(server) {
      const dir = path.resolve(__dirname, '.shots');
      fs.mkdirSync(dir, { recursive: true });
      server.middlewares.use('/__shot', (req, res) => {
        if (req.method !== 'POST') { res.statusCode = 405; return res.end(); }
        let body = '';
        req.on('data', (c) => (body += c));
        req.on('end', () => {
          try {
            const { name, dataUrl } = JSON.parse(body);
            const safe = String(name).replace(/[^a-z0-9_-]/gi, '_');
            const b64 = dataUrl.split(',')[1];
            const file = path.join(dir, `${safe}.png`);
            fs.writeFileSync(file, Buffer.from(b64, 'base64'));
            res.setHeader('content-type', 'application/json');
            res.end(JSON.stringify({ ok: true, file }));
          } catch (e) {
            res.statusCode = 400;
            res.end(JSON.stringify({ ok: false, error: String(e) }));
          }
        });
      });
    },
  };
}

// Dev-only GLB save endpoint: the page exports a character with GLTFExporter
// and POSTs the binary (base64) here; written to exports/<name>.glb.
function saveEndpoint() {
  return {
    name: 'save-endpoint',
    configureServer(server) {
      const dir = path.resolve(__dirname, 'exports');
      fs.mkdirSync(dir, { recursive: true });
      server.middlewares.use('/__save', (req, res) => {
        if (req.method !== 'POST') { res.statusCode = 405; return res.end(); }
        let body = '';
        req.on('data', (c) => (body += c));
        req.on('end', () => {
          try {
            const { name, dataB64, ext = 'glb' } = JSON.parse(body);
            const safe = String(name).replace(/[^a-z0-9_-]/gi, '_');
            const safeExt = ['glb', 'gif', 'png', 'json'].includes(ext) ? ext : 'glb';
            const file = path.join(dir, `${safe}.${safeExt}`);
            fs.writeFileSync(file, Buffer.from(dataB64, 'base64'));
            res.setHeader('content-type', 'application/json');
            res.end(JSON.stringify({ ok: true, file, bytes: Buffer.byteLength(dataB64, 'base64') }));
          } catch (e) {
            res.statusCode = 400;
            res.end(JSON.stringify({ ok: false, error: String(e) }));
          }
        });
      });
    },
  };
}

export default defineConfig({
  plugins: [shotEndpoint(), saveEndpoint()],
});
