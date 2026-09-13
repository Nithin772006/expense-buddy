import React from 'react';
import { Lightbulb } from 'lucide-react';
import { formatCurrency } from '../utils/constants';

/**
 * Generates human-readable AI insights from real transaction data.
 * Props: transactions (array)
 */
export default function AIInsights({ transactions }) {
  if (transactions.length === 0) {
    return (
      <div className="insights-empty">
        <Lightbulb size={20} />
        <p>Add transactions to see AI-generated spending insights.</p>
      </div>
    );
  }

  const insights = generateInsights(transactions);

  return (
    <div className="insights-list">
      {insights.map((text, i) => (
        <div key={i} className="insight-item">
          <Lightbulb size={14} className="insight-icon" />
          <p>{text}</p>
        </div>
      ))}
    </div>
  );
}

function generateInsights(transactions) {
  const insights = [];
  const total = transactions.reduce((s, t) => s + t.amount, 0);
  const avg = total / transactions.length;
  const anomalyCount = transactions.filter((t) => t.is_anomaly).length;

  // Category breakdown
  const byCat = {};
  transactions.forEach((t) => {
    byCat[t.category] = (byCat[t.category] || 0) + t.amount;
  });
  const sorted = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
  const [topCat, topAmt] = sorted[0];
  const topPct = ((topAmt / total) * 100).toFixed(0);

  insights.push(`Your highest spending category is ${topCat} (${topPct}% of total).`);
  insights.push(`Your average transaction is ${formatCurrency(avg)}.`);

  if (anomalyCount > 0) {
    insights.push(`${anomalyCount} unusual transaction${anomalyCount > 1 ? 's were' : ' was'} detected by AI — review them for accuracy.`);
  } else {
    insights.push('All transactions appear within your normal spending range.');
  }

  if (sorted.length >= 2) {
    const [sec, secAmt] = sorted[1];
    insights.push(`${sec} is your second-largest category at ${formatCurrency(secAmt)}.`);
  }

  insights.push(`Total recorded spending: ${formatCurrency(total)} across ${transactions.length} transaction${transactions.length > 1 ? 's' : ''}.`);

  return insights;
}
