export function parseBrlInput(value: string): number | undefined {
  const normalized = value.trim().replace(',','.');
  if (!/^\d{1,12}(\.\d{1,2})?$/.test(normalized)) return undefined;
  const [whole,fraction=''] = normalized.split('.');
  return Number(whole) * 100 + Number(fraction.padEnd(2,'0'));
}

export function defaultBrlInput(value: number | undefined) {
  return value === undefined ? '' : (value/100).toFixed(2).replace('.',',');
}
