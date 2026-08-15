import { useCallback, useEffect, useMemo, useState } from 'react';
import HistoryOutlinedIcon from '@mui/icons-material/HistoryOutlined';
import RefreshOutlinedIcon from '@mui/icons-material/RefreshOutlined';
import SearchOutlinedIcon from '@mui/icons-material/SearchOutlined';
import {
  Alert,
  Avatar,
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
    dateStyle: 'short',
    timeStyle: 'medium',
    timeZone: 'America/Sao_Paulo',
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
        const reason =
          remoteError instanceof Error && remoteError.message !== 'offline' ? ` Motivo: ${remoteError.message}` : '';
        setNotice(
          `Sem acesso à auditoria remota. Exibindo apenas alterações deste dispositivo que ainda aguardam sincronização.${reason}`,
        );
      } catch (fallbackError) {
        setItems([]);
        setMode('local');
        setNotice(
          fallbackError instanceof Error
            ? `Não foi possível consultar a auditoria nem a fila local: ${fallbackError.message}`
            : 'Não foi possível consultar a auditoria nem a fila local.',
        );
      }
    } finally {
      setLoading(false);
    }
  }, [api, store]);

  useEffect(() => {
    void load();
  }, [load]);

  const visible = useMemo(() => filterAuditEntries(items, search), [items, search]);

  return (
    <Section
      title="Auditoria e sincronização"
      subtitle="Histórico de eventos, alterações cadastrais e trilha de auditoria"
      action={
        <Button
          variant="outlined"
          startIcon={loading ? <CircularProgress size={14} /> : <RefreshOutlinedIcon fontSize="small" />}
          disabled={loading}
          onClick={() => void load()}
          sx={{ px: 2, py: 0.8, borderRadius: 2, fontWeight: 650 }}
        >
          Atualizar
        </Button>
      }
    >
      {notice && (
        <Alert severity={mode === 'local' ? 'info' : 'warning'} sx={{ borderRadius: 2 }}>
          {notice}
        </Alert>
      )}

      <Card sx={{ border: '1px solid #E2E8F0', borderRadius: 3 }}>
        <CardContent sx={{ p: { xs: 2, md: 2.25 }, '&:last-child': { pb: { xs: 2, md: 2.25 } } }}>
          <Stack direction={{ xs: 'column', sm: 'row' }} gap={1.5} alignItems={{ sm: 'center' }}>
            <TextField
              fullWidth
              size="small"
              label="Buscar evento, entidade ou usuário"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchOutlinedIcon color="action" fontSize="small" />
                  </InputAdornment>
                ),
              }}
            />
            <Chip
              size="small"
              color={mode === 'remote' ? 'success' : 'warning'}
              label={mode === 'remote' ? 'Auditoria do servidor' : 'Fila local'}
              sx={{ alignSelf: { xs: 'flex-start', sm: 'center' }, flexShrink: 0, fontWeight: 650, height: 24, fontSize: 11 }}
            />
          </Stack>
        </CardContent>
        {loading && <LinearProgress aria-label="Carregando auditoria" sx={{ height: 2 }} />}
      </Card>

      {!loading && visible.length === 0 && (
        <Card sx={{ border: '1px solid #E2E8F0', borderRadius: 3 }}>
          <CardContent sx={{ py: 6, textAlign: 'center' }}>
            <HistoryOutlinedIcon color="disabled" sx={{ fontSize: 44, mb: 1 }} />
            <Typography fontWeight={700} color="#0F172A">
              {search.trim() ? 'Nenhum evento corresponde à busca.' : 'Nenhum evento registrado.'}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              {mode === 'local'
                ? 'Não há alterações pendentes neste dispositivo.'
                : 'A auditoria não retornou registros.'}
            </Typography>
          </CardContent>
        </Card>
      )}

      {!loading && visible.length > 0 && (
        <Stack gap={1} component="ol" sx={{ m: 0, p: 0, listStyle: 'none' }}>
          {visible.map((entry) => (
            <AuditEventCard key={entry.id} entry={entry} />
          ))}
        </Stack>
      )}
    </Section>
  );
}

function AuditEventCard({ entry }: { entry: AuditEntry }) {
  return (
    <Card sx={{ border: '1px solid #E2E8F0', borderRadius: 2.5 }} component="li">
      <CardContent sx={{ p: { xs: 1.75, md: 2 }, '&:last-child': { pb: { xs: 1.75, md: 2 } } }}>
        <Stack direction={{ xs: 'column', md: 'row' }} gap={{ xs: 1.5, md: 2 }} alignItems={{ md: 'center' }}>
          <Stack direction="row" gap={1.25} alignItems="flex-start" sx={{ minWidth: 0, flex: 1 }}>
            <Avatar
              sx={{
                bgcolor: '#EFF6FF',
                color: '#1976D2',
                width: 36,
                height: 36,
                borderRadius: 2,
                flexShrink: 0,
              }}
            >
              <HistoryOutlinedIcon fontSize="small" />
            </Avatar>
            <Stack gap={0.25} sx={{ minWidth: 0 }}>
              <Stack direction="row" gap={0.75} flexWrap="wrap" alignItems="center">
                <Typography fontWeight={750} color="#0F172A" fontSize={14}>
                  {entry.action}
                </Typography>
                <Typography color="text.secondary" fontSize={12}>•</Typography>
                <Typography fontWeight={650} color="#334155" fontSize={13.5}>
                  {auditEntityLabel(entry.entity)}
                </Typography>
                {entry.source === 'local' && (
                  <Chip size="small" color="warning" variant="outlined" label="Local" sx={{ fontWeight: 650, height: 18, fontSize: 9.5 }} />
                )}
              </Stack>
              <Typography variant="caption" color="text.secondary">
                {entry.userName} • {formatTimestamp(entry.createdAt)}
              </Typography>
              {entry.details && (
                <Typography variant="caption" color="#475569" sx={{ overflowWrap: 'anywhere', mt: 0.25, fontSize: 12 }}>
                  {entry.details}
                </Typography>
              )}
            </Stack>
          </Stack>
          {entry.entityId && (
            <>
              <Divider flexItem orientation="vertical" sx={{ display: { xs: 'none', md: 'block' }, borderColor: '#F1F5F9' }} />
              <Stack sx={{ minWidth: { md: 140 }, flexShrink: 0 }}>
                <Typography variant="caption" color="text.secondary" fontWeight={600} sx={{ fontSize: 11 }}>
                  ID do registro
                </Typography>
                <Typography
                  title={entry.entityId}
                  variant="caption"
                  sx={{
                    fontFamily: 'Consolas, monospace',
                    bgcolor: '#F8FAFC',
                    px: 0.75,
                    py: 0.2,
                    borderRadius: 1.5,
                    border: '1px solid #E2E8F0',
                    fontSize: 11.5,
                    color: '#334155',
                    display: 'inline-block',
                    width: 'fit-content',
                  }}
                >
                  {compactId(entry.entityId)}
                </Typography>
              </Stack>
            </>
          )}
        </Stack>
      </CardContent>
    </Card>
  );
}
