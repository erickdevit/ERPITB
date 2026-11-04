// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ReportsCenterPage } from './reports-page';

const mocks = vi.hoisted(() => ({
  view: {
    type: 'institutional', title: 'Consolidado institucional', description: 'Resumo do período', ready: true,
    requiredMessage: '', context: ['Período: 01/08/2026 a 15/08/2026'], headers: ['Indicador', 'Valor'],
    rows: [['Frequência', '82%']], metrics: [{ label: 'Frequência', value: '82%' }], notices: [], sections: [],
  },
}));

vi.mock('../../app-context', () => ({
  useApp: () => ({ session: { id: 'admin-1', name: 'Admin', role: 'admin' } }),
}));
vi.mock('./use-report-data', () => ({
  useReportData: () => ({
    view: mocks.view, loading: false, directory: [], directoryError: '',
    options: { classes: [], classTeachers: [], courses: [], enrollments: [], students: [] },
  }),
}));

describe('ReportsCenterPage', () => {
  it('renders the selected report and all supported export formats', () => {
    render(<ReportsCenterPage />);

    expect(screen.getByRole('heading', { name: 'Consolidado institucional' })).toBeInTheDocument();
    expect(screen.getAllByText('82%')).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'PDF' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Excel' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'CSV' })).toBeEnabled();
  });
});
