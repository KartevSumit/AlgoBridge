export function problemNameToFilePrefix(name: string): string {

  const letterMatch = name.match(/\b([A-Z])\b/);
  const letter = letterMatch ? letterMatch[1] : '';

  const base = name
    .replace(/^[A-Z]\.\s*/, '')
    .replace(/^\d+[A-Z]\s*-\s*/, '')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .join('_');

  return letter ? `${letter}_${base}` : base;
}
