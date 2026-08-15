import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Collapse,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  FormControlLabel,
  IconButton,
  InputAdornment,
  Radio,
  RadioGroup,
  Snackbar,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import BlockOutlinedIcon from '@mui/icons-material/BlockOutlined';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import CloudOffOutlinedIcon from '@mui/icons-material/CloudOffOutlined';
import CompareArrowsIcon from '@mui/icons-material/CompareArrows';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import GavelOutlinedIcon from '@mui/icons-material/GavelOutlined';
import RefreshIcon from '@mui/icons-material/Refresh';
import SearchIcon from '@mui/icons-material/Search';
import { useApp } from '../app-context';
import { Section } from '../components';
import { ApiError, OfflineError } from '../lib/api';
import type { LocalRecord } from '../types';
import { entityLabels } from '../types';
import {
  conflictCounts,
  conflictEntities,
  filterConflicts,
  isConflictEntity,
  safeJson,
  supportsLocalDecision,
  type ConflictFilter,
  type LocalConflict,
  type RemoteConflict,
} from './conflicts-model';

type Decision = 'remote' | 'local';

export function ConflictsPage() {
  const { api, store, sync, refresh } = useApp();
  const [remote, setRemote] = useState<RemoteConflict[]>([]);
  const [local, setLocal] = useState<LocalConflict[]>([]);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<ConflictFilter>('pending');
  const [loadingRemote, setLoadingRemote] = useState(true);
  const [offline, setOffline] = useState(() => typeof navigator !== 'undefined' && !navigator.onLine);
  const [loadError, setLoadError] = useState<string>();
  const [selected, setSelected] = useState<RemoteConflict>();
  const [decision, setDecision] = useState<Decision>('remote');
  const [justification, setJustification] = useState('');
  const [resolving, setResolving] = useState(false);
  const [feedback, setFeedback] = useState<{ severity: 'success' | 'error' | 'warning'; message: string }>();

  const loadLocal = useCallback(async () => {
    const rows = await Promise.all(
      conflictEntities.map(async (entity) =>
        (await store.list(entity, true))
          .filter((record) => record.sync_status === 'CONFLICT' || record.sync_status === 'REJECTED')
          .map((record) => ({ entity, record })),
      ),
    );
    setLocal(rows.flat());
  }, [store]);

  const loadRemote = useCallback(async () => {
    setLoadingRemote(true);
    setLoadError(undefined);
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setOffline(true);
      setLoadingRemote(false);
      return;
    }
    try {
      const result = await api.get<{ items: RemoteConflict[] }>('/conflicts');
      setRemote(result.items);
      setOffline(false);
    } catch (cause) {
      if (cause instanceof OfflineError) {
        setOffline(true);
      } else {
        setLoadError(cause instanceof Error ? cause.message : 'Não foi possível consultar os conflitos do servidor.');
      }
    } finally {
      setLoadingRemote(false);
    }
  }, [api]);

  useEffect(() => {
    void loadLocal();
  }, [loadLocal, refresh]);

  useEffect(() => {
    void loadRemote();
  }, [loadRemote]);

  useEffect(() => {
    const handleOnline = () => {
      setOffline(false);
      void loadRemote();
    };
    const handleOffline = () => setOffline(true);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [loadRemote]);

  const effectiveOffline = offline;
  const visible = useMemo(() => filterConflicts(remote, local, query, filter), [filter, local, query, remote]);
  const counts = useMemo(() => conflictCounts(remote, local), [local, remote]);
  const justificationLength = justification.trim().length;

  const openResolution = (conflict: RemoteConflict) => {
    setSelected(conflict);
    setDecision('remote');
    setJustification('');
  };

  const closeResolution = () => {
    if (resolving) return;
    setSelected(undefined);
    setJustification('');
  };

  const resolve = async () => {
    if (!selected || justificationLength < 10 || effectiveOffline) return;
    if (decision === 'local' && !supportsLocalDecision(selected)) {
      setFeedback({ severity: 'warning', message: 'O servidor só permite manter a versão local para conflitos de frequência.' });
      return;
    }
    setResolving(true);
    try {
      const result = await api.post<{ entity: string; record: LocalRecord }>(
        `/conflicts/${encodeURIComponent(selected.id)}/resolve`,
        {
          decision,
          justification: justification.trim(),
        },
      );

      if (isConflictEntity(result.entity)) {
        await store.putRemote(result.entity, { ...result.record, sync_status: 'SYNCED' });
      }

      setSelected(undefined);
      setJustification('');
      setFeedback({
        severity: 'success',
        message:
          decision === 'local'
            ? 'Versão deste dispositivo aceita e registrada na auditoria.'
            : 'Versão do servidor mantida e registrada na auditoria.',
      });
      await Promise.all([loadLocal(), loadRemote()]);
      void sync();
    } catch (cause) {
      if (cause instanceof OfflineError) setOffline(true);
      const message = cause instanceof ApiError || cause instanceof Error ? cause.message : 'Não foi possível resolver o conflito.';
      setFeedback({ severity: 'error', message });
    } finally {
      setResolving(false);
    }
  };

  return (
    <Section
      title="Central de conflitos"
      subtitle="Compare as duas versões antes de decidir. Toda resolução exige justificativa e fica auditada."
    >
      {effectiveOffline && (
        <Alert
          severity="warning"
          icon={<CloudOffOutlinedIcon />}
          action={
            <Button color="inherit" size="small" onClick={() => void loadRemote()}>
              Tentar novamente
            </Button>
          }
          sx={{ borderRadius: 3 }}
        >
          Modo offline: exibindo as pendências preservadas neste dispositivo. A resolução será liberada quando a conexão voltar.
        </Alert>
      )}
      {loadError && (
        <Alert
          severity="error"
          action={
            <Button color="inherit" size="small" onClick={() => void loadRemote()}>
              Recarregar
            </Button>
          }
          sx={{ borderRadius: 3 }}
        >
          {loadError}
        </Alert>
      )}

      <Card sx={{ border: '1px solid #E2E8F0', borderRadius: 3 }}>
        <CardContent sx={{ p: { xs: 2, md: 2.25 }, '&:last-child': { pb: { xs: 2, md: 2.25 } } }}>
          <Stack direction={{ xs: 'column', md: 'row' }} gap={1.5} alignItems={{ md: 'center' }}>
            <TextField
              fullWidth
              size="small"
              label="Buscar conflito, entidade ou conteúdo"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon color="action" fontSize="small" />
                  </InputAdornment>
                ),
              }}
            />
            <Tooltip title="Atualizar conflitos do servidor">
              <span>
                <IconButton
                  aria-label="Atualizar conflitos"
                  size="small"
                  disabled={loadingRemote}
                  onClick={() => void Promise.all([loadLocal(), loadRemote()])}
                  sx={{ bgcolor: '#F1F5F9', width: 36, height: 36 }}
                >
                  {loadingRemote ? <CircularProgress size={18} /> : <RefreshIcon fontSize="small" />}
                </IconButton>
              </span>
            </Tooltip>
          </Stack>
          <Stack direction="row" gap={1} flexWrap="wrap" sx={{ mt: 1.5 }}>
            <FilterChip label="Pendentes" count={counts.pending} selected={filter === 'pending'} onClick={() => setFilter('pending')} />
            <FilterChip label="Resolvidos" count={counts.resolved} selected={filter === 'resolved'} onClick={() => setFilter('resolved')} />
            <FilterChip label="Rejeitadas" count={counts.rejected} selected={filter === 'rejected'} onClick={() => setFilter('rejected')} />
            <FilterChip label="Todos" count={counts.all} selected={filter === 'all'} onClick={() => setFilter('all')} />
          </Stack>
        </CardContent>
      </Card>

      {visible.remote.length > 0 && (
        <Stack gap={1.25}>
          <Typography variant="subtitle1" fontWeight={750} color="#0F172A">
            Conflitos registrados no servidor
          </Typography>
          {visible.remote.map((conflict) => (
            <RemoteConflictCard key={conflict.id} conflict={conflict} offline={effectiveOffline} onResolve={openResolution} />
          ))}
        </Stack>
      )}

      {visible.local.length > 0 && (
        <Stack gap={1.25}>
          <Typography variant="subtitle1" fontWeight={750} color="#0F172A">
            Pendências preservadas neste dispositivo
          </Typography>
          {visible.local.map((conflict) => (
            <LocalConflictCard key={`${conflict.entity}-${conflict.record.id}`} conflict={conflict} />
          ))}
        </Stack>
      )}

      {!loadingRemote && visible.remote.length === 0 && visible.local.length === 0 && (
        <Card sx={{ border: '1px solid #E2E8F0', borderRadius: 3 }}>
          <CardContent sx={{ py: 6, textAlign: 'center' }}>
            <CheckCircleOutlineIcon color="success" sx={{ fontSize: 44 }} />
            <Typography variant="subtitle1" fontWeight={750} color="#0F172A" sx={{ mt: 1 }}>
              {query ? 'Nenhum resultado para a busca.' : emptyMessage(filter)}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Os filtros podem ser alterados acima sem perder as pendências salvas.
            </Typography>
          </CardContent>
        </Card>
      )}

      <Dialog open={Boolean(selected)} onClose={closeResolution} fullWidth maxWidth="sm" PaperProps={{ sx: { borderRadius: 3 } }}>
        <DialogTitle sx={{ fontWeight: 750, color: '#0F172A', px: 3, pt: 2.5, pb: 1 }}>Resolver conflito</DialogTitle>
        <DialogContent sx={{ px: 3, py: 1 }}>
          <Stack gap={2} sx={{ pt: 1 }}>
            <Alert severity="warning" sx={{ borderRadius: 2 }}>
              Esta decisão substitui uma das versões e não pode ser desfeita por esta tela.
            </Alert>
            <FormControl>
              <RadioGroup value={decision} onChange={(event) => setDecision(event.target.value as Decision)}>
                <FormControlLabel value="remote" control={<Radio size="small" />} label="Manter a versão do servidor" />
                <FormControlLabel
                  value="local"
                  disabled={!selected || !supportsLocalDecision(selected)}
                  control={<Radio size="small" />}
                  label="Manter a versão deste dispositivo"
                />
              </RadioGroup>
            </FormControl>
            {selected && !supportsLocalDecision(selected) && (
              <Alert severity="info" sx={{ borderRadius: 2 }}>
                Para esta entidade, o backend permite somente manter a versão do servidor. A decisão local está disponível apenas para frequências.
              </Alert>
            )}
            <TextField
              autoFocus
              required
              size="small"
              label="Justificativa obrigatória"
              value={justification}
              onChange={(event) => setJustification(event.target.value.slice(0, 500))}
              multiline
              minRows={3}
              maxRows={6}
              error={justification.length > 0 && justificationLength < 10}
              helperText={`${justificationLength}/500 caracteres — mínimo de 10`}
            />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2, borderTop: '1px solid #F1F5F9' }}>
          <Button onClick={closeResolution} disabled={resolving} sx={{ color: 'text.secondary', fontWeight: 600 }}>
            Cancelar
          </Button>
          <Button
            variant="contained"
            startIcon={resolving ? <CircularProgress color="inherit" size={16} /> : <GavelOutlinedIcon fontSize="small" />}
            disabled={resolving || effectiveOffline || justificationLength < 10}
            onClick={() => void resolve()}
            sx={{ px: 2.5, fontWeight: 650 }}
          >
            Confirmar decisão
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={Boolean(feedback)}
        autoHideDuration={7000}
        onClose={() => setFeedback(undefined)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Alert
          variant="filled"
          severity={feedback?.severity ?? 'success'}
          onClose={() => setFeedback(undefined)}
          sx={{ borderRadius: 2 }}
        >
          {feedback?.message}
        </Alert>
      </Snackbar>
    </Section>
  );
}

function FilterChip({ label, count, selected, onClick }: { label: string; count: number; selected: boolean; onClick: () => void }) {
  return (
    <Chip
      size="small"
      label={`${label} (${count})`}
      color={selected ? 'primary' : 'default'}
      variant={selected ? 'filled' : 'outlined'}
      clickable
      onClick={onClick}
      sx={{ fontWeight: 600, height: 26, borderRadius: 1.5 }}
    />
  );
}

function RemoteConflictCard({ conflict, offline, onResolve }: { conflict: RemoteConflict; offline: boolean; onResolve: (conflict: RemoteConflict) => void }) {
  const [expanded, setExpanded] = useState(conflict.status === 'PENDING');
  const pending = conflict.status === 'PENDING';
  return (
    <Card sx={{ border: '1px solid #E2E8F0', borderRadius: 2.5 }}>
      <CardContent sx={{ p: 2 }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} gap={1.5} alignItems={{ sm: 'center' }}>
          <Box
            sx={{
              width: 36,
              height: 36,
              borderRadius: 2,
              bgcolor: pending ? '#FFFBEB' : '#ECFDF5',
              color: pending ? '#D97706' : '#059669',
              display: 'grid',
              placeItems: 'center',
            }}
          >
            <CompareArrowsIcon fontSize="small" />
          </Box>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography fontWeight={750} color="#0F172A" fontSize={14.5} noWrap>
              {entityName(conflict.entity_name)} · {conflict.entity_id}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Criado em {formatDateTime(conflict.created_at)}
            </Typography>
          </Box>
          <Chip
            size="small"
            color={pending ? 'warning' : 'success'}
            label={remoteStatusLabel(conflict.status)}
            sx={{ fontWeight: 650, height: 20, fontSize: 10.5 }}
          />
          {pending && (
            <Button
              variant="contained"
              size="small"
              startIcon={<GavelOutlinedIcon fontSize="small" />}
              disabled={offline}
              onClick={() => onResolve(conflict)}
              sx={{ borderRadius: 1.5, fontWeight: 650 }}
            >
              Resolver
            </Button>
          )}
          <IconButton size="small" aria-label={expanded ? 'Ocultar versões' : 'Exibir versões'} onClick={() => setExpanded((value) => !value)}>
            {expanded ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
          </IconButton>
        </Stack>
        <Collapse in={expanded} unmountOnExit>
          <Divider sx={{ my: 1.5, borderColor: '#F1F5F9' }} />
          <Stack direction={{ xs: 'column', md: 'row' }} gap={1.5} alignItems="stretch">
            <VersionPanel title="Versão deste dispositivo" data={conflict.local_data} />
            <VersionPanel title="Versão no servidor" data={conflict.remote_data} />
          </Stack>
          {!pending && (
            <Alert severity="success" sx={{ mt: 1.5, borderRadius: 2 }}>
              {remoteStatusLabel(conflict.status)} em {formatDateTime(conflict.resolved_at)}
              {conflict.resolved_by_name ? ` por ${conflict.resolved_by_name}` : ''}.
              {conflict.resolution_justification ? ` Justificativa: ${conflict.resolution_justification}` : ''}
            </Alert>
          )}
        </Collapse>
      </CardContent>
    </Card>
  );
}

function LocalConflictCard({ conflict: { entity, record } }: { conflict: LocalConflict }) {
  const [expanded, setExpanded] = useState(false);
  const rejected = record.sync_status === 'REJECTED';
  return (
    <Card sx={{ border: '1px solid #E2E8F0', borderRadius: 2.5 }}>
      <CardContent sx={{ p: 2 }}>
        <Stack direction="row" gap={1.5} alignItems="center">
          <Box
            sx={{
              width: 36,
              height: 36,
              borderRadius: 2,
              bgcolor: rejected ? '#FFF1F2' : '#FFFBEB',
              color: rejected ? '#E11D48' : '#D97706',
              display: 'grid',
              placeItems: 'center',
            }}
          >
            {rejected ? <BlockOutlinedIcon fontSize="small" /> : <CloudOffOutlinedIcon fontSize="small" />}
          </Box>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography fontWeight={750} color="#0F172A" fontSize={14.5} noWrap>
              {entityLabels[entity]} · {record.id}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {formatDateTime(record.updated_at)}
            </Typography>
          </Box>
          <Chip
            size="small"
            color={rejected ? 'error' : 'warning'}
            label={rejected ? 'Rejeitada' : 'Conflito local'}
            sx={{ fontWeight: 650, height: 20, fontSize: 10.5 }}
          />
          <IconButton size="small" aria-label={expanded ? 'Ocultar detalhes' : 'Exibir detalhes'} onClick={() => setExpanded((value) => !value)}>
            {expanded ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
          </IconButton>
        </Stack>
        <Collapse in={expanded} unmountOnExit>
          <Divider sx={{ my: 1.5, borderColor: '#F1F5F9' }} />
          {rejected && (
            <Alert severity="error" sx={{ mb: 1.5, borderRadius: 2 }}>
              {record.sync_error_message ? String(record.sync_error_message) : 'A operação foi rejeitada pelo servidor.'}
              {record.sync_error_code ? ` Código: ${record.sync_error_code}.` : ''} Corrija o registro na tela correspondente para gerar uma nova tentativa.
            </Alert>
          )}
          {!rejected && (
            <Alert severity="warning" sx={{ mb: 1.5, borderRadius: 2 }}>
              Esta versão permanece protegida localmente até uma decisão na ocorrência correspondente do servidor.
            </Alert>
          )}
          <VersionPanel title="Dados preservados localmente" data={record} />
        </Collapse>
      </CardContent>
    </Card>
  );
}

function VersionPanel({ title, data }: { title: string; data: unknown }) {
  return (
    <Box sx={{ flex: 1, minWidth: 0, bgcolor: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 2, p: 1.5 }}>
      <Typography variant="caption" fontWeight={750} color="#0F172A" sx={{ display: 'block', mb: 0.75 }}>
        {title}
      </Typography>
      <Box
        component="pre"
        sx={{
          m: 0,
          whiteSpace: 'pre-wrap',
          overflowWrap: 'anywhere',
          fontFamily: 'Consolas, monospace',
          fontSize: 11.5,
          lineHeight: 1.5,
          color: '#334155',
        }}
      >
        {safeJson(data)}
      </Box>
    </Box>
  );
}

function entityName(entity: string): string {
  return isConflictEntity(entity) ? entityLabels[entity] : entity;
}

function remoteStatusLabel(status: RemoteConflict['status']): string {
  if (status === 'LOCAL_ACCEPTED') return 'Versão local aceita';
  if (status === 'REMOTE_ACCEPTED') return 'Versão do servidor aceita';
  return 'Pendente';
}

function emptyMessage(filter: ConflictFilter): string {
  if (filter === 'pending') return 'Nenhum conflito pendente.';
  if (filter === 'resolved') return 'Nenhum conflito resolvido.';
  if (filter === 'rejected') return 'Nenhuma alteração rejeitada.';
  return 'Nenhum conflito encontrado.';
}

function formatDateTime(value?: string | null): string {
  if (!value) return 'Data não informada';
  const date = new Date(value);
  return Number.isNaN(date.valueOf())
    ? value
    : new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(date);
}
