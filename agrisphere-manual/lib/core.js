import { randomUUID } from 'node:crypto';

export function seed() {
  const day = new Date().toISOString().slice(0, 10);
  return { version: 1, profile: { name: 'Demo Farmer', location: 'Ashta, Madhya Pradesh', farmName: 'Green Acres', area: 2.5, crop: 'Soybean', soil: 'Not tested', language: 'English', reminders: true, aiConsent: false },
    records: [ { id: randomUUID(), date: day, type: 'expense', category: 'Seeds', amount: 3200, note: 'Sample entry', sample: true }, { id: randomUUID(), date: day, type: 'expense', category: 'Labour', amount: 1800, note: 'Sample entry', sample: true } ], conversations: [], reports: [], reminders: [] };
}
export function fail(message, status = 400) { throw Object.assign(new Error(message), { status }); }
export function str(v, name, max = 200, optional = false) {
  if (typeof v !== 'string' || (!optional && !v.trim()) || v.length > max) fail(`${name} must be text, ${optional ? '0' : '1'}–${max} characters.`);
  return v.trim();
}
export function num(v, name, min = 0, max = 1e9) {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max) fail(`${name} must be a number between ${min} and ${max}.`);
  return v;
}
export function date(v) {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v) || !Number.isFinite(Date.parse(v)) || new Date(v).toISOString().slice(0, 10) !== v) fail('Use a valid date in YYYY-MM-DD format.');
  return v;
}
export function profileInput(b) {
  if (!['English', 'Hindi'].includes(b.language)) fail('Unsupported language.');
  for (const key of ['reminders', 'aiConsent']) if (typeof b[key] !== 'boolean') fail(`${key} must be true or false.`);
  return { name: str(b.name, 'Name'), location: str(b.location, 'Location'), farmName: str(b.farmName, 'Farm name'), area: num(b.area, 'Area (hectares)', 0.01, 1e6), crop: str(b.crop, 'Crop'), soil: str(b.soil, 'Soil', 300), language: b.language, reminders: b.reminders, aiConsent: b.aiConsent };
}
export function recordInput(b) {
  if (!['expense', 'revenue'].includes(b.type)) fail('Record type must be expense or revenue.');
  return { id: randomUUID(), date: date(b.date), type: b.type, category: str(b.category, 'Category', 80), amount: num(b.amount, 'Amount'), note: str(b.note ?? '', 'Note', 1000, true), sample: false };
}
export function analytics(records) {
  const expenses = records.filter(r => r.type === 'expense').reduce((n, r) => n + r.amount, 0);
  const revenue = records.filter(r => r.type === 'revenue').reduce((n, r) => n + r.amount, 0);
  const categories = Object.create(null);
  for (const r of records.filter(r => r.type === 'expense')) categories[r.category] = (categories[r.category] || 0) + r.amount;
  return { expenses, revenue, balance: revenue - expenses, count: records.length, categories, containsSampleData: records.some(r => r.sample) };
}
export const escapeHtml = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export function reportHTML(r) {
  const e = escapeHtml, a = r.analytics;
  return `<!doctype html><html lang="en"><meta charset="utf-8"><title>Agrisphere farm report</title><style>body{font:16px/1.6 system-ui;max-width:900px;margin:40px auto;padding:24px;color:#153b2a}h1{font-size:32px}table{border-collapse:collapse;width:100%}td,th{padding:9px;border-bottom:1px solid #ddd;text-align:left}thead{display:table-header-group}tr{break-inside:avoid}.notice{background:#fff4d8;padding:12px}@media print{body{margin:0;padding:0}a{color:inherit}}</style><h1>Agrisphere / Farm report</h1><p>${e(r.profile.farmName)} · ${e(r.profile.location)}<br>${e(r.from)} to ${e(r.to)} · Generated ${e(r.createdAt)}</p>${a.containsSampleData ? '<p class="notice">SAMPLE DATA INCLUDED — not a real farm assessment.</p>' : ''}<p>Crop: ${e(r.profile.crop)} · Area: ${e(r.profile.area)} hectares</p><h2>Recorded financial activity</h2><p>Revenue: INR ${a.revenue.toFixed(2)}<br>Expenses: INR ${a.expenses.toFixed(2)}<br>Cash balance: INR ${a.balance.toFixed(2)}</p><p>${e(r.summary)}</p><h2>Records</h2><table><thead><tr><th>Date</th><th>Type</th><th>Category</th><th>INR</th><th>Note</th></tr></thead><tbody>${r.records.map(x => `<tr><td>${e(x.date)}</td><td>${e(x.type)}</td><td>${e(x.category)}</td><td>${x.amount.toFixed(2)}</td><td>${e(x.note)}${x.sample ? ' (sample)' : ''}</td></tr>`).join('')}</tbody></table><p>Use your browser Print command and choose Save as PDF. This is a deterministic record summary, not an AI-generated agronomic assessment. No weather, yield or disease prediction is included.</p></html>`;
}
export function reportCSV(r) {
  const cell = v => { let s = String(v); if (/^[\s]*[=+@-]/.test(s)) s = "'" + s; return '"' + s.replaceAll('"', '""') + '"'; };
  return '\uFEFF' + [['Date', 'Type', 'Category', 'Amount INR', 'Note', 'Sample'], ...r.records.map(x => [x.date, x.type, x.category, x.amount, x.note, x.sample])].map(row => row.map(cell).join(',')).join('\r\n');
}
