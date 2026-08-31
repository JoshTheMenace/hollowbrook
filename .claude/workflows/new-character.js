export const meta = {
  name: 'new-character',
  description: 'Build one polished animated character from a prompt: builder -> evaluator -> conditional repair',
  whenToUse: 'Invoke with args {name: "snake-case-id", brief: "character description"} to add a character to the CharForge roster.',
  phases: [
    { title: 'Build' },
    { title: 'Evaluate' },
    { title: 'Repair' },
  ],
}

const DIR = '/Users/joshthemenace/Documents/ChatGPT/animation/charforge';
const { name, brief, model } = args || {};
if (!name || !brief) throw new Error('args {name, brief} required');
const M = model ? { model } : {};  // e.g. 'sonnet' | 'opus' — applied to every agent

const BUILDER_PROMPT = `You are a character-builder agent for the CharForge kit at ${DIR}.

STEP 1: Read ${DIR}/KIT.md fully — it is your contract — and read ${DIR}/src/characters/brute.js as the worked example.
STEP 2: Register '${name}' in ${DIR}/src/characters/index.js (add "  ${name}: () => import('./${name}.js')," to the characters object) and create ${DIR}/src/characters/${name}.js. Brief:
${brief}
STEP 3: Follow the KIT.md loop exactly: run 'node scripts/check-character.mjs ${name}' AND 'node scripts/check-anatomy.mjs ${name}' (and, if the character carries a prop, add a spec to scripts/check-weapons.mjs and run it) from ${DIR} until ALL PASS, then capture renders in your own browser tab and READ every image, then do at least 2 visual repair passes fixing the single worst defect each time.

Browser access: load tools with ToolSearch query "select:mcp__Claude_Browser__tabs_create,mcp__Claude_Browser__navigate,mcp__Claude_Browser__javascript_tool" (one call). The dev server is already running at http://localhost:5186 (if it is not, start it with the Browser preview_start tool, config name "charforge"). Create YOUR OWN tab, pass your tabId on every call, close only your own tab when done. Use await __lab.load('${name}') after each edit, then the __shot/__turntable/__strip/__silhouette calls from KIT.md with shot names prefixed '${name}-'.

Final captures must exist: .shots/${name}-hero.png, -turn.png, -walk.png, -attack.png, -sil.png.
Finally export the asset: await __export('${name}') (writes exports/${name}.glb).

Return raw data: what you built, final gate result, per-image honest description, remaining defects.`;

const EVAL_SCHEMA = {
  type: 'object',
  required: ['scores', 'mean', 'verdict', 'directives'],
  properties: {
    scores: { type: 'array', items: { type: 'object', required: ['criterion', 'score', 'note'], properties: { criterion: { type: 'string' }, score: { type: 'number' }, note: { type: 'string' } } } },
    mean: { type: 'number' },
    verdict: { type: 'string', enum: ['pass', 'repair'] },
    directives: { type: 'array', items: { type: 'string' } },
  },
};

const EVAL_PROMPT = `You are an independent art evaluator. You did NOT build this character; builder optimism is a known bias — be strict.

Read these images (Read tool): ${DIR}/.shots/${name}-hero.png, ${name}-turn.png, ${name}-walk.png, ${name}-attack.png, ${name}-sil.png. Also run 'node scripts/check-character.mjs ${name}' AND 'node scripts/check-anatomy.mjs ${name}' (and, if the character carries a prop, add a spec to scripts/check-weapons.mjs and run it) from ${DIR}.

Score 0-5 each with a one-line note: silhouette (reads small, not a blob), proportions (chibi 2-3 heads, oversized hands/prop), palette (one ID color + supports, contrast), assembly (no detached/sunk/shelf parts), grounding (floor contact + shadow every frame), walk-weight (hip drop, bob, counter-swing), attack-read (anticipation > strike, pose reads), idle-life (frames differ, asymmetry), cohesion (one style, detail at face/prop).

verdict 'pass' if mean >= 3.5 AND no score <= 2, else 'repair'. directives: up to 3 concrete file-level fixes for src/characters/${name}.js if repair, else [].`;

phase('Build');
await agent(BUILDER_PROMPT, { label: `build:${name}`, ...M });

phase('Evaluate');
const ev1 = await agent(EVAL_PROMPT, { label: `eval:${name}`, schema: EVAL_SCHEMA, ...M });

let final = ev1, repaired = false;
if (ev1.verdict === 'repair') {
  phase('Repair');
  repaired = true;
  await agent(`Repair character '${name}' in the CharForge kit at ${DIR}. Read ${DIR}/KIT.md and ${DIR}/src/characters/${name}.js. Apply these evaluator directives, most impactful first:\n${ev1.directives.map((d, i) => `${i + 1}. ${d}`).join('\n')}\nThen re-run the gates until ALL PASS, recapture all five shots (same names) per KIT.md browser discipline, READ the new images to verify each directive is fixed, and re-export with __export('${name}').`, { label: `repair:${name}`, phase: 'Repair', ...M });
  final = await agent(EVAL_PROMPT, { label: `re-eval:${name}`, phase: 'Repair', schema: EVAL_SCHEMA, ...M });
}

log(`${name}: mean ${final.mean} (${final.verdict})${repaired ? ' after repair' : ''}`);
return { name, repaired, mean: final.mean, verdict: final.verdict, scores: final.scores, outstanding: final.verdict === 'repair' ? final.directives : [] };
