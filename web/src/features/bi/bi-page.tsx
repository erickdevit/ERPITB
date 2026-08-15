import { useMemo, useState } from 'react';
import FileDownloadOutlinedIcon from '@mui/icons-material/FileDownloadOutlined';
import PictureAsPdfOutlinedIcon from '@mui/icons-material/PictureAsPdfOutlined';
import DataObjectOutlinedIcon from '@mui/icons-material/DataObjectOutlined';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  LinearProgress,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
  useMediaQuery,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Section } from '../../components';
import { exportBiJson, exportExcelCsv, exportExcelXlsx, exportSimplePdf, type ExportValue } from '../../lib/exports';
import { todayInSaoPaulo } from '../../lib/date';
import type { BiFilters } from './model';
import { useBiData } from './use-bi-data';
import { BiFilterBar } from './bi-filter-bar';
import { buildBiView, type BiChart, type BiViewKey } from './views';

function initialFilters(today: string): BiFilters {
  const from = new Date(`${today}T12:00:00Z`);
  from.setUTCDate(from.getUTCDate() - 29);
  return { from: from.toISOString().slice(0, 10), to: today };
}

const safeFilename = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
const spreadsheetSafe = (value: ExportValue): ExportValue =>
  typeof value === 'string' && /^[=+\-@]/.test(value.trimStart()) ? `'${value}` : value;

function ExportActions({
  title,
  context,
  headers,
  rows,
  payload,
  metrics,
}: {
  title: string;
  context: string[];
  headers: string[];
  rows: ExportValue[][];
  payload: unknown;
  metrics: Array<{ label: string; value: string }>;
}) {
  const filename = safeFilename(title);
  return (
    <Stack direction="row" gap={1} flexWrap="wrap" aria-label="Opções de exportação">
      <Button
        size="small"
        variant="outlined"
        startIcon={<FileDownloadOutlinedIcon fontSize="small" />}
        onClick={() =>
          void exportExcelXlsx(
            filename,
            metrics.map((item) => [item.label, item.value]),
            headers,
            rows,
            context.map((item, index) => [`Contexto ${index + 1}`, item]),
          )
        }
        sx={{ borderRadius: 2, fontWeight: 650, px: 1.75, py: 0.6 }}
      >
        Excel
      </Button>
      <Button
        size="small"
        variant="outlined"
        startIcon={<FileDownloadOutlinedIcon fontSize="small" />}
        onClick={() => exportExcelCsv(filename, headers, rows.map((row) => row.map(spreadsheetSafe)))}
        sx={{ borderRadius: 2, fontWeight: 650, px: 1.75, py: 0.6 }}
      >
        CSV
      </Button>
      <Button
        size="small"
        variant="outlined"
        startIcon={<PictureAsPdfOutlinedIcon fontSize="small" />}
        onClick={() => void exportSimplePdf(filename, title, context, headers, rows)}
        sx={{ borderRadius: 2, fontWeight: 650, px: 1.75, py: 0.6 }}
      >
        PDF
      </Button>
      <Button
        size="small"
        variant="outlined"
        startIcon={<DataObjectOutlinedIcon fontSize="small" />}
        onClick={() => exportBiJson(filename, payload)}
        sx={{ borderRadius: 2, fontWeight: 650, px: 1.75, py: 0.6 }}
      >
        Dados B.I
      </Button>
    </Stack>
  );
}

function MetricGrid({ metrics }: { metrics: ReturnType<typeof buildBiView>['metrics'] }) {
  return (
    <Box
      component="section"
      aria-label="Indicadores"
      sx={{
        display: 'grid',
        gridTemplateColumns: {
          xs: 'repeat(2, minmax(0, 1fr))',
          md: 'repeat(4, minmax(0, 1fr))',
          xl: 'repeat(6, minmax(0, 1fr))',
        },
        gap: 1.25,
      }}
    >
      {metrics.map((metric) => (
        <Card key={metric.label} sx={{ border: '1px solid #E2E8F0', borderRadius: 2.5 }}>
          <CardContent sx={{ p: 1.75, '&:last-child': { pb: 1.75 } }}>
            <Typography variant="caption" color="text.secondary" fontWeight={600}>
              {metric.label}
            </Typography>
            <Typography variant="h6" component="p" fontWeight={800} color="#0F172A" sx={{ mt: 0.25, letterSpacing: '-0.02em' }}>
              {metric.value}
            </Typography>
            {metric.detail && (
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.25, fontSize: 11.5 }}>
                {metric.detail}
              </Typography>
            )}
          </CardContent>
        </Card>
      ))}
    </Box>
  );
}

function AnalyticsChart({ chart }: { chart: BiChart }) {
  const content =
    chart.type === 'line' ? (
      <LineChart data={chart.data} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="#F1F5F9" />
        <XAxis dataKey={chart.categoryKey} tick={{ fontSize: 11, fill: '#64748B' }} stroke="#E2E8F0" />
        <YAxis unit={chart.valueSuffix} width={48} tick={{ fontSize: 11, fill: '#64748B' }} stroke="#E2E8F0" />
        <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid #E2E8F0', boxShadow: 'none' }} />
        <Line type="monotone" dataKey={chart.valueKey} stroke="#1976D2" strokeWidth={2.5} dot={chart.data.length < 20} />
      </LineChart>
    ) : (
      <BarChart data={chart.data} layout="vertical" margin={{ top: 8, right: 20, left: 28, bottom: 8 }}>
        <CartesianGrid horizontal={false} strokeDasharray="3 3" stroke="#F1F5F9" />
        <XAxis type="number" unit={chart.valueSuffix} tick={{ fontSize: 11, fill: '#64748B' }} stroke="#E2E8F0" />
        <YAxis type="category" dataKey={chart.categoryKey} width={110} tick={{ fontSize: 11, fill: '#0F172A', fontWeight: 600 }} stroke="#E2E8F0" />
        <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid #E2E8F0', boxShadow: 'none' }} />
        <Bar dataKey={chart.valueKey} fill="#0284C7" radius={[0, 4, 4, 0]} />
      </BarChart>
    );
  return (
    <Card component="section" sx={{ border: '1px solid #E2E8F0', borderRadius: 3 }}>
      <CardContent sx={{ p: 2 }}>
        <Typography fontWeight={750} color="#0F172A" fontSize={15}>
          {chart.title}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {chart.description}
        </Typography>
        <Box role="img" aria-label={`${chart.title}. ${chart.description}`} sx={{ height: { xs: 280, md: 320 }, mt: 2 }}>
          <ResponsiveContainer width="100%" height="100%">
            {content}
          </ResponsiveContainer>
        </Box>
        <Typography
          sx={{
            position: 'absolute',
            width: 1,
            height: 1,
            p: 0,
            m: -1,
            overflow: 'hidden',
            clip: 'rect(0,0,0,0)',
            whiteSpace: 'nowrap',
            border: 0,
          }}
        >
          {chart.data.map((item) => `${item[chart.categoryKey]}: ${item[chart.valueKey]}${chart.valueSuffix ?? ''}`).join('; ')}
        </Typography>
      </CardContent>
    </Card>
  );
}

function ResultTable({ title, headers, rows }: { title: string; headers: string[]; rows: ExportValue[][] }) {
  const theme = useTheme();
  const compact = useMediaQuery(theme.breakpoints.down('sm'));
  return (
    <Card component="section" aria-labelledby="bi-result-title" sx={{ border: '1px solid #E2E8F0', borderRadius: 3 }}>
      <CardContent sx={{ p: 2, pb: 1.25, borderBottom: '1px solid #F1F5F9' }}>
        <Typography id="bi-result-title" fontWeight={750} color="#0F172A" fontSize={15}>
          {title}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {rows.length.toLocaleString('pt-BR')} linha(s)
        </Typography>
      </CardContent>
      {!rows.length ? (
        <Typography color="text.secondary" textAlign="center" variant="body2" sx={{ px: 2, py: 5 }}>
          Nenhum dado para os filtros selecionados.
        </Typography>
      ) : compact ? (
        <Stack divider={<Box sx={{ borderTop: '1px solid #F1F5F9' }} />}>
          {rows.map((row, rowIndex) => (
            <Box
              component="dl"
              key={rowIndex}
              sx={{ display: 'grid', gridTemplateColumns: 'minmax(110px, 42%) 1fr', gap: 0.5, m: 0, p: 1.75 }}
            >
              {headers.map((header, index) => (
                <Box key={header} sx={{ display: 'contents' }}>
                  <Typography component="dt" variant="caption" color="text.secondary" fontWeight={700}>
                    {header}
                  </Typography>
                  <Typography component="dd" variant="body2" sx={{ m: 0, overflowWrap: 'anywhere', color: '#1E293B' }}>
                    {String(row[index] ?? '—')}
                  </Typography>
                </Box>
              ))}
            </Box>
          ))}
        </Stack>
      ) : (
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                {headers.map((header) => (
                  <TableCell key={header} sx={{ fontWeight: 750 }}>
                    {header}
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((row, rowIndex) => (
                <TableRow key={rowIndex} hover>
                  {row.map((value, index) => (
                    <TableCell key={`${headers[index]}-${index}`} sx={{ color: '#334155', fontSize: 13 }}>
                      {String(value ?? '—')}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Card>
  );
}

export function BiPage({ viewKey }: { viewKey: BiViewKey }) {
  const today = todayInSaoPaulo();
  const defaults = useMemo(() => initialFilters(today), [today]);
  const [filters, setFilters] = useState<BiFilters>(defaults);
  const { data, loading, directory, options } = useBiData(filters, today);
  const view = useMemo(() => buildBiView(viewKey, data), [viewKey, data]);
  const context = [
    `Período: ${filters.from} a ${filters.to}`,
    `Registros no escopo: ${data.analytics.records}`,
    'Fonte: base local sincronizada do Frequência ITB',
  ];
  const invalidPeriod = filters.from > filters.to;

  return (
    <Section
      title={`B.I. • ${view.title}`}
      subtitle={view.description}
      action={
        <ExportActions
          title={view.title}
          context={context}
          headers={view.headers}
          rows={view.rows}
          payload={view.payload}
          metrics={view.metrics}
        />
      }
    >
      <BiFilterBar
        filters={filters}
        onChange={setFilters}
        courses={options.courses}
        classes={options.classes}
        teachers={directory}
        onReset={() => setFilters(defaults)}
      />

      {loading && <LinearProgress aria-label="Carregando dados do B.I" sx={{ height: 2 }} />}

      {invalidPeriod ? (
        <Alert severity="warning" sx={{ borderRadius: 2 }}>
          A data inicial precisa ser anterior ou igual à data final.
        </Alert>
      ) : (
        <Stack gap={1.5}>
          <MetricGrid metrics={view.metrics} />
          {view.chart && <AnalyticsChart chart={view.chart} />}
          <ResultTable title={view.tableTitle} headers={view.headers} rows={view.rows} />
          {view.limitations.length > 0 && (
            <Alert severity="info" sx={{ borderRadius: 2 }}>
              <Typography fontWeight={700} variant="body2">
                Como interpretar
              </Typography>
              <Box component="ul" sx={{ my: 0.5, pl: 2.5 }}>
                {view.limitations.map((item) => (
                  <li key={item}>
                    <Typography variant="body2">{item}</Typography>
                  </li>
                ))}
              </Box>
            </Alert>
          )}
        </Stack>
      )}
    </Section>
  );
}
