export function closingStock(reports) {
  const daily = reports.find(report => report.name === 'RP_MAU04');
  if (daily?.rows.length) return daily.rows.at(-1)[15];
  const periodic = reports.find(report => report.name.startsWith('RP_MAU29_'));
  return periodic?.rows.at(-1)?.[8] ?? null;
}

export function latestForestryClosing(history, from, source) {
  if (!from || !source) return undefined;
  return history
    .filter(entry => entry.source === source && entry.to < from && Number.isFinite(entry.closing))
    .sort((left, right) => right.to.localeCompare(left.to) || right.createdAt.localeCompare(left.createdAt))[0];
}
