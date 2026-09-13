import React from 'react';

/**
 * StatCard — top-level summary card.
 * Props: icon (lucide component), label, value, sub, color ('purple'|'blue'|'green'|'red'|'amber')
 */
export default function StatCard({ icon: Icon, label, value, sub, color = 'purple' }) {
  return (
    <div className={`stat-card stat-card--${color}`}>
      <div className="stat-card-top">
        <div className={`stat-card-icon stat-card-icon--${color}`}>
          <Icon size={18} />
        </div>
        <p className="stat-label">{label}</p>
      </div>
      <p className="stat-value">{value}</p>
      {sub && <p className="stat-sub">{sub}</p>}
    </div>
  );
}
