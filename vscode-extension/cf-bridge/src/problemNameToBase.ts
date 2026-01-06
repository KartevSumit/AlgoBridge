export function problemNameToBase(name: string): string {
  return name
    .replace(/^[A-Z]\.\s*/, '')
    .replace(/[^\w\s]/g, '')
    .trim()
    .replace(/\s+/g, '_');
}

export function problemNameToFilePrefix(name: string): string {
  const m = name.match(/^([A-Z])\.\s*(.+)$/);
  if (!m) return problemNameToBase(name);
  return `${m[1]}_${problemNameToBase(m[2])}`;
}
