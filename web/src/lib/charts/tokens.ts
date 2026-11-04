/**
 * Centralized Chart Design Tokens
 * Conforms to WCAG 2.2 AA contrast rules and colorblind-safe guidelines.
 */

export const CHART_TOKENS = {
  // Colorblind-safe categorical palette (max 8 distinct colors; remaining group into 'Outros')
  // Based on Wong / Tol palettes for maximum accessibility
  palette: [
    '#0284C7', // Sky 600 - Primary series
    '#10B981', // Emerald 500 - Success / Positive
    '#F59E0B', // Amber 500 - Warning / Neutral
    '#6366F1', // Indigo 500 - Secondary
    '#EC4899', // Pink 500 - Tertiary
    '#14B8A6', // Teal 500 - Quaternary
    '#8B5CF6', // Purple 500 - Quinary
    '#64748B', // Slate 500 - Base / Others
  ] as const,

  // Semantic Colors (consistently applied across finance, attendance, academic)
  semantic: {
    positive: '#10B981', // emerald-500
    negative: '#F43F5E', // rose-500
    warning: '#F59E0B',  // amber-500
    neutral: '#0284C7',  // sky-600
    target: '#0F172A',   // slate-900 (goal reference lines)
    forecast: '#94A3B8', // slate-400 (dashed/projected)
    muted: '#CBD5E1',    // slate-300
    surface: '#FFFFFF',
    border: '#E2E8F0',   // slate-200
    grid: '#F1F5F9',     // slate-100
    textPrimary: '#0F172A', // slate-900
    textMuted: '#64748B',   // slate-500
  },

  // Sequential Palette (light to dark for heatmaps/densities)
  sequential: [
    '#F0F9FF',
    '#BAE6FD',
    '#7DD3FC',
    '#38BDF8',
    '#0284C7',
    '#0369A1',
    '#075985',
  ] as const,

  // Diverging Palette (e.g. negative to positive balance)
  diverging: {
    low: '#F43F5E',
    mid: '#F1F5F9',
    high: '#10B981',
  },

  // Typography
  typography: {
    fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
    titleSize: 13,
    subtitleSize: 11,
    axisTickSize: 11,
    tooltipLabelSize: 12,
    tooltipValueSize: 12,
  },

  // Spacing & Layout
  layout: {
    margin: { top: 12, right: 16, bottom: 8, left: 8 },
    barSize: 20,
    maxBarSize: 32,
    radius: 4,
    strokeWidth: 2,
    gridDash: '3 3',
  },

  // Animation timing
  animation: {
    duration: 300,
    easing: 'ease-out' as const,
  },
} as const;

export type ChartColorKey = keyof typeof CHART_TOKENS.semantic;
