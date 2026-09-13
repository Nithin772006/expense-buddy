import React from 'react';
import { TrendingUp } from 'lucide-react';
import { formatCurrency } from '../utils/constants';

/**
 * ForecastCard — shows the forecasted next expense.
 * Props: amount (number | null), loading (bool)
 */
export default function ForecastCard({ amount, loading }) {
  return (
    <div className="forecast-widget">
      <div className="forecast-widget-header">
        <TrendingUp size={16} />
        <span>Predicted Next Expense</span>
      </div>
      {loading ? (
        <p className="forecast-widget-loading">Calculating…</p>
      ) : amount !== null && amount !== undefined ? (
        <>
          <p className="forecast-widget-amount">{formatCurrency(amount)}</p>
          <p className="forecast-widget-note">
            Estimated amount for the next observed expense based on historical spending behavior.
            This is a model estimate, not a guarantee.
          </p>
        </>
      ) : (
        <p className="forecast-widget-empty">
          Visit the <strong>Forecast</strong> page to generate a prediction.
        </p>
      )}
    </div>
  );
}
