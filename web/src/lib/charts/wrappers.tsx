import React, { useMemo } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { CHART_TOKENS } from './tokens';
import {
  formatCompactCurrency,
  formatCompactNumber,
  formatCurrencyValue,
  formatInteger,
  formatPercent,
  formatShortDate,
} from './formatters';

// Standard Tooltip Component
export function StandardChartTooltip({
  active,
  payload,
  label,
  formatter,
  labelFormatter,
}: any) {
  if (!active || !payload || !payload.length) return null;

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-2.5 shadow-md text-xs min-w-[140px] z-50">
      {label && (
        <div className="font-bold text-slate-900 border-b border-slate-100 pb-1.5 mb-1.5">
          {labelFormatter ? labelFormatter(label) : String(label)}
        </div>
      )}
      <div className="space-y-1">
        {payload.map((item: any, idx: number) => {
          const formatted = formatter
            ? formatter(item.value, item.name, item)
            : [String(item.value), item.name];
          const val = Array.isArray(formatted) ? formatted[0] : formatted;
          const name = Array.isArray(formatted) ? formatted[1] : item.name;

          return (
            <div key={idx} className="flex items-center justify-between gap-3 text-slate-700">
              <div className="flex items-center gap-1.5 truncate">
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: item.color || item.fill || CHART_TOKENS.palette[0] }}
                />
                <span className="text-slate-500 truncate">{name}</span>
              </div>
              <span className="font-bold text-slate-900 shrink-0">{val}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// 1. Line Trend Chart Wrapper
export interface LineTrendSeries {
  key: string;
  name: string;
  color?: string;
  strokeWidth?: number;
}

export function LineTrendChart({
  data,
  xKey = 'date',
  series,
  targetValue,
  targetLabel,
  unit = '%',
  yDomain = [0, 100],
  height = 280,
}: {
  data: Array<Record<string, any>>;
  xKey?: string;
  series: LineTrendSeries[];
  targetValue?: number;
  targetLabel?: string;
  unit?: string;
  yDomain?: [number, number];
  height?: number | string;
}) {
  return (
    <div style={{ width: '100%', height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={CHART_TOKENS.layout.margin}>
          <CartesianGrid strokeDasharray={CHART_TOKENS.layout.gridDash} stroke={CHART_TOKENS.semantic.grid} vertical={false} />
          <XAxis
            dataKey={xKey}
            tickFormatter={(val) => formatShortDate(String(val))}
            minTickGap={28}
            tick={{ fontSize: CHART_TOKENS.typography.axisTickSize, fill: CHART_TOKENS.semantic.textMuted }}
            stroke={CHART_TOKENS.semantic.border}
          />
          <YAxis
            domain={yDomain}
            unit={unit}
            width={44}
            tick={{ fontSize: CHART_TOKENS.typography.axisTickSize, fill: CHART_TOKENS.semantic.textMuted }}
            stroke={CHART_TOKENS.semantic.border}
          />
          <Tooltip
            content={<StandardChartTooltip labelFormatter={(l: any) => formatShortDate(String(l))} />}
          />
          {targetValue !== undefined && (
            <ReferenceLine
              y={targetValue}
              stroke={CHART_TOKENS.semantic.negative}
              strokeDasharray="4 4"
              label={{
                value: targetLabel ?? `Meta: ${targetValue}${unit}`,
                position: 'right',
                fill: CHART_TOKENS.semantic.negative,
                fontSize: 10,
                fontWeight: 600,
              }}
            />
          )}
          {series.map((s, idx) => (
            <Line
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.name}
              stroke={s.color || CHART_TOKENS.palette[idx % CHART_TOKENS.palette.length]}
              strokeWidth={s.strokeWidth ?? CHART_TOKENS.layout.strokeWidth}
              dot={{ r: 2.5, fill: s.color || CHART_TOKENS.palette[idx % CHART_TOKENS.palette.length] }}
              activeDot={{ r: 5 }}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// 2. Horizontal Bar Chart Wrapper (Sorted comparison with direct labels)
export interface HorizontalBarChartProps {
  data: Array<Record<string, any>>;
  categoryKey: string;
  valueKey: string;
  valueSuffix?: string;
  valueFormatter?: (val: number, item?: any) => string;
  height?: number | string;
  barColor?: string;
  topN?: number;
  highlightKey?: string;
}

export function HorizontalBarChart({
  data,
  categoryKey,
  valueKey,
  valueSuffix = '%',
  valueFormatter,
  height,
  barColor = CHART_TOKENS.palette[0],
  topN,
}: HorizontalBarChartProps) {
  const processedData = useMemo(() => {
    let list = [...data];
    if (topN && list.length > topN) {
      const topItems = list.slice(0, topN);
      list = topItems;
    }
    return list;
  }, [data, topN]);

  const calcHeight = height || Math.min(520, Math.max(240, processedData.length * 40));

  return (
    <div style={{ width: '100%', height: calcHeight }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={processedData}
          layout="vertical"
          margin={{ top: 8, right: 64, bottom: 8, left: 8 }}
        >
          <CartesianGrid strokeDasharray={CHART_TOKENS.layout.gridDash} stroke={CHART_TOKENS.semantic.grid} horizontal={false} />
          <XAxis
            type="number"
            tick={{ fontSize: CHART_TOKENS.typography.axisTickSize, fill: CHART_TOKENS.semantic.textMuted }}
            stroke={CHART_TOKENS.semantic.border}
          />
          <YAxis type="category" dataKey={categoryKey} hide />
          <Tooltip
            content={
              <StandardChartTooltip
                formatter={(val: any, _name: any, item: any) => [
                  valueFormatter ? valueFormatter(Number(val), item?.payload) : `${val}${valueSuffix}`,
                  item?.payload?.[categoryKey] || 'Valor',
                ]}
              />
            }
          />
          <Bar
            dataKey={valueKey}
            fill={barColor}
            radius={[0, 4, 4, 0]}
            barSize={24}
            background={{ fill: CHART_TOKENS.semantic.grid, radius: 4 }}
            label={(props: any) => {
              const { x, y, width, height: bH, value, index } = props;
              const entry = processedData[index];
              if (!entry) return null;
              const name = String(entry[categoryKey] ?? '');
              const nameEstimateWidth = name.length * 7;
              const minValX = x + 12 + nameEstimateWidth + 12;
              const valX = Math.max(x + width + 8, minValX);
              const formattedVal = valueFormatter ? valueFormatter(Number(value), entry) : `${value}${valueSuffix}`;

              return (
                <g>
                  <text
                    x={x + 10}
                    y={y + bH / 2}
                    fill={width > nameEstimateWidth + 24 ? '#FFFFFF' : '#0F172A'}
                    fontSize={11}
                    fontWeight={600}
                    dominantBaseline="central"
                    style={{ pointerEvents: 'none' }}
                  >
                    {name}
                  </text>
                  <text
                    x={valX}
                    y={y + bH / 2}
                    fill="#0F172A"
                    fontSize={11}
                    fontWeight={700}
                    dominantBaseline="central"
                  >
                    {formattedVal}
                  </text>
                </g>
              );
            }}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// 3. Donut Metric Chart (Clean part-to-whole <= 5 slices with center total metric)
export interface DonutSlice {
  name: string;
  value: number;
  count?: number;
  color: string;
}

export function DonutMetricChart({
  data,
  centerLabel,
  centerValue,
  valueFormatter = formatInteger,
  height = 280,
}: {
  data: DonutSlice[];
  centerLabel?: string;
  centerValue?: string;
  valueFormatter?: (val: number, item?: any) => string;
  height?: number | string;
}) {
  return (
    <div className="relative w-full" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            innerRadius={55}
            outerRadius={85}
            paddingAngle={2}
          >
            {data.map((entry, index) => (
              <Cell key={`slice-${index}`} fill={entry.color || CHART_TOKENS.palette[index % CHART_TOKENS.palette.length]} />
            ))}
          </Pie>
          <Tooltip
            content={
              <StandardChartTooltip
                formatter={(val: any, _name: any, item: any) => [
                  valueFormatter(Number(val), item?.payload),
                  item?.payload?.name,
                ]}
              />
            }
          />
          <Legend
            iconType="circle"
            wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
            formatter={(val) => <span className="text-slate-700 font-medium">{val}</span>}
          />
        </PieChart>
      </ResponsiveContainer>
      {centerValue && (
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none pb-7">
          <span className="text-sm sm:text-base font-extrabold text-slate-900 tracking-tight leading-none">
            {centerValue}
          </span>
          {centerLabel && (
            <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider mt-0.5">
              {centerLabel}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// 4. Cash Flow Waterfall Chart (Bridge from opening balance -> Inflows -> Outflows -> Closing)
export function CashFlowWaterfallChart({
  openingCents,
  inflowsCents,
  outflowsCents,
  closingCents,
  height = 240,
}: {
  openingCents: number;
  inflowsCents: number;
  outflowsCents: number;
  closingCents: number;
  height?: number | string;
}) {
  const data = [
    {
      step: 'Saldo Inicial',
      amount: openingCents / 100,
      fill: CHART_TOKENS.semantic.neutral,
      display: formatCurrencyValue(openingCents / 100),
    },
    {
      step: 'Entradas (+)',
      amount: inflowsCents / 100,
      fill: CHART_TOKENS.semantic.positive,
      display: `+${formatCurrencyValue(inflowsCents / 100)}`,
    },
    {
      step: 'Saídas (-)',
      amount: outflowsCents / 100,
      fill: CHART_TOKENS.semantic.negative,
      display: `-${formatCurrencyValue(outflowsCents / 100)}`,
    },
    {
      step: 'Saldo Final',
      amount: closingCents / 100,
      fill: CHART_TOKENS.semantic.target,
      display: formatCurrencyValue(closingCents / 100),
    },
  ];

  return (
    <div style={{ width: '100%', height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 16, right: 16, bottom: 8, left: 16 }}>
          <CartesianGrid strokeDasharray={CHART_TOKENS.layout.gridDash} stroke={CHART_TOKENS.semantic.grid} vertical={false} />
          <XAxis
            dataKey="step"
            tick={{ fontSize: CHART_TOKENS.typography.axisTickSize, fill: CHART_TOKENS.semantic.textPrimary, fontWeight: 600 }}
            stroke={CHART_TOKENS.semantic.border}
          />
          <YAxis
            tickFormatter={(v) => formatCompactCurrency(v)}
            tick={{ fontSize: CHART_TOKENS.typography.axisTickSize, fill: CHART_TOKENS.semantic.textMuted }}
            stroke={CHART_TOKENS.semantic.border}
            width={60}
          />
          <Tooltip
            content={
              <StandardChartTooltip
                formatter={(_val: any, _name: any, item: any) => [
                  item?.payload?.display,
                  item?.payload?.step,
                ]}
              />
            }
          />
          <Bar dataKey="amount" radius={[4, 4, 0, 0]} barSize={36}>
            {data.map((entry, idx) => (
              <Cell key={`cell-${idx}`} fill={entry.fill} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// 5. Receivables Aging Buckets Chart (Bucketed overdue debt: 1-15d, 16-30d, 31-60d, 60+d)
export function AgingBucketsChart({
  buckets,
  height = 240,
}: {
  buckets: Array<{ bucket: string; amountCents: number; count: number; color?: string }>;
  height?: number | string;
}) {
  const data = buckets.map((b, idx) => ({
    bucket: b.bucket,
    amount: b.amountCents / 100,
    count: b.count,
    fill: b.color || (idx === 0 ? '#F59E0B' : idx === 1 ? '#F97316' : '#EF4444'),
  }));

  return (
    <div style={{ width: '100%', height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 16, right: 16, bottom: 8, left: 16 }}>
          <CartesianGrid strokeDasharray={CHART_TOKENS.layout.gridDash} stroke={CHART_TOKENS.semantic.grid} vertical={false} />
          <XAxis
            dataKey="bucket"
            tick={{ fontSize: CHART_TOKENS.typography.axisTickSize, fill: CHART_TOKENS.semantic.textPrimary, fontWeight: 600 }}
            stroke={CHART_TOKENS.semantic.border}
          />
          <YAxis
            tickFormatter={(v) => formatCompactCurrency(v)}
            tick={{ fontSize: CHART_TOKENS.typography.axisTickSize, fill: CHART_TOKENS.semantic.textMuted }}
            stroke={CHART_TOKENS.semantic.border}
            width={60}
          />
          <Tooltip
            content={
              <StandardChartTooltip
                formatter={(val: any, _name: any, item: any) => [
                  `${formatCurrencyValue(Number(val))} (${item?.payload?.count} títulos)`,
                  item?.payload?.bucket,
                ]}
              />
            }
          />
          <Bar dataKey="amount" radius={[4, 4, 0, 0]} barSize={36}>
            {data.map((entry, idx) => (
              <Cell key={`aging-${idx}`} fill={entry.fill} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
