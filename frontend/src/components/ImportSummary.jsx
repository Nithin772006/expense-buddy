import React from 'react';
import { CheckCircle2, AlertTriangle, Copy, SkipForward, XCircle } from 'lucide-react';

/**
 * ImportSummary — shows the result after a confirmed import.
 */
export default function ImportSummary({ summary, onDone, onViewDashboard }) {
  if (!summary) return null;

  const { total_rows, successful_rows, duplicate_rows, failed_rows, error_summary } = summary;

  const stats = [
    {
      icon: CheckCircle2,
      color: 'green',
      label: 'Imported',
      value: successful_rows,
    },
    {
      icon: Copy,
      color: 'amber',
      label: 'Duplicates Skipped',
      value: duplicate_rows,
    },
    {
      icon: XCircle,
      color: 'red',
      label: 'Invalid / Failed',
      value: failed_rows,
    },
  ];

  return (
    <div className="import-summary">
      <div className="import-summary-header">
        <CheckCircle2 size={28} className="import-summary-ok-icon" />
        <div>
          <h3 className="import-summary-title">Import Complete</h3>
          <p className="import-summary-sub">
            Processed {total_rows?.toLocaleString()} rows from your file.
          </p>
        </div>
      </div>

      <div className="import-summary-stats">
        {stats.map(({ icon: Icon, color, label, value }) => (
          <div key={label} className={`import-stat import-stat--${color}`}>
            <Icon size={18} />
            <div>
              <p className="import-stat-val">{value?.toLocaleString() ?? 0}</p>
              <p className="import-stat-label">{label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Error details */}
      {Array.isArray(error_summary) && error_summary.length > 0 && (
        <div className="import-summary-errors">
          <div className="import-summary-err-header">
            <AlertTriangle size={13} />
            <span>Row errors (first {error_summary.length})</span>
          </div>
          <div className="import-summary-err-list">
            {error_summary.slice(0, 10).map((err, i) => (
              <div key={i} className="import-summary-err-row">
                <span className="import-err-row-num">Row {err.row_index}</span>
                <span className="import-err-msg">{err.error}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="import-summary-actions">
        <button className="btn-secondary" onClick={onDone}>
          Import Another File
        </button>
        <button className="btn-primary" onClick={onViewDashboard}>
          View Dashboard
        </button>
      </div>
    </div>
  );
}
