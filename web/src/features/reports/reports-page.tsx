import { useMemo, useState } from 'react';
import FileDownloadOutlinedIcon from '@mui/icons-material/FileDownloadOutlined';
import PictureAsPdfOutlinedIcon from '@mui/icons-material/PictureAsPdfOutlined';
import { Alert, Button, LinearProgress, Stack, Typography } from '@mui/material';
import { useApp } from '../../app-context';
import { exportExcelCsv, exportExcelXlsx, exportSimplePdf } from '../../lib/exports';
import { todayInSaoPaulo } from '../../lib/date';
import type { ReportFilters } from './model';
import { ReportFiltersBar } from './report-filters';
import { ReportResult } from './report-result';
import { useReportData } from './use-report-data';

const safeFilename = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

function initialFilters(today: string): ReportFilters {
  const from = new Date(`${today}T12:00:00Z`);
  from.setUTCDate(from.getUTCDate() - 89);
  return { type: 'institutional', from: from.toISOString().slice(0, 10), to: today };
}

export function ReportsCenterPage() {
  const { session } = useApp();
  const today = todayInSaoPaulo();
  const defaults = useMemo(() => initialFilters(today), [today]);
  const [filters, setFilters] = useState<ReportFilters>(defaults);
  const { view, loading, directory, directoryError, options } = useReportData(filters);
  const filename = `${safeFilename(view.title)}-${filters.to.replaceAll('-', '')}`;
  const exportMetadata = view.context.map((item, index) => [`Contexto ${index + 1}`, item] as [string, string]);

  return <Stack gap={2.25}>
    <Stack direction={{ xs: 'column', md: 'row' }} gap={1.5} justifyContent="space-between" alignItems={{ md: 'flex-start' }}>
      <Typography color="text.secondary" sx={{ maxWidth: 760 }}>Consulte os cinco relatórios operacionais da versão desktop diretamente na tela e exporte o mesmo recorte em PDF, Excel ou CSV.</Typography>
      <Stack direction="row" gap={1} flexWrap="wrap" aria-label="Opções de exportação do relatório">
        <Button size="small" variant="outlined" disabled={!view.ready} startIcon={<PictureAsPdfOutlinedIcon />} onClick={() => void exportSimplePdf(filename, view.title, view.context, view.headers, view.rows)}>PDF</Button>
        <Button size="small" variant="outlined" disabled={!view.ready} startIcon={<FileDownloadOutlinedIcon />} onClick={() => void exportExcelXlsx(filename, view.metrics.map((item) => [item.label, item.value]), view.headers, view.rows, exportMetadata)}>Excel</Button>
        <Button size="small" variant="outlined" disabled={!view.ready} startIcon={<FileDownloadOutlinedIcon />} onClick={() => exportExcelCsv(filename, view.headers, view.rows)}>CSV</Button>
      </Stack>
    </Stack>
    <ReportFiltersBar filters={filters} onChange={setFilters} {...options} teachers={directory} role={session.role} onReset={() => setFilters(defaults)} />
    {loading && <LinearProgress aria-label="Carregando relatórios" />}
    {directoryError && <Alert severity="warning">A lista de professores não pôde ser atualizada. {directoryError}</Alert>}
    {!view.ready ? <Alert severity="info">{view.requiredMessage}</Alert> : <>
      <Stack gap={0.5}><Typography variant="h6" component="h2" fontWeight={850}>{view.title}</Typography>{view.description && <Typography color="text.secondary">{view.description}</Typography>}</Stack>
      <ReportResult view={view} />
      {view.notices.filter(Boolean).length > 0 && <Alert severity="info"><Stack component="ul" sx={{ m: 0, pl: 2.5 }}>{view.notices.filter(Boolean).map((notice) => <li key={notice}><Typography variant="body2">{notice}</Typography></li>)}</Stack></Alert>}
    </>}
  </Stack>;
}
