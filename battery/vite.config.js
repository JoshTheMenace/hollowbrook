import { defineConfig } from 'vite';
import fs from 'node:fs';
import path from 'node:path';

// same evidence endpoint as the other projects: POST /__shot -> .shots/
function frameGrabber(outDir) {
  return {
    name: 'frame-grabber',
    apply: 'serve',
    configureServer(server) {
      fs.mkdirSync(outDir, { recursive: true });
      server.middlewares.use('/__shot', (req, res) => {
        if (req.method !== 'POST') { res.statusCode = 405; return res.end('POST only'); }
        const chunks = [];
        req.on('data', (c) => chunks.push(c));
        req.on('end', () => {
          try {
            const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
            const name = (body.name || 'shot').replace(/[^\w.-]/g, '_');
            const data = String(body.data || body.dataUrl || '').replace(/^data:image\/\w+;base64,/, '');
            const file = path.join(outDir, name + '.jpg');
            fs.writeFileSync(file, Buffer.from(data, 'base64'));
            res.setHeader('content-type', 'application/json');
            res.end(JSON.stringify({ ok: true, file }));
          } catch (e) { res.statusCode = 500; res.end(String(e)); }
        });
      });
    },
  };
}

const FORGE = path.resolve(process.cwd(), '../charforge/src');
const TOWN = path.resolve(process.cwd(), '../nightbloom/src');

export default defineConfig({
  base: './',
  plugins: [frameGrabber(path.resolve(process.cwd(), '.shots'))],
  resolve: { alias: { '@forge': FORGE, '@town': TOWN }, dedupe: ['three'] },
  server: { host: '127.0.0.1', port: 5183, fs: { allow: [process.cwd(), FORGE, TOWN, path.resolve(process.cwd(), '../nightbloom')] } },
});
