const storageKey = 'baocaongay_display_format';
const defaults = { number: 'vi-VN', date: 'dd/mm/yyyy' };
const dates = ['dd/mm/yyyy', 'dd-mm-yyyy', 'yyyy-mm-dd'];

function normalize(value) {
  return {
    number: value?.number === 'en-US' ? 'en-US' : defaults.number,
    date: dates.includes(value?.date) ? value.date : defaults.date,
  };
}

let preferences = defaults;
try { preferences = normalize(JSON.parse(globalThis.localStorage?.getItem(storageKey) ?? 'null')); } catch { /* dùng mặc định */ }

export function getDisplayFormat() { return { ...preferences }; }

export function setDisplayFormat(value) {
  preferences = normalize(value);
  try { globalThis.localStorage?.setItem(storageKey, JSON.stringify(preferences)); } catch { /* dùng trong phiên */ }
}

export function displayGroupedNumber(value) {
  return preferences.number === 'vi-VN' ? value : value.replace(/[.,]/g, mark => mark === '.' ? ',' : '.');
}

const numberFormats = new Map();
export function displayDecimal(value, maximumFractionDigits = 0, minimumFractionDigits = 0) {
  const key = [preferences.number, maximumFractionDigits, minimumFractionDigits].join(':');
  if (!numberFormats.has(key)) {
    numberFormats.set(key, new Intl.NumberFormat(preferences.number, { maximumFractionDigits, minimumFractionDigits }));
  }
  return numberFormats.get(key).format(value);
}

export function displayDateParts(year, month, day) {
  const y = String(year).padStart(4, '0');
  const m = String(month).padStart(2, '0');
  const d = String(day).padStart(2, '0');
  if (preferences.date === 'yyyy-mm-dd') return [y, m, d].join('-');
  return [d, m, y].join(preferences.date === 'dd-mm-yyyy' ? '-' : '/');
}

const vnDate = new Intl.DateTimeFormat('sv-SE', { dateStyle: 'short', timeZone: 'Asia/Ho_Chi_Minh' });
const vnTime = new Intl.DateTimeFormat('vi-VN', { timeStyle: 'short', timeZone: 'Asia/Ho_Chi_Minh' });
export function displayVietnamDateTime(date) {
  return vnTime.format(date) + ' ' + displayDateParts(...vnDate.format(date).split('-'));
}

export function excelDateFormat() { return preferences.date; }

export function initDisplayFormat(onChange) {
  const number = document.getElementById('settingsNumberFormat');
  const date = document.getElementById('settingsDateFormat');
  const preview = document.getElementById('settingsFormatPreview');
  function render() {
    number.value = preferences.number;
    date.value = preferences.date;
    preview.textContent = displayDecimal(1234.56, 2, 2) + ' · ' + displayDateParts(2026, 11, 27);
  }
  function update() {
    setDisplayFormat({ number: number.value, date: date.value });
    render();
    onChange();
    document.dispatchEvent(new Event('displayformatchange'));
  }
  render();
  number.addEventListener('change', update);
  date.addEventListener('change', update);
}
