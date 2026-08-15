import { useEffect, useState, type PropsWithChildren } from 'react';
import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, FormControl, InputLabel, MenuItem, Select, Stack, TextField } from '@mui/material';
import { parseBrazilDate, formatDate } from './lib/date';

export function Section({ title, action, children }: PropsWithChildren<{ title: string; action?: React.ReactNode }>) {
  void title;
  return <Stack gap={2}>{action && <Stack direction="row" justifyContent="flex-end">{action}</Stack>}{children}</Stack>;
}

export function PageDialog({ open, title, onClose, children, onSave, saveText = 'Salvar' }: PropsWithChildren<{ open: boolean; title: string; onClose: () => void; onSave: () => void; saveText?: string }>) {
  return <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm"><DialogTitle>{title}</DialogTitle><DialogContent><Stack gap={1.5} sx={{ pt: 1 }}>{children}</Stack></DialogContent><DialogActions><Button onClick={onClose}>Cancelar</Button><Button variant="contained" onClick={onSave}>{saveText}</Button></DialogActions></Dialog>;
}

export function DateField({ label, value, onChange, required = false }: { label: string; value: string; onChange: (value: string) => void; required?: boolean }) {
  const [error, setError] = useState<string>();
  useEffect(() => setError(undefined), [value]);
  return <Stack direction="row" gap={1} alignItems="start"><TextField fullWidth label={label} required={required} value={value} placeholder="dd/mm/aaaa" error={Boolean(error)} helperText={error ?? 'Digite ou escolha no calendário.'} onChange={(event) => onChange(event.target.value.replace(/[^0-9/]/g, '').slice(0, 10))} onBlur={() => { try { if (value) onChange(formatDate(parseBrazilDate(value) ?? undefined)); setError(undefined); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Data inválida.'); } }} inputProps={{ inputMode: 'numeric', maxLength: 10 }} /><TextField aria-label={`Calendário: ${label}`} type="date" value={value ? parseDateInput(value) : ''} onChange={(event) => onChange(formatDate(event.target.value))} sx={{ width: 172 }} /></Stack>;
}
function parseDateInput(value: string) { try { return parseBrazilDate(value) ?? ''; } catch { return ''; } }

export function SelectField({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: Array<{ value: string; label: string }> }) {
  return <FormControl fullWidth><InputLabel>{label}</InputLabel><Select label={label} value={value} onChange={(event) => onChange(event.target.value)}>{options.map((option) => <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>)}</Select></FormControl>;
}

export function ErrorNotice({ children }: PropsWithChildren) { return <Alert severity="error">{children}</Alert>; }
