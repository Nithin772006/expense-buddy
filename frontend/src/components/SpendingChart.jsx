import React from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { formatCurrency } from '../utils/constants';

function CustomTooltip({ active, payload, label }) {
  if (active && payload && payload.length) {
    return (
      <div className="chart-tooltip">
        <p className="chart-tooltip-label">{label}</p>
        <p className="chart-tooltip-value">{formatCurrency(payload[0].value)}</p>
      </div>
    );
  }
  return null;
}

/**
 * SpendingChart — area chart of daily spending over time.
 * Props: transactions (array)
 */
export default function SpendingChart({ transactions }) {
  if (transactions.length === 0) {
    return <div className="chart-empty">No spending data yet.</div>;
  }

  // Aggregate by date (dd MMM)
  const byDate = {};
  [...transactions].reverse().forEach((t) => {
    const label = new Date(t.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
    byDate[label] = (byDate[label] || 0) + t.amount;
  });

  const data = Object.entries(byDate).map(([date, amount]) => ({ date, amount }));

  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 8 }}>
        <defs>
          <linearGradient id="spendGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#7c5cfc" stopOpacity={0.25} />
            <stop offset="95%" stopColor="#7c5cfc" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#252a38" vertical={false} />
        <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#5a6282' }} axisLine={false} tickLine={false} />
        <YAxis
          tick={{ fontSize: 11, fill: '#5a6282' }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`}
          width={45}
        />
        <Tooltip content={<CustomTooltip />} />
        <Area
          type="monotone"
          dataKey="amount"
          stroke="#7c5cfc"
          strokeWidth={2}
          fill="url(#spendGradient)"
          dot={{ r: 3, fill: '#7c5cfc', strokeWidth: 0 }}
          activeDot={{ r: 5 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
