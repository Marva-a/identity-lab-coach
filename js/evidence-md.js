// Markdown export of published evidence: a case-study-ready file.
// Pure functions only (no page or storage code). The app creates a file on
// your device from this text; nothing is sent anywhere.
import { ARTIFACT_TYPES, PROJECTS, MATURITIES } from './records.js';

/** Escapes text so it shows as written instead of being read as Markdown. */
export function escapeMd(text) {
  return String(text ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/([\\`*_[\]<>])/g, '\\$1')
    .replace(/^(\s*)([#>+-])/gm, '$1\\$2')
    .replace(/^(\s*\d+)([.)])(?=\s)/gm, '$1\\$2');
}

const oneLine = (text) => escapeMd(String(text ?? '').replace(/\s+/g, ' ').trim());

/**
 * Builds the Markdown for published evidence, oldest first. Drafts are never
 * included. A missing maturity or project is written as "Not set".
 */
export function evidenceToMarkdown(artifacts, { exportedOn } = {}) {
  const items = artifacts
    .filter((a) => a.status === 'published' && a.publishedDate)
    .sort((a, b) => a.publishedDate.localeCompare(b.publishedDate) || (a.createdAt ?? '').localeCompare(b.createdAt ?? ''));

  const lines = [
    '# Evidence log',
    '',
    `Exported${exportedOn ? ` on ${exportedOn}` : ''} from Identity Lab Coach: ${items.length} published ${items.length === 1 ? 'item' : 'items'}, oldest first. `
      + 'Maturity is what the author recorded (Implemented, Simulated, Conceptual or Future phase); "Not set" means it was not recorded.',
    '',
  ];
  if (!items.length) lines.push('No published evidence yet.', '');

  for (const a of items) {
    lines.push(`## ${oneLine(a.title)}`, '');
    lines.push(`- **Type:** ${escapeMd(ARTIFACT_TYPES[a.type] ?? a.type)}`);
    lines.push(`- **Project:** ${a.project ? escapeMd(PROJECTS[a.project] ?? a.project) : 'Not set'}`);
    lines.push(`- **Maturity:** ${a.maturity ? escapeMd(MATURITIES[a.maturity] ?? a.maturity) : 'Not set'}`);
    lines.push(`- **Published:** ${a.publishedDate}`);
    lines.push(`- **Skills:** ${a.tags?.length ? a.tags.map(oneLine).join(', ') : 'None recorded'}`);
    if (a.url) {
      let href = null;
      try {
        const u = new URL(String(a.url).trim());
        if (u.protocol === 'http:' || u.protocol === 'https:') href = u.href;
      } catch {
        // an unusable link is left out rather than written as text
      }
      if (href) lines.push(`- **Link:** <${href}>`);
    }
    lines.push('');
    if (String(a.reflection ?? '').trim()) {
      lines.push(`**Reflection.** ${escapeMd(String(a.reflection).trim()).replace(/\n/g, '  \n')}`, '');
    }
  }
  return `${lines.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd()}\n`;
}
