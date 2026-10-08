// Build check for the /content folder. Run it with:  node scripts/validate-content.mjs
// It fails (exit code 1) if anything is wrong, which stops the site from being published.
//
// It checks, for every pack listed in content/manifest.json:
// - the manifest itself (ids, titles, versions, types, plain file names)
// - the pack file exists, and every file in content/ is listed (no forgotten packs)
// - resource packs: every row is valid in the "identity-lab-coach.resources.v1" format
// - card packs: every card is valid, has a reference, and is never marked verified
// - guidance packs: every level and how-to-use line is valid and points at a resource that exists
// - lessons packs: every lesson is on a real study day with the right date, and every step points at a resource that exists
// - no id is used twice across packs, and no card id clashes with the built-in flashcards
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { validateManifest, parseCardPack, parseGuidancePack, parseLessonPack } from '../js/content.js';
import { parseResourceImport } from '../js/resource-import.js';
import { SEED_CARDS } from '../js/cards-data.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'content');
const failures = [];
const fail = (message) => failures.push(message);

let manifest;
try {
  manifest = JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8'));
} catch (error) {
  console.error(`content/manifest.json could not be read: ${error.message}`);
  process.exit(1);
}

const checked = validateManifest(manifest);
for (const problem of checked.problems) fail(`manifest.json: ${problem}`);

const listed = new Set(checked.packs.map((p) => p.path));
for (const file of readdirSync(root)) {
  if (file !== 'manifest.json' && file.endsWith('.json') && !listed.has(file)) {
    fail(`content/${file} is not listed in manifest.json (add it, or remove the file).`);
  }
}

const seedIds = new Set(SEED_CARDS.map((c) => c.seedId));
const resourceIds = new Map();
const cardIds = new Map();
let resourceCount = 0;
let cardCount = 0;
let guidanceCount = 0;
let lessonCount = 0;
const guidancePacks = [];
const lessonPacks = [];

for (const pack of checked.packs) {
  let text;
  try {
    text = readFileSync(join(root, pack.path), 'utf8');
  } catch {
    fail(`${pack.id}: the file content/${pack.path} does not exist.`);
    continue;
  }
  if (pack.type === 'resources') {
    const parsed = parseResourceImport(text, []);
    for (const p of parsed.fileProblems) fail(`${pack.id}: ${p}`);
    for (const p of parsed.rowProblems) fail(`${pack.id}: ${p.id ?? `entry ${p.entry}`}: ${p.messages.join(' ')}`);
    for (const row of parsed.rows) {
      if (resourceIds.has(row.id)) fail(`${pack.id}: resource id "${row.id}" is also used in pack "${resourceIds.get(row.id)}".`);
      else resourceIds.set(row.id, pack.id);
    }
    resourceCount += parsed.rows.length;
    for (const w of parsed.warnings) console.log(`note (${pack.id}): ${w.id}: ${w.message}`);
  } else if (pack.type === 'guidance') {
    const parsed = parseGuidancePack(text);
    for (const p of parsed.fileProblems) fail(`${pack.id}: ${p}`);
    for (const p of parsed.rowProblems) fail(`${pack.id}: ${p.id ?? `entry ${p.entry}`}: ${p.messages.join(' ')}`);
    guidanceCount += parsed.guidance.length;
    guidancePacks.push({ pack, parsed });
  } else if (pack.type === 'lessons') {
    const parsed = parseLessonPack(text);
    for (const p of parsed.fileProblems) fail(`${pack.id}: ${p}`);
    for (const p of parsed.rowProblems) fail(`${pack.id}: ${p.id ?? `entry ${p.entry}`}: ${p.messages.join(' ')}`);
    lessonCount += parsed.lessons.length;
    lessonPacks.push({ pack, parsed });
  } else {
    const parsed = parseCardPack(text, { strictVerified: true });
    for (const p of parsed.fileProblems) fail(`${pack.id}: ${p}`);
    for (const p of parsed.rowProblems) fail(`${pack.id}: ${p.id ?? `entry ${p.entry}`}: ${p.messages.join(' ')}`);
    for (const card of parsed.cards) {
      if (seedIds.has(card.id)) fail(`${pack.id}: card id "${card.id}" clashes with a built-in flashcard.`);
      else if (cardIds.has(card.id)) fail(`${pack.id}: card id "${card.id}" is also used in pack "${cardIds.get(card.id)}".`);
      else cardIds.set(card.id, pack.id);
    }
    cardCount += parsed.cards.length;
  }
}

// Guidance and lessons may only point at resources that exist in a resource pack.
const lessonIds = new Set();
for (const { pack, parsed } of guidancePacks) {
  for (const g of parsed.guidance) if (!resourceIds.has(g.id)) fail(`${pack.id}: guidance for "${g.id}", which is not in any resource pack.`);
  for (const c of parsed.dayChanges) if (!resourceIds.has(c.id)) fail(`${pack.id}: day change for "${c.id}", which is not in any resource pack.`);
  const covered = new Set(parsed.guidance.map((g) => g.id));
  for (const id of resourceIds.keys()) if (!covered.has(id)) console.log(`note (${pack.id}): resource "${id}" has no guidance.`);
}
for (const { pack, parsed } of lessonPacks) {
  for (const l of parsed.lessons) {
    if (lessonIds.has(l.id)) fail(`${pack.id}: lesson id "${l.id}" is used twice.`);
    lessonIds.add(l.id);
    for (const s of l.steps) if (s.resourceId && !resourceIds.has(s.resourceId)) fail(`${pack.id}: ${l.id}: a step points at "${s.resourceId}", which is not in any resource pack.`);
  }
}

if (failures.length) {
  console.error(`\nContent check FAILED (${failures.length} problem${failures.length === 1 ? '' : 's'}):`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`Content check passed: ${checked.packs.length} packs, ${resourceCount} resources, ${cardCount} cards, ${guidanceCount} guidance notes, ${lessonCount} lessons.`);
