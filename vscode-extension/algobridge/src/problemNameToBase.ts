export function problemNameToFilePrefix(name: string): string {
  const letterMatch = name.match(/(?:^|\d+|(?<=\s))([A-Z])(?=\s|\.|$|-)/);
  const letter = letterMatch ? letterMatch[1] : '';

  const base = name
    .replace(/^(?:\d+[A-Z]|[A-Z])[\s.-]*/, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

  return letter ? `${letter}_${base}` : base;
}
