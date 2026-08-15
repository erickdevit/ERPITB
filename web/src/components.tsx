import { type PropsWithChildren } from 'react';
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { parseBrazilDate, formatDate } from './lib/date';

export function Section({
  title,
  subtitle,
  action,
  children,
}: PropsWithChildren<{ title?: string; subtitle?: string; action?: React.ReactNode }>) {
  return (
    <Stack gap={2}>
      {(title || action) && (
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          gap={1.5}
          justifyContent="space-between"
          alignItems={{ sm: 'center' }}
          sx={{ pb: 0.5 }}
        >
          {title ? (
            <Box>
              <Typography variant="h5" component="h1" fontWeight={800} color="#0F172A" letterSpacing="-0.02em">
                {title}
              </Typography>
              {subtitle && (
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
                  {subtitle}
                </Typography>
              )}
            </Box>
          ) : <Box />}
          {action && <Stack direction="row" gap={1} alignItems="center" flexWrap="wrap">{action}</Stack>}
        </Stack>
      )}
      {children}
    </Stack>
  );
}

export function PageDialog({
  open,
  title,
  onClose,
  children,
  onSave,
  saveText = 'Salvar',
}: PropsWithChildren<{
  open: boolean;
  title: string;
  onClose: () => void;
  onSave: () => void;
  saveText?: string;
}>) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth="sm"
      PaperProps={{
        sx: {
          borderRadius: 3,
        },
      }}
    >
      <DialogTitle sx={{ fontWeight: 750, color: '#0F172A', px: 3, pt: 2.5, pb: 1, fontSize: '1.125rem' }}>{title}</DialogTitle>
      <DialogContent sx={{ px: 3, py: 1 }}>
        <Stack gap={2} sx={{ pt: 1 }}>
          {children}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2, borderTop: '1px solid #F1F5F9' }}>
        <Button onClick={onClose} sx={{ color: 'text.secondary', fontWeight: 600 }}>
          Cancelar
        </Button>
        <Button variant="contained" onClick={onSave} sx={{ px: 2.5, fontWeight: 650 }}>
          {saveText}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export function DateField({
  label,
  value,
  onChange,
  required = false,
  allowFuture = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  allowFuture?: boolean;
}) {
  return (
    <TextField
      fullWidth
      size="small"
      label={label}
      required={required}
      type="date"
      value={value ? parseDateInput(value, allowFuture) : ''}
      helperText="Digite a data ou selecione no calendário."
      onChange={(event) => onChange(event.target.value ? formatDate(event.target.value) : '')}
      InputLabelProps={{ shrink: true }}
    />
  );
}

function parseDateInput(value: string, allowFuture: boolean) {
  try {
    return parseBrazilDate(value, { allowFuture }) ?? '';
  } catch {
    return '';
  }
}

export function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <FormControl fullWidth size="small">
      <InputLabel>{label}</InputLabel>
      <Select label={label} value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <MenuItem key={option.value} value={option.value}>
            {option.label}
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  );
}

export function ErrorNotice({ children }: PropsWithChildren) {
  return <Alert severity="error" sx={{ borderRadius: 2 }}>{children}</Alert>;
}

