import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { formatCurrency } from '../utils/constants';

/**
 * ImportPreview — shows first 20-50 parsed rows before user confirms import.
 */
export default function ImportPreview({ rows, mapping, totalRows, onConfirm, onCancel, confirming }) {
  if (!rows || rows.length === 0) return null;

  // Build preview using the mapping to extract date/desc/amount columns
  const dateCol   = mapping.date;
  const descCol   = mapping.description;
  const amtCol    = mapping.amount || mapping.debit || mapping.credit;
  const balCol    = mapping.balance;
  const typeCol   = mapping.type;

  const getVal = (row, col) => (col && row[col] != null ? String(row[col]) : '—');

  const previewCount = Math.min(rows.length, 50);
  const showingAll = totalRows <= previewCount;

  return (
    <div className="import-preview">
      <div className="import-preview-header">
        <h3 className="import-preview-title">
          Transaction Preview
        </h3>
        <p className="import-preview-sub">
          Showing {previewCount} of {totalRows} rows.{' '}
          {!showingAll && `The remaining ${totalRows - previewCount} rows will also be imported.`}
        </p>
      </div>

      <div className="import-preview-table-wrap">
        <table className="import-preview-table">
          <thead>
            <tr>
              <th>#</th>
              {dateCol  && <th>Date</th>}
              {descCol  && <th>Description</th>}
              {amtCol   && <th>Amount</th>}
              {typeCol  && <th>Type</th>}
              {balCol   && <th>Balance</th>}
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, previewCount).map((row, i) => (
              <tr key={i}>
                <td className="preview-row-num">{i + 1}</td>
                {dateCol && <td className="preview-date">{getVal(row, dateCol)}</td>}
                {descCol && (
                  <td className="preview-desc">
                    {String(getVal(row, descCol)).slice(0, 60)}
                    {getVal(row, descCol).length > 60 ? '…' : ''}
                  </td>
                )}
                {amtCol && (
                  <td className="preview-amount">
                    {getVal(row, amtCol)}
                  </td>
                )}
                {typeCol && <td className="preview-type">{getVal(row, typeCol)}</td>}
                {balCol  && <td className="preview-balance">{getVal(row, balCol)}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {!showingAll && (
        <div className="import-preview-more">
          <AlertTriangle size={13} />
          {totalRows - previewCount} more rows not shown — they will be imported
        </div>
      )}

      <div className="import-preview-actions">
        <button className="btn-secondary" onClick={onCancel} disabled={confirming}>
          Cancel
        </button>
        <button className="btn-primary" onClick={onConfirm} disabled={confirming}>
          {confirming
            ? 'Importing…'
            : `Confirm & Import ${totalRows.toLocaleString()} Transaction${totalRows !== 1 ? 's' : ''}`}
        </button>
      </div>
    </div>
  );
}
