export function formatDocumentDate(date) {
  const pad = (value) => String(value).padStart(2, '0');
  const hours = date.getHours();
  return `${String(date.getFullYear()).padStart(4, '0')}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(hours % 12 || 12)}:${pad(date.getMinutes())}${hours < 12 ? 'am' : 'pm'}`;
}
