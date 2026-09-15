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

// Curated Expense Buddy fintech palette: rich emeralds, mints, warm neutrals, and soft terracotta
const CATEGORY_COLORS = {
  'Groceries':        '#2d6a4f', // Emerald
  'Food & Dining':    '#40916c', // Light Emerald
  'Bills & Utilities':'#1b4332', // Deep Forest
  'Subscriptions':    '#52b788', // Mint
  'Transportation':   '#1d70b8', // Soft Blue
  'Shopping':         '#d97706', // Warm Amber
  'Entertainment':    '#74c69d', // Mint Pale
  'Health & Fitness': '#95d5b2', // Pistachio
  'Travel':           '#2a9d8f', // Teal Mint
  'Miscellaneous':    '#8da399', // Sage Neutral
};

const DEFAULT_COLOR = '#95d5b2';

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
 * CategoryChart — doughnut chart of spending by category with center summary.
 * Props: transactions (array)
 */
export default function CategoryChart({ transactions }) {
  if (!transactions || transactions.length === 0) {
    return <div className="chart-empty">No category data yet.</div>;
  }

  const byCat = {};
  let totalAmount = 0;
  transactions.forEach((t) => {
    const amt = t.amount || 0;
    const cat = t.category || 'Uncategorized';
    byCat[cat] = (byCat[cat] || 0) + amt;
    totalAmount += amt;
  });

  const data = Object.entries(byCat).map(([name, value]) => ({ name, value }));

  return (
    <div style={{ position: 'relative', width: '100%', height: 260 }}>
      <ResponsiveContainer width="100%" height={260}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="45%"
            innerRadius={62}
            outerRadius={96}
            paddingAngle={3}
            dataKey="value"
            stroke="#ffffff"
            strokeWidth={2}
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
            wrapperStyle={{
              fontSize: '11.5px',
              color: '#476856',
              fontWeight: 500,
              paddingTop: '8px',
            }}
          />
        </PieChart>
      </ResponsiveContainer>

      {/* Center Summary Figure */}
      <div
        style={{
          position: 'absolute',
          top: '45%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          textAlign: 'center',
          pointerEvents: 'none',
        }}
      >
        <div
          style={{
            fontSize: '1.2rem',
            fontWeight: 800,
            color: 'var(--eb-deep-forest, #132e22)',
            letterSpacing: '-0.4px',
            lineHeight: 1.1,
          }}
        >
          {formatCurrency(totalAmount)}
        </div>
        <div
          style={{
            fontSize: '0.7rem',
            fontWeight: 700,
            color: 'var(--text-3, #688a77)',
            textTransform: 'uppercase',
            letterSpacing: '0.6px',
            marginTop: '3px',
          }}
        >
          Total Spend
        </div>
      </div>
    </div>
  );
}
