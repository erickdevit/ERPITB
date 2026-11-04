const brazilDate = /^\d{2}\/\d{2}\/\d{4}$/;
const isoDate = /^\d{4}-\d{2}-\d{2}$/;

export function formatDate(value?: string | null): string {
  if (!value || !isoDate.test(value)) return '';
  const [year, month, day] = value.split('-');
  return `${day}/${month}/${year}`;
}

export function displayDate(value?: string | null): string {
  return formatDate(value) || '—';
}

export function parseBrazilDate(value: string, { allowFuture = false }: { allowFuture?: boolean } = {}): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!brazilDate.test(trimmed)) throw new Error('Informe a data no formato dd/mm/aaaa.');
  const [dayText, monthText, yearText] = trimmed.split('/');
  const day = Number(dayText); const month = Number(monthText); const year = Number(yearText);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) throw new Error('A data informada não existe.');
  const canonical = `${yearText}-${monthText}-${dayText}`;
  if (!allowFuture && canonical > todayInSaoPaulo()) throw new Error('A data não pode estar no futuro.');
  return canonical;
}

export function todayInSaoPaulo(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

export function toDateInput(value?: string | null): string { return value && isoDate.test(value) ? value : ''; }
