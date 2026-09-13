import React from 'react';
import AnomalyBadge from './AnomalyBadge';
import { formatCurrency } from '../utils/constants';
import { Receipt } from 'lucide-react';
import { Link } from 'react-router-dom';

/**
 * TransactionList — renders a list of stored transactions.
 * Props: transactions (array), limit (number, default 8)
 */
export default function TransactionList({ transactions, limit = 8 }) {
  const shown = transactions.slice(0, limit);

  if (transactions.length === 0) {
    return (
      <div className="empty-state">
        <Receipt size={36} className="empty-state-icon" />
        <p className="empty-state-title">No transactions yet</p>
        <p className="empty-state-sub">
          Add your first expense to start analyzing your spending.
        </p>
        <Link to="/add-expense" className="btn-primary btn-sm">
          Add Expense
        </Link>
      </div>
    );
  }

  return (
    <div className="tx-list">
      {shown.map((tx) => (
        <div key={tx.id} className={`tx-row ${tx.is_anomaly ? 'tx-row--anomaly' : ''}`}>
          <div className="tx-category-dot" data-cat={tx.category} />
          <div className="tx-body">
            <p className="tx-desc">{tx.description}</p>
            <p className="tx-meta">
              {tx.category} &nbsp;·&nbsp;{' '}
              {new Date(tx.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
            </p>
          </div>
          <div className="tx-right">
            <p className="tx-amount">{formatCurrency(tx.amount)}</p>
            <AnomalyBadge isAnomaly={tx.is_anomaly} />
          </div>
        </div>
      ))}
    </div>
  );
}
