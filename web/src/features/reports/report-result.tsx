import { Box, Card, CardContent, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography, useMediaQuery } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import type { ExportValue } from '../../lib/exports';
import type { ReportMetric, ReportView } from './model';

function MetricGrid({ metrics }: { metrics: ReportMetric[] }) {
  return <Box component="section" aria-label="Indicadores do relatório" sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(4, minmax(0, 1fr))' }, gap: 1.5 }}>
    {metrics.map((metric) => <Card key={metric.label}><CardContent sx={{ p: { xs: 1.5, md: 2 }, '&:last-child': { pb: { xs: 1.5, md: 2 } } }}><Typography variant="body2" color="text.secondary">{metric.label}</Typography><Typography variant="h5" component="p" fontWeight={850} color="primary.dark">{metric.value}</Typography></CardContent></Card>)}
  </Box>;
}

function MobileRows({ headers, rows }: { headers: string[]; rows: ExportValue[][] }) {
  return <Stack divider={<Box sx={{ borderTop: '1px solid', borderColor: 'divider' }} />}>
    {rows.map((row, rowIndex) => <Box component="dl" key={rowIndex} sx={{ display: 'grid', gridTemplateColumns: 'minmax(108px, 40%) 1fr', gap: 0.75, m: 0, p: 2 }}>
      {headers.map((header, index) => <Box key={`${header}-${index}`} sx={{ display: 'contents' }}><Typography component="dt" variant="caption" color="text.secondary" fontWeight={700}>{header}</Typography><Typography component="dd" variant="body2" sx={{ m: 0, overflowWrap: 'anywhere' }}>{String(row[index] ?? '—')}</Typography></Box>)}
    </Box>)}
  </Stack>;
}

export function ReportResult({ view }: { view: ReportView }) {
  const theme = useTheme();
  const compact = useMediaQuery(theme.breakpoints.down('sm'));
  return <Stack gap={2}>
    <MetricGrid metrics={view.metrics} />
    <Card component="section" aria-labelledby="report-table-title">
      <CardContent sx={{ pb: 1 }}><Typography id="report-table-title" fontWeight={800}>{view.tableTitle}</Typography><Typography variant="caption" color="text.secondary">{view.rows.length.toLocaleString('pt-BR')} linha(s)</Typography></CardContent>
      {!view.rows.length ? <Typography color="text.secondary" textAlign="center" sx={{ px: 2, py: 5 }}>Nenhum dado para os filtros selecionados.</Typography>
        : compact && !view.matrix ? <MobileRows headers={view.headers} rows={view.rows} />
          : <TableContainer sx={{ maxHeight: { xs: 520, lg: 680 } }}><Table size="small" stickyHeader aria-label={view.tableTitle}><TableHead><TableRow>{view.headers.map((header, index) => <TableCell key={`${header}-${index}`} sx={{ whiteSpace: 'nowrap', fontWeight: 800 }}>{header}</TableCell>)}</TableRow></TableHead><TableBody>{view.rows.map((row, rowIndex) => <TableRow key={rowIndex} hover>{row.map((value, index) => <TableCell key={`${rowIndex}-${index}`} sx={{ minWidth: index < 2 ? 112 : undefined, whiteSpace: view.matrix && index >= 2 ? 'nowrap' : undefined }}>{String(value ?? '—')}</TableCell>)}</TableRow>)}</TableBody></Table></TableContainer>}
    </Card>
  </Stack>;
}
