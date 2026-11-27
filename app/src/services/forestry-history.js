const DAY_MS = 86400000;
const MODELS = new Set(['M04_14', 'M', '6T', 'Y']);

function isDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const time = Date.parse(value);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value;
}

export function isForestryHistoryEntry(entry) {
  return !!entry && typeof entry.source === 'string' && typeof entry.createdAt === 'string' &&
    Number.isFinite(Date.parse(entry.createdAt)) && isDate(entry.from) && isDate(entry.to) && entry.from <= entry.to &&
    Array.isArray(entry.selected) && entry.selected.length > 0 && entry.selected.every(model => MODELS.has(model)) &&
    Number.isFinite(entry.opening) && (entry.closing === null || Number.isFinite(entry.closing));
}

export function closingStock(reports) {
  const daily = reports.find(report => report.name === 'RP_MAU04');
  if (daily?.rows.length) return daily.rows.at(-1)[15];
  const periodic = reports.find(report => report.name.startsWith('RP_MAU29_'));
  return periodic?.rows.at(-1)?.[8] ?? null;
}

export function latestForestryClosing(history, from, { source, company, intake }) {
  if (!isDate(from) || !source || !company || !intake) return undefined;
  const previousDay = new Date(Date.parse(from) - DAY_MS).toISOString().slice(0, 10);
  return history.filter(entry => entry.source === source && entry.company === company &&
    entry.intake === intake && entry.to === previousDay && Number.isFinite(entry.closing))
    .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))[0];
}
