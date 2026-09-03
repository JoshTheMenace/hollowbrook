import { defineConfig } from 'vite';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Dev-only frame grabber: the page POSTs a rendered frame (and, for the game
 * page, a HUD side-channel) and the server writes `.shots/<name>.jpg`.  Same
 * endpoint every project in this campaign uses; `window.__shot` / `__gshot`
 * in the entries call it.  Not part of the build.
 */
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
            const data = String(body.data || '').replace(/^data:image\/\w+;base64,/, '');
            const file = path.join(outDir, name.endsWith('.jpg') ? name : name + '.jpg');
            fs.writeFileSync(file, Buffer.from(data, 'base64'));
            let uiFile = null;
            if (body.ui) {
              uiFile = file.replace(/\.jpg$/, '.ui.json');
              fs.writeFileSync(uiFile, JSON.stringify(body.ui, null, 1));
            }
            res.setHeader('content-type', 'application/json');
            res.end(JSON.stringify({ ok: true, file, uiFile, bytes: data.length }));
          } catch (e) { res.statusCode = 500; res.end(String(e)); }
        });
      });
    },
  };
}

/* CharForge / SoundForge live in the sibling repo dir.  Alias them in and pin
 * `three` to THIS project's copy so an aliased module cannot pull a second
 * three instance from charforge's own node_modules (0.170 vs 0.180 clash —
 * nightbloom TRAPS.md).  `resolve.dedupe`, never a path alias for `three`:
 * an alias bypasses the package's `exports` and breaks `three/addons/*`. */
const FORGE = path.resolve(process.cwd(), '../charforge/src');
const FORGE_PUBLIC = path.resolve(process.cwd(), '../charforge/public');
// Mira's acting contract (normalizePlan): every NPC line in src/game/script.js
// is validated through it at module load
const MIRA = path.resolve(process.cwd(), '../src');

export default defineConfig({
  base: './',
  plugins: [frameGrabber(path.resolve(process.cwd(), '.shots'))],
  resolve: { alias: { '@forge': FORGE }, dedupe: ['three'] },
  // Dev servers for this project live on 5220-5229 only (campaign rule).
  server: {
    host: '127.0.0.1', port: 5220, strictPort: true,
    watch: { ignored: ['**/.shots/**'] },      // a capture must not HMR-reload a run
    fs: { allow: [process.cwd(), FORGE, FORGE_PUBLIC, MIRA] },
  },
  preview: { host: '127.0.0.1', port: 5221 },
  build: { target: 'es2020', assetsInlineLimit: 0 },
});
