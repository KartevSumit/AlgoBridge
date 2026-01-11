export function problemNameToFilePrefix(name: string): string {
  const match = name.match(/^([A-Z]+)(\d*)\.\s*(.*)$/);

  if (!match) {
    return name
      .replace(/[^A-Za-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
  }

  const [, letter, number, title] = match;

  const indexPart = number ? `${letter}_${number}` : letter;

  const cleanTitle = title
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

  return `${indexPart}_${cleanTitle}`;
}
