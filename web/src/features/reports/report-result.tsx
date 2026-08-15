import { Box, Card, CardContent, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography, useMediaQuery } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import type { ExportValue } from '../../lib/exports';
import type { ReportMetric, ReportView } from './model';

function MetricGrid({ metrics }: { metrics: ReportMetric[] }) {
  return (
    <Box
      component="section"
      aria-label="Indicadores do relatório"
      sx={{
        display: 'grid',
        gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(4, minmax(0, 1fr))' },
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
          </CardContent>
        </Card>
      ))}
    </Box>
  );
}

function MobileRows({ headers, rows }: { headers: string[]; rows: ExportValue[][] }) {
  return (
    <Stack divider={<Box sx={{ borderTop: '1px solid #F1F5F9' }} />}>
      {rows.map((row, rowIndex) => (
        <Box
          component="dl"
          key={rowIndex}
          sx={{ display: 'grid', gridTemplateColumns: 'minmax(108px, 40%) 1fr', gap: 0.5, m: 0, p: 1.75 }}
        >
          {headers.map((header, index) => (
            <Box key={`${header}-${index}`} sx={{ display: 'contents' }}>
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
  );
}

export function ReportResult({ view }: { view: ReportView }) {
  const theme = useTheme();
  const compact = useMediaQuery(theme.breakpoints.down('sm'));

  return (
    <Stack gap={1.5}>
      <MetricGrid metrics={view.metrics} />
      <Card component="section" aria-labelledby="report-table-title" sx={{ border: '1px solid #E2E8F0', borderRadius: 3 }}>
        <CardContent sx={{ p: 2, pb: 1.25, borderBottom: '1px solid #F1F5F9' }}>
          <Typography id="report-table-title" fontWeight={750} color="#0F172A" fontSize={15}>
            {view.tableTitle}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {view.rows.length.toLocaleString('pt-BR')} linha(s) encontrada(s)
          </Typography>
        </CardContent>
        {!view.rows.length ? (
          <Typography color="text.secondary" textAlign="center" variant="body2" sx={{ px: 2, py: 5 }}>
            Nenhum dado para os filtros selecionados.
          </Typography>
        ) : compact && !view.matrix ? (
          <MobileRows headers={view.headers} rows={view.rows} />
        ) : (
          <TableContainer sx={{ maxHeight: { xs: 520, lg: 680 } }}>
            <Table size="small" stickyHeader aria-label={view.tableTitle}>
              <TableHead>
                <TableRow>
                  {view.headers.map((header, index) => (
                    <TableCell key={`${header}-${index}`} sx={{ whiteSpace: 'nowrap', fontWeight: 750 }}>
                      {header}
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {view.rows.map((row, rowIndex) => (
                  <TableRow key={rowIndex} hover>
                    {row.map((value, index) => (
                      <TableCell
                        key={`${rowIndex}-${index}`}
                        sx={{
                          minWidth: index < 2 ? 112 : undefined,
                          whiteSpace: view.matrix && index >= 2 ? 'nowrap' : undefined,
                          color: '#334155',
                          fontSize: 13,
                        }}
                      >
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
    </Stack>
  );
}
