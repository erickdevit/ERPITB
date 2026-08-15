import { useMemo, useState } from 'react';
import FileDownloadOutlinedIcon from '@mui/icons-material/FileDownloadOutlined';
import PictureAsPdfOutlinedIcon from '@mui/icons-material/PictureAsPdfOutlined';
import DataObjectOutlinedIcon from '@mui/icons-material/DataObjectOutlined';
import { Alert, Box, Button, Card, CardContent, LinearProgress, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography, useMediaQuery } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { exportBiJson, exportExcelCsv, exportExcelXlsx, exportSimplePdf, type ExportValue } from '../../lib/exports';
import { todayInSaoPaulo } from '../../lib/date';
import type { BiFilters } from './model';
import { useBiData } from './use-bi-data';
import { BiFilterBar } from './bi-filter-bar';
import { buildBiView, type BiChart, type BiViewKey } from './views';

function initialFilters(today: string): BiFilters {
  const from = new Date(`${today}T12:00:00Z`); from.setUTCDate(from.getUTCDate() - 29);
  return { from: from.toISOString().slice(0, 10), to: today };
}

const safeFilename = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const spreadsheetSafe = (value: ExportValue): ExportValue => typeof value === 'string' && /^[=+\-@]/.test(value.trimStart()) ? `'${value}` : value;

function ExportActions({ title, context, headers, rows, payload, metrics }: { title: string; context: string[]; headers: string[]; rows: ExportValue[][]; payload: unknown; metrics: Array<{ label: string; value: string }> }) {
  const filename = safeFilename(title);
  return <Stack direction="row" gap={1} flexWrap="wrap" aria-label="Opções de exportação">
    <Button size="small" variant="outlined" startIcon={<FileDownloadOutlinedIcon />} onClick={() => void exportExcelXlsx(filename, metrics.map((item) => [item.label, item.value]), headers, rows, context.map((item, index) => [`Contexto ${index + 1}`, item]))}>Excel</Button>
    <Button size="small" variant="outlined" startIcon={<FileDownloadOutlinedIcon />} onClick={() => exportExcelCsv(filename, headers, rows.map((row) => row.map(spreadsheetSafe)))}>CSV</Button>
    <Button size="small" variant="outlined" startIcon={<PictureAsPdfOutlinedIcon />} onClick={() => void exportSimplePdf(filename, title, context, headers, rows)}>PDF</Button>
    <Button size="small" variant="outlined" startIcon={<DataObjectOutlinedIcon />} onClick={() => exportBiJson(filename, payload)}>Dados B.I</Button>
  </Stack>;
}

function MetricGrid({ metrics }: { metrics: ReturnType<typeof buildBiView>['metrics'] }) {
  return <Box component="section" aria-label="Indicadores" sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', md: 'repeat(4, minmax(0, 1fr))', xl: 'repeat(6, minmax(0, 1fr))' }, gap: 1.5 }}>
    {metrics.map((metric) => <Card key={metric.label}><CardContent sx={{ p: { xs: 1.5, md: 2 }, '&:last-child': { pb: { xs: 1.5, md: 2 } } }}><Typography variant="body2" color="text.secondary">{metric.label}</Typography><Typography variant="h5" component="p" fontWeight={850} color="primary.dark">{metric.value}</Typography>{metric.detail && <Typography variant="caption" color="text.secondary">{metric.detail}</Typography>}</CardContent></Card>)}
  </Box>;
}

function AnalyticsChart({ chart }: { chart: BiChart }) {
  const content = chart.type === 'line'
    ? <LineChart data={chart.data} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}><CartesianGrid vertical={false} strokeDasharray="3 3" /><XAxis dataKey={chart.categoryKey} tick={{ fontSize: 11 }} /><YAxis unit={chart.valueSuffix} width={48} /><Tooltip /><Line type="monotone" dataKey={chart.valueKey} stroke="#1769AA" strokeWidth={3} dot={chart.data.length < 20} /></LineChart>
    : <BarChart data={chart.data} layout="vertical" margin={{ top: 8, right: 20, left: 28, bottom: 8 }}><CartesianGrid horizontal={false} strokeDasharray="3 3" /><XAxis type="number" unit={chart.valueSuffix} /><YAxis type="category" dataKey={chart.categoryKey} width={110} tick={{ fontSize: 11 }} /><Tooltip /><Bar dataKey={chart.valueKey} fill="#29B6C8" radius={[0, 6, 6, 0]} /></BarChart>;
  return <Card component="section"><CardContent><Typography fontWeight={800}>{chart.title}</Typography><Typography variant="body2" color="text.secondary">{chart.description}</Typography><Box role="img" aria-label={`${chart.title}. ${chart.description}`} sx={{ height: { xs: 300, md: 340 }, mt: 2 }}><ResponsiveContainer width="100%" height="100%">{content}</ResponsiveContainer></Box><Typography sx={{ position: 'absolute', width: 1, height: 1, p: 0, m: -1, overflow: 'hidden', clip: 'rect(0,0,0,0)', whiteSpace: 'nowrap', border: 0 }}>{chart.data.map((item) => `${item[chart.categoryKey]}: ${item[chart.valueKey]}${chart.valueSuffix ?? ''}`).join('; ')}</Typography></CardContent></Card>;
}

function ResultTable({ title, headers, rows }: { title: string; headers: string[]; rows: ExportValue[][] }) {
  const theme = useTheme(); const compact = useMediaQuery(theme.breakpoints.down('sm'));
  return <Card component="section" aria-labelledby="bi-result-title"><CardContent sx={{ pb: 1 }}><Typography id="bi-result-title" fontWeight={800}>{title}</Typography><Typography variant="caption" color="text.secondary">{rows.length.toLocaleString('pt-BR')} linha(s)</Typography></CardContent>
    {!rows.length ? <Typography color="text.secondary" textAlign="center" sx={{ px: 2, py: 5 }}>Nenhum dado para os filtros selecionados.</Typography> : compact ? <Stack divider={<Box sx={{ borderTop: '1px solid', borderColor: 'divider' }} />}>
      {rows.map((row, rowIndex) => <Box component="dl" key={rowIndex} sx={{ display: 'grid', gridTemplateColumns: 'minmax(110px, 42%) 1fr', gap: 0.75, m: 0, p: 2 }}>{headers.map((header, index) => <Box key={header} sx={{ display: 'contents' }}><Typography component="dt" variant="caption" color="text.secondary" fontWeight={700}>{header}</Typography><Typography component="dd" variant="body2" sx={{ m: 0, overflowWrap: 'anywhere' }}>{String(row[index] ?? '—')}</Typography></Box>)}</Box>)}
    </Stack> : <TableContainer><Table size="small"><TableHead><TableRow>{headers.map((header) => <TableCell key={header}>{header}</TableCell>)}</TableRow></TableHead><TableBody>{rows.map((row, rowIndex) => <TableRow key={rowIndex} hover>{row.map((value, index) => <TableCell key={`${headers[index]}-${index}`}>{String(value ?? '—')}</TableCell>)}</TableRow>)}</TableBody></Table></TableContainer>}
  </Card>;
}

export function BiPage({ viewKey }: { viewKey: BiViewKey }) {
  const today = todayInSaoPaulo(); const defaults = useMemo(() => initialFilters(today), [today]);
  const [filters, setFilters] = useState<BiFilters>(defaults);
  const { data, loading, directory, options } = useBiData(filters, today);
  const view = useMemo(() => buildBiView(viewKey, data), [viewKey, data]);
  const context = [`Período: ${filters.from} a ${filters.to}`, `Registros no escopo: ${data.analytics.records}`, 'Fonte: base local sincronizada do Frequência ITB'];
  const invalidPeriod = filters.from > filters.to;

  return <Stack gap={2.25}>
    <Stack direction={{ xs: 'column', md: 'row' }} gap={1.5} alignItems={{ md: 'flex-start' }} justifyContent="space-between">
      <Typography color="text.secondary" sx={{ maxWidth: 760 }}>{view.description}</Typography>
      <ExportActions title={view.title} context={context} headers={view.headers} rows={view.rows} payload={view.payload} metrics={view.metrics} />
    </Stack>
    <BiFilterBar filters={filters} onChange={setFilters} courses={options.courses} classes={options.classes} teachers={directory} onReset={() => setFilters(defaults)} />
    {loading && <LinearProgress aria-label="Carregando dados do B.I" />}
    {invalidPeriod ? <Alert severity="warning">A data inicial precisa ser anterior ou igual à data final.</Alert> : <>
      <MetricGrid metrics={view.metrics} />
      {view.chart && <AnalyticsChart chart={view.chart} />}
      <ResultTable title={view.tableTitle} headers={view.headers} rows={view.rows} />
      {view.limitations.length > 0 && <Alert severity="info"><Typography fontWeight={700} variant="body2">Como interpretar</Typography><Box component="ul" sx={{ my: 0.5, pl: 2.5 }}>{view.limitations.map((item) => <li key={item}><Typography variant="body2">{item}</Typography></li>)}</Box></Alert>}
    </>}
  </Stack>;
}
