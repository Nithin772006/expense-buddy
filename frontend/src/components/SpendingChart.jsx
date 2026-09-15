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
    <ResponsiveContainer width="100%" height={230}>
      <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
        <defs>
          <linearGradient id="ebSpendGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#2d6a4f" stopOpacity={0.28} />
            <stop offset="60%" stopColor="#52b788" stopOpacity={0.12} />
            <stop offset="95%" stopColor="#d8f3dc" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(82, 183, 136, 0.18)" vertical={false} />
        <XAxis
          dataKey="date"
          tick={{ fontSize: 11.5, fill: '#476856', fontWeight: 500 }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tick={{ fontSize: 11.5, fill: '#476856', fontWeight: 500 }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`}
          width={48}
        />
        <Tooltip content={<CustomTooltip />} />
        <Area
          type="monotone"
          dataKey="amount"
          stroke="#2d6a4f"
          strokeWidth={2.5}
          fill="url(#ebSpendGradient)"
          dot={{ r: 3, fill: '#2d6a4f', strokeWidth: 1.5, stroke: '#ffffff' }}
          activeDot={{ r: 6, fill: '#1b4332', stroke: '#52b788', strokeWidth: 2 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
