import { type PropsWithChildren } from 'react';
import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, FormControl, InputLabel, MenuItem, Select, Stack, TextField } from '@mui/material';
import { parseBrazilDate, formatDate } from './lib/date';

export function Section({ title, action, children }: PropsWithChildren<{ title: string; action?: React.ReactNode }>) {
  void title;
  return <Stack gap={2}>{action && <Stack direction="row" justifyContent="flex-end">{action}</Stack>}{children}</Stack>;
}

export function PageDialog({ open, title, onClose, children, onSave, saveText = 'Salvar' }: PropsWithChildren<{ open: boolean; title: string; onClose: () => void; onSave: () => void; saveText?: string }>) {
  return <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm"><DialogTitle>{title}</DialogTitle><DialogContent><Stack gap={1.5} sx={{ pt: 1 }}>{children}</Stack></DialogContent><DialogActions><Button onClick={onClose}>Cancelar</Button><Button variant="contained" onClick={onSave}>{saveText}</Button></DialogActions></Dialog>;
}

export function DateField({ label, value, onChange, required = false, allowFuture = false }: { label: string; value: string; onChange: (value: string) => void; required?: boolean; allowFuture?: boolean }) {
  return <TextField fullWidth label={label} required={required} type="date" value={value ? parseDateInput(value, allowFuture) : ''} helperText="Digite a data ou selecione no calendário." onChange={(event) => onChange(event.target.value ? formatDate(event.target.value) : '')} InputLabelProps={{ shrink: true }} />;
}
function parseDateInput(value: string, allowFuture: boolean) { try { return parseBrazilDate(value, { allowFuture }) ?? ''; } catch { return ''; } }

export function SelectField({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: Array<{ value: string; label: string }> }) {
  return <FormControl fullWidth><InputLabel>{label}</InputLabel><Select label={label} value={value} onChange={(event) => onChange(event.target.value)}>{options.map((option) => <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>)}</Select></FormControl>;
}

export function ErrorNotice({ children }: PropsWithChildren) { return <Alert severity="error">{children}</Alert>; }
