import { useMemo, useState } from 'react';
import FileDownloadOutlinedIcon from '@mui/icons-material/FileDownloadOutlined';
import PictureAsPdfOutlinedIcon from '@mui/icons-material/PictureAsPdfOutlined';
import { Alert, Box, Button, LinearProgress, Stack, Typography } from '@mui/material';
import { useApp } from '../../app-context';
import { Section } from '../../components';
import { exportExcelCsv, exportExcelXlsx, exportSimplePdf } from '../../lib/exports';
import { todayInSaoPaulo } from '../../lib/date';
import type { ReportFilters } from './model';
import { ReportFiltersBar } from './report-filters';
import { ReportResult } from './report-result';
import { useReportData } from './use-report-data';

const safeFilename = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

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

  return (
    <Section
      title="Central de Relatórios"
      subtitle="Emissão e exportação de diários de classe, desempenho e relatórios pedagógicos"
      action={
        <Stack direction="row" gap={1} flexWrap="wrap" aria-label="Opções de exportação do relatório">
          <Button
            size="small"
            variant="outlined"
            disabled={!view.ready}
            startIcon={<PictureAsPdfOutlinedIcon fontSize="small" />}
            onClick={() => void exportSimplePdf(filename, view.title, view.context, view.headers, view.rows)}
            sx={{ borderRadius: 2, fontWeight: 650, px: 1.75, py: 0.6 }}
          >
            PDF
          </Button>
          <Button
            size="small"
            variant="outlined"
            disabled={!view.ready}
            startIcon={<FileDownloadOutlinedIcon fontSize="small" />}
            onClick={() =>
              void exportExcelXlsx(
                filename,
                view.metrics.map((item) => [item.label, item.value]),
                view.headers,
                view.rows,
                exportMetadata,
              )
            }
            sx={{ borderRadius: 2, fontWeight: 650, px: 1.75, py: 0.6 }}
          >
            Excel
          </Button>
          <Button
            size="small"
            variant="outlined"
            disabled={!view.ready}
            startIcon={<FileDownloadOutlinedIcon fontSize="small" />}
            onClick={() => exportExcelCsv(filename, view.headers, view.rows)}
            sx={{ borderRadius: 2, fontWeight: 650, px: 1.75, py: 0.6 }}
          >
            CSV
          </Button>
        </Stack>
      }
    >
      <ReportFiltersBar
        filters={filters}
        onChange={setFilters}
        {...options}
        teachers={directory}
        role={session.role}
        onReset={() => setFilters(defaults)}
      />

      {loading && <LinearProgress aria-label="Carregando relatórios" sx={{ height: 2 }} />}
      {directoryError && (
        <Alert severity="warning" sx={{ borderRadius: 2 }}>
          A lista de professores não pôde ser atualizada. {directoryError}
        </Alert>
      )}

      {!view.ready ? (
        <Alert severity="info" sx={{ borderRadius: 2 }}>
          {view.requiredMessage}
        </Alert>
      ) : (
        <>
          <Box sx={{ mt: 0.5 }}>
            <Typography variant="h6" component="h2" fontWeight={800} color="#0F172A" letterSpacing="-0.01em">
              {view.title}
            </Typography>
            {view.description && (
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
                {view.description}
              </Typography>
            )}
          </Box>
          <ReportResult view={view} />
          {view.notices.filter(Boolean).length > 0 && (
            <Alert severity="info" sx={{ borderRadius: 2 }}>
              <Stack component="ul" sx={{ m: 0, pl: 2.5 }}>
                {view.notices.filter(Boolean).map((notice) => (
                  <li key={notice}>
                    <Typography variant="body2">{notice}</Typography>
                  </li>
                ))}
              </Stack>
            </Alert>
          )}
        </>
      )}
    </Section>
  );
}
