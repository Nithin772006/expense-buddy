import React from 'react';
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { formatCurrency } from '../utils/constants';

const CATEGORY_COLORS = {
  'Groceries':        '#7c5cfc',
  'Transportation':   '#3b91f7',
  'Food & Dining':    '#f5a623',
  'Shopping':         '#f7556b',
  'Bills & Utilities':'#30d68a',
  'Entertainment':    '#a78bfa',
  'Health & Fitness': '#22d3ee',
  'Miscellaneous':    '#94a3b8',
  'Subscriptions':    '#fb923c',
  'Travel':           '#34d399',
};

const DEFAULT_COLOR = '#5a6282';

function CustomTooltip({ active, payload }) {
  if (active && payload && payload.length) {
    const { name, value } = payload[0];
    return (
      <div className="chart-tooltip">
        <p className="chart-tooltip-label">{name}</p>
        <p className="chart-tooltip-value">{formatCurrency(value)}</p>
      </div>
    );
  }
  return null;
}

/**
 * CategoryChart — doughnut chart of spending by category.
 * Props: transactions (array)
 */
export default function CategoryChart({ transactions }) {
  if (transactions.length === 0) {
    return <div className="chart-empty">No category data yet.</div>;
  }

  const byCat = {};
  transactions.forEach((t) => {
    byCat[t.category] = (byCat[t.category] || 0) + t.amount;
  });

  const data = Object.entries(byCat).map(([name, value]) => ({ name, value }));

  return (
    <ResponsiveContainer width="100%" height={240}>
      <PieChart>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          innerRadius={60}
          outerRadius={100}
          paddingAngle={3}
          dataKey="value"
        >
          {data.map((entry) => (
            <Cell
              key={entry.name}
              fill={CATEGORY_COLORS[entry.name] || DEFAULT_COLOR}
            />
          ))}
        </Pie>
        <Tooltip content={<CustomTooltip />} />
        <Legend
          iconType="circle"
          iconSize={8}
          wrapperStyle={{ fontSize: '12px', color: '#8b95b0' }}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}
