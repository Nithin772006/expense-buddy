import React from 'react';

/**
 * StatCard — top-level summary card.
 * Props: icon (lucide component), label, value, sub, color ('purple'|'blue'|'green'|'red'|'amber')
 */
export default function StatCard({ icon: Icon, label, value, sub, color = 'green' }) {
  return (
    <div className={`stat-card stat-card--${color}`}>
      <div className="stat-card-top">
        <div className={`stat-card-icon stat-card-icon--${color}`}>
          <Icon size={17} />
        </div>
        <p className="stat-label">{label}</p>
      </div>
      <div className="stat-card-body">
        <p className="stat-value">{value}</p>
        {sub && <p className="stat-sub" title={sub}>{sub}</p>}
      </div>
    </div>
  );
}
