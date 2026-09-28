'use client';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { Daily } from './types';
export function ActivityChart({ data }: { data: Daily[] }) {
  return <>
    <div className="monitor-chart" role="img" aria-label="Daily run counts by current status. Exact values are available in the daily totals table below.">
      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
        <BarChart data={data} accessibilityLayer margin={{ top: 12, right: 8, bottom: 0, left: -20 }}>
          <CartesianGrid vertical={false} stroke="#293e35" strokeDasharray="3 4" />
          <XAxis dataKey="day" tickFormatter={value => String(value).slice(5)} stroke="#a6b8ae" tickLine={false} axisLine={false} minTickGap={30} fontSize={12} />
          <YAxis allowDecimals={false} stroke="#a6b8ae" tickLine={false} axisLine={false} fontSize={12} />
          <Tooltip cursor={{ fill: '#ffffff08' }} contentStyle={{ background: '#12241b', border: '1px solid #456352', borderRadius: 8, color: '#eff6f2' }} />
          <Bar dataKey="SUCCEEDED" name="Succeeded" stackId="runs" fill="#b4efc5" maxBarSize={44} isAnimationActive={false} />
          <Bar dataKey="FAILED" name="Failed" stackId="runs" fill="#ff938a" maxBarSize={44} isAnimationActive={false} />
          <Bar dataKey="RUNNING" name="Running" stackId="runs" fill="#e4c478" maxBarSize={44} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
    <details className="monitor-daily"><summary>View daily totals</summary><div className="monitor-table-scroll"><table><caption className="sr-only">Daily totals in UTC</caption><thead><tr><th>Date (UTC)</th><th>Succeeded</th><th>Failed</th><th>Running</th></tr></thead><tbody>{data.map(row => <tr key={row.day}><th>{row.day}</th><td>{row.SUCCEEDED}</td><td>{row.FAILED}</td><td>{row.RUNNING}</td></tr>)}</tbody></table></div></details>
  </>;
}
