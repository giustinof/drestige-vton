/**
 * Utility condivise per formattare e integrare Composizione e Made in
 * nella descrizione prodotto, esattamente sotto "Modello <codice>.".
 */

export function normalizeComposition(value) {
  if (!value || typeof value !== 'string') return '';
  return value
    .replace(/^\s*composizione\s*:?\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeMadeIn(value) {
  if (!value || typeof value !== 'string') return '';
  const cleaned = value.replace(/\s+/g, ' ').trim();
  if (!cleaned) return '';
  const withoutPrefix = cleaned
    .replace(/^(?:made\s+in|prodotto\s+in|fabbricato\s+in)\s*:?\s*/i, '')
    .trim();
  if (!withoutPrefix) return '';
  return `Made in ${withoutPrefix}`;
}

export function formatCompositionLines(composition, madeIn) {
  const lines = [];
  const cleanComp = normalizeComposition(composition);
  const cleanMadeIn = normalizeMadeIn(madeIn);

  if (cleanComp) {
    lines.push(`Composizione: ${cleanComp}`);
  }
  if (cleanMadeIn) {
    lines.push(cleanMadeIn);
  }
  return lines.join('\n');
}

export function stripTrailingComposition(description) {
  if (!description || typeof description !== 'string') return '';
  const lines = description.replace(/\r\n/g, '\n').split('\n');

  while (lines.length > 0 && lines[lines.length - 1].trim() === '') {
    lines.pop();
  }

  while (
    lines.length > 0 &&
    /^(?:composizione\s*:|made\s+in\b)/i.test(lines[lines.length - 1].trim())
  ) {
    lines.pop();
    while (lines.length > 0 && lines[lines.length - 1].trim() === '') {
      lines.pop();
    }
  }

  return lines.join('\n').trim();
}

export function appendCompositionToDescription(description, composition, madeIn) {
  const base = stripTrailingComposition(description || '');
  const block = formatCompositionLines(composition, madeIn);

  if (!block) return base;
  if (!base) return block;
  return `${base}\n${block}`;
}
