'use client';

import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

/** Categorical slots 1 and 2 (validated together: light surface, CVD ΔE 24.7). */
const REPORTED = '#2a78d6';
const CLOSED = '#eb6834';
const GRID = '#e5e5e3';
const AXIS = '#52514e';

export interface TrendDatum {
  label: string;
  reported: number;
  closed: number;
}

export interface FixTimeDatum {
  label: string;
  count: number;
}

const tooltipStyle = {
  contentStyle: { borderRadius: 6, borderColor: GRID, fontSize: 13 },
  labelStyle: { color: '#0b0b0b', fontWeight: 600 },
  itemStyle: { color: '#0b0b0b' },
} as const;

function Legend() {
  return (
    <ul className="mb-2 flex gap-4 text-sm text-neutral-700" aria-hidden="true">
      <li className="flex items-center gap-2">
        <span className="h-0.5 w-4 rounded" style={{ background: REPORTED }} /> Reported
      </li>
      <li className="flex items-center gap-2">
        <span className="h-0.5 w-4 rounded" style={{ background: CLOSED }} /> Closed
      </li>
    </ul>
  );
}

/** Issues reported and closed per period. The table below it is the accessible view. */
export function TrendChart({ data }: { data: readonly TrendDatum[] }) {
  return (
    <div>
      <Legend />
      <div className="h-64 w-full" aria-hidden="true">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={[...data]} margin={{ top: 8, right: 16, bottom: 0, left: -16 }}>
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fill: AXIS, fontSize: 12 }}
              tickLine={false}
              axisLine={{ stroke: GRID }}
              minTickGap={16}
            />
            <YAxis
              allowDecimals={false}
              tick={{ fill: AXIS, fontSize: 12 }}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip {...tooltipStyle} cursor={{ stroke: AXIS, strokeDasharray: '3 3' }} />
            <Line
              type="monotone"
              dataKey="reported"
              name="Reported"
              stroke={REPORTED}
              strokeWidth={2}
              dot={{ r: 4, strokeWidth: 2, stroke: '#fcfcfb' }}
              activeDot={{ r: 5 }}
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="closed"
              name="Closed"
              stroke={CLOSED}
              strokeWidth={2}
              dot={{ r: 4, strokeWidth: 2, stroke: '#fcfcfb' }}
              activeDot={{ r: 5 }}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/** Closed issues by how long the fix took. One series, so no legend. */
export function FixTimeChart({ data }: { data: readonly FixTimeDatum[] }) {
  return (
    <div className="h-56 w-full" aria-hidden="true">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={[...data]} margin={{ top: 8, right: 16, bottom: 0, left: -16 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fill: AXIS, fontSize: 12 }}
            tickLine={false}
            axisLine={{ stroke: GRID }}
          />
          <YAxis
            allowDecimals={false}
            tick={{ fill: AXIS, fontSize: 12 }}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip {...tooltipStyle} cursor={{ fill: '#f2f2f0' }} />
          <Bar
            dataKey="count"
            name="Closed issues"
            fill={REPORTED}
            radius={[4, 4, 0, 0]}
            maxBarSize={48}
            isAnimationActive={false}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
