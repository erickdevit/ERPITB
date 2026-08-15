import { useCallback, useEffect, useMemo, useState } from 'react';
import HistoryOutlinedIcon from '@mui/icons-material/HistoryOutlined';
import RefreshOutlinedIcon from '@mui/icons-material/RefreshOutlined';
import SearchOutlinedIcon from '@mui/icons-material/SearchOutlined';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Divider,
  InputAdornment,
  LinearProgress,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { useApp } from '../app-context';
import { Section } from '../components';
import {
  auditEntityLabel,
  filterAuditEntries,
  normalizeRemoteAuditEntries,
  pendingOperationsToAuditEntries,
  type AuditEntry,
} from './audit-model';

type AuditMode = 'remote' | 'local';

function formatTimestamp(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value || 'Data não informada';
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short', timeStyle: 'medium', timeZone: 'America/Sao_Paulo',
  }).format(parsed);
}

function compactId(value: string): string {
  return value.length > 14 ? `${value.slice(0, 8)}…${value.slice(-4)}` : value;
}

export function AuditPage() {
  const { api, store } = useApp();
  const [items, setItems] = useState<AuditEntry[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<AuditMode>('remote');
  const [notice, setNotice] = useState<string>();

  const load = useCallback(async () => {
    setLoading(true);
    setNotice(undefined);
    try {
      if (typeof navigator !== 'undefined' && !navigator.onLine) throw new Error('offline');
      const result = await api.get<{ items?: unknown }>('/audit-logs?limit=200');
      setItems(normalizeRemoteAuditEntries(result.items));
      setMode('remote');
    } catch (remoteError) {
      try {
        const pending = await store.pending();
        setItems(pendingOperationsToAuditEntries(pending));
        setMode('local');
        const reason = remoteError instanceof Error && remoteError.message !== 'offline' ? ` Motivo: ${remoteError.message}` : '';
        setNotice(`Sem acesso à auditoria remota. Exibindo apenas alterações deste dispositivo que ainda aguardam sincronização.${reason}`);
      } catch (fallbackError) {
        setItems([]);
        setMode('local');
        setNotice(fallbackError instanceof Error
          ? `Não foi possível consultar a auditoria nem a fila local: ${fallbackError.message}`
          : 'Não foi possível consultar a auditoria nem a fila local.');
      }
    } finally {
      setLoading(false);
    }
  }, [api, store]);

  useEffect(() => { void load(); }, [load]);
  const visible = useMemo(() => filterAuditEntries(items, search), [items, search]);

  return <Section title="Auditoria e sincronização" action={
    <Button variant="outlined" startIcon={loading ? <CircularProgress size={16} /> : <RefreshOutlinedIcon />} disabled={loading} onClick={() => void load()}>
      Atualizar
    </Button>
  }>
    {notice && <Alert severity={mode === 'local' ? 'info' : 'warning'}>{notice}</Alert>}
    <Card variant="outlined">
      <CardContent>
        <Stack direction={{ xs: 'column', sm: 'row' }} gap={1.5} alignItems={{ sm: 'center' }}>
          <TextField
            fullWidth
            label="Buscar evento, entidade ou usuário"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            InputProps={{ startAdornment: <InputAdornment position="start"><SearchOutlinedIcon /></InputAdornment> }}
          />
          <Chip
            color={mode === 'remote' ? 'success' : 'warning'}
            label={mode === 'remote' ? 'Auditoria do servidor' : 'Fila local'}
            sx={{ alignSelf: { xs: 'flex-start', sm: 'center' }, flexShrink: 0 }}
          />
        </Stack>
      </CardContent>
      {loading && <LinearProgress aria-label="Carregando auditoria" />}
    </Card>

    {!loading && visible.length === 0 && <Card variant="outlined">
      <CardContent sx={{ py: 5, textAlign: 'center' }}>
        <HistoryOutlinedIcon color="disabled" sx={{ fontSize: 42, mb: 1 }} />
        <Typography fontWeight={700}>{search.trim() ? 'Nenhum evento corresponde à busca.' : 'Nenhum evento registrado.'}</Typography>
        <Typography variant="body2" color="text.secondary">
          {mode === 'local' ? 'Não há alterações pendentes neste dispositivo.' : 'A auditoria não retornou registros.'}
        </Typography>
      </CardContent>
    </Card>}

    {!loading && visible.length > 0 && <Stack gap={1} component="ol" sx={{ m: 0, p: 0, listStyle: 'none' }}>
      {visible.map((entry) => <AuditEventCard key={entry.id} entry={entry} />)}
    </Stack>}
  </Section>;
}

function AuditEventCard({ entry }: { entry: AuditEntry }) {
  return <Card variant="outlined" component="li">
    <CardContent>
      <Stack direction={{ xs: 'column', md: 'row' }} gap={{ xs: 1, md: 2 }} alignItems={{ md: 'center' }}>
        <Stack direction="row" gap={1.25} alignItems="flex-start" sx={{ minWidth: 0, flex: 1 }}>
          <Box sx={{ width: 38, height: 38, borderRadius: '50%', bgcolor: 'action.hover', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
            <HistoryOutlinedIcon fontSize="small" color="primary" />
          </Box>
          <Stack gap={0.35} sx={{ minWidth: 0 }}>
            <Stack direction="row" gap={0.75} flexWrap="wrap" alignItems="center">
              <Typography fontWeight={800}>{entry.action}</Typography>
              <Typography color="text.secondary">•</Typography>
              <Typography fontWeight={700}>{auditEntityLabel(entry.entity)}</Typography>
              {entry.source === 'local' && <Chip size="small" color="warning" variant="outlined" label="Local" />}
            </Stack>
            <Typography variant="body2" color="text.secondary">{entry.userName} • {formatTimestamp(entry.createdAt)}</Typography>
            {entry.details && <Typography variant="body2" sx={{ overflowWrap: 'anywhere' }}>{entry.details}</Typography>}
          </Stack>
        </Stack>
        {entry.entityId && <>
          <Divider flexItem orientation="vertical" sx={{ display: { xs: 'none', md: 'block' } }} />
          <Stack sx={{ minWidth: { md: 150 } }}>
            <Typography variant="caption" color="text.secondary">ID do registro</Typography>
            <Typography
              title={entry.entityId}
              variant="body2"
              sx={{ fontFamily: 'monospace', overflowWrap: 'anywhere' }}
            >{compactId(entry.entityId)}</Typography>
          </Stack>
        </>}
      </Stack>
    </CardContent>
  </Card>;
}
