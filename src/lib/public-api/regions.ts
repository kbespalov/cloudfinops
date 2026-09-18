/** Extract only explicit, recognized provider codes; never infer them from geography. */
export function regionCodes(label: string | null): string[] {
  if (!label) return [];
  const codes = label.match(/(?<![\p{L}\p{N}_-])(?:ru-\d+[a-z]?|ru-central\d+(?:-[a-z])?|ru-msk|kz-\d+[a-z]?|mz\d+)(?![\p{L}\p{N}_-])/giu) ?? [];
  return [...new Set(codes.map(code => code.toLowerCase()))];
}

export function regionCode(label: string | null): string | null {
  const codes = regionCodes(label);
  return codes.length === 1 ? codes[0] : null;
}

/** Labels are exact; codes are case-insensitive and match any member of a group. */
export function matchesRegion(label: string | null, filter: string): boolean {
  return label === filter || regionCodes(label).includes(filter.toLowerCase());
}

/** Prefer an observed label (which can contain commas) over legacy CSV splitting. */
export function parseRegionFilters(values: string[], observedLabels: Iterable<string>): string[] {
  const labels = new Set(observedLabels);
  return values.flatMap(value => {
    const trimmed = value.trim();
    return labels.has(trimmed) ? [trimmed] : trimmed.split(',').map(part => part.trim()).filter(Boolean);
  });
}
