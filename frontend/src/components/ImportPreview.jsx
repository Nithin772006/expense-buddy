import React from 'react';
import { AlertTriangle, TrendingDown, TrendingUp, ArrowLeft } from 'lucide-react';
import { formatCurrency } from '../utils/constants';

/**
 * ImportPreview — shows first 20-50 parsed rows before user confirms import.
 *
 * Supports split Debit/Credit layout, signed amount display (+₹ / -₹),
 * reference numbers, and going back to modify column mapping.
 */
export default function ImportPreview({
  rows,
  mapping,
  totalRows,
  onConfirm,
  onCancel,
  onBackToMapping,
  confirming,
  ocrUsed = false,
  ocrWarning = null,
}) {
  if (!rows || rows.length === 0) return null;

  const dateCol   = mapping.date;
  const descCol   = mapping.description;
  const refCol    = mapping.reference;
  const amtCol    = mapping.amount;           // pure amount column (CSV-style)
  const debitCol  = mapping.debit;            // separate debit column
  const creditCol = mapping.credit;           // separate credit column
  const balCol    = mapping.balance;
  const typeCol   = mapping.type;

  // Whether we have a split Debit/Credit layout (bank statement style)
  const hasSplitAmounts = !amtCol && (debitCol || creditCol);

  const getVal = (row, col) => (col && row[col] != null ? String(row[col]) : '');

  const formatDisplayAmount = (raw, txType) => {
    if (!raw || raw === '—') return '—';
    const cleaned = String(raw).replace(/[₹,\sINR]/gi, '');
    const num = parseFloat(cleaned);
    if (isNaN(num)) return raw;
    const formatted = formatCurrency(Math.abs(num));
    if (txType === 'credit') return `+${formatted}`;
    if (txType === 'debit') return `-${formatted}`;
    return formatted;
  };

  /**
   * Resolve the display amount + type for a row.
   * For split Debit/Credit columns, returns whichever side is non-empty/non-zero.
   */
  const resolveAmount = (row) => {
    if (amtCol) {
      // Pure amount column
      const v = getVal(row, amtCol);
      let type = typeCol ? getVal(row, typeCol)?.toLowerCase() : null;
      if (!type && v) {
        const num = parseFloat(v.replace(/[^0-9.-]/g, ''));
        if (!isNaN(num) && num < 0) type = 'debit';
      }
      return { display: formatDisplayAmount(v, type), rawDisplay: v, txType: type };
    }

    // Split Debit / Credit columns
    const rawDebit  = getVal(row, debitCol);
    const rawCredit = getVal(row, creditCol);

    const EMPTY_VALS = new Set(['', '-', '—', '–', '0', '0.00', 'null', 'none', 'n/a']);
    const debitEmpty  = !rawDebit  || EMPTY_VALS.has(rawDebit.trim().toLowerCase());
    const creditEmpty = !rawCredit || EMPTY_VALS.has(rawCredit.trim().toLowerCase());

    if (!debitEmpty && !creditEmpty) {
      // Both populated — show debit, flag as review
      return { display: formatDisplayAmount(rawDebit, 'debit'), rawDisplay: rawDebit, txType: 'debit', review: true };
    }
    if (!debitEmpty) {
      return { display: formatDisplayAmount(rawDebit, 'debit'), rawDisplay: rawDebit, txType: 'debit' };
    }
    if (!creditEmpty) {
      return { display: formatDisplayAmount(rawCredit, 'credit'), rawDisplay: rawCredit, txType: 'credit' };
    }
    return { display: '—', rawDisplay: '—', txType: null };
  };

  const previewCount = Math.min(rows.length, 50);
  const showingAll = totalRows <= previewCount;

  const typeBadge = (txType, review) => {
    if (!txType) return null;
    const normType = String(txType).toLowerCase().trim();
    if (review) {
      return (
        <span style={{
          fontSize: '10px', fontWeight: 700, padding: '2px 7px',
          borderRadius: '999px', background: '#fef3c7', color: '#b45309',
          border: '1px solid rgba(217,119,6,0.4)',
        }}>Review</span>
      );
    }
    if (normType.includes('credit') || normType === 'cr') {
      return (
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: '3px',
          fontSize: '10px', fontWeight: 700, padding: '2px 7px',
          borderRadius: '999px', background: '#d8f3dc', color: '#1b4332',
          border: '1px solid rgba(82,183,136,0.4)',
        }}>
          <TrendingUp size={10} />Credit
        </span>
      );
    }
    return (
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: '3px',
        fontSize: '10px', fontWeight: 700, padding: '2px 7px',
        borderRadius: '999px', background: '#fde8e8', color: '#9b2335',
        border: '1px solid rgba(220,38,38,0.3)',
      }}>
        <TrendingDown size={10} />Debit
      </span>
    );
  };

  return (
    <div className="import-preview">
      <div className="import-preview-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <h3 className="import-preview-title">
            Transaction Preview
          </h3>
          {ocrUsed && (
            <span
              style={{
                fontSize: '11px',
                fontWeight: 700,
                padding: '2px 8px',
                borderRadius: '999px',
                background: '#d8f3dc',
                color: '#1b4332',
                border: '1px solid rgba(82, 183, 136, 0.4)',
              }}
            >
              AI OCR Extracted
            </span>
          )}
        </div>
        <p className="import-preview-sub">
          Showing {previewCount} of {totalRows.toLocaleString()} rows.{' '}
          {!showingAll && `The remaining ${(totalRows - previewCount).toLocaleString()} rows will also be imported.`}
        </p>
      </div>

      {ocrWarning && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            background: '#fef3c7',
            color: '#b45309',
            border: '1px solid rgba(217, 119, 6, 0.35)',
            borderRadius: '10px',
            padding: '10px 14px',
            fontSize: '13px',
            fontWeight: 500,
            marginBottom: '16px',
          }}
        >
          <AlertTriangle size={16} style={{ flexShrink: 0 }} />
          <span>{ocrWarning}</span>
        </div>
      )}

      <div className="import-preview-table-wrap">
        <table className="import-preview-table">
          <thead>
            <tr>
              <th>#</th>
              {dateCol  && <th>Date</th>}
              {descCol  && <th>Description</th>}
              {refCol   && <th>Reference No.</th>}
              {/* Amount column always shown if any amount mapping exists */}
              {(amtCol || debitCol || creditCol) && <th>Amount</th>}
              {/* Type column: always shown for split layouts, or if typeCol mapped */}
              {(hasSplitAmounts || typeCol) && <th>Type</th>}
              {balCol   && <th>Balance</th>}
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, previewCount).map((row, i) => {
              const { display, txType, review } = resolveAmount(row);
              const isCredit = String(txType).toLowerCase().includes('credit') || String(txType).toLowerCase() === 'cr';
              const isDebit  = String(txType).toLowerCase().includes('debit') || String(txType).toLowerCase() === 'dr';

              return (
                <tr key={i}>
                  <td className="preview-row-num">{i + 1}</td>
                  {dateCol && <td className="preview-date">{getVal(row, dateCol) || '—'}</td>}
                  {descCol && (
                    <td className="preview-desc" title={getVal(row, descCol)}>
                      {String(getVal(row, descCol)).slice(0, 60)}
                      {getVal(row, descCol).length > 60 ? '…' : ''}
                    </td>
                  )}
                  {refCol && (
                    <td className="preview-ref" style={{ fontSize: '12px', color: 'var(--eb-text-subtle, #688a77)' }}>
                      {getVal(row, refCol) || '—'}
                    </td>
                  )}
                  {(amtCol || debitCol || creditCol) && (
                    <td
                      className="preview-amount"
                      style={{
                        color: isCredit
                          ? 'var(--eb-emerald, #2d6a4f)'
                          : isDebit
                            ? 'var(--eb-danger, #9b2335)'
                            : undefined,
                        fontWeight: display !== '—' ? 700 : 400,
                      }}
                    >
                      {display}
                    </td>
                  )}
                  {(hasSplitAmounts || typeCol) && (
                    <td className="preview-type" style={{ whiteSpace: 'nowrap' }}>
                      {typeBadge(txType || (typeCol ? getVal(row, typeCol) : null), review)}
                    </td>
                  )}
                  {balCol && (
                    <td className="preview-balance">
                      {getVal(row, balCol) ? formatCurrency(parseFloat(getVal(row, balCol)) || 0) : '—'}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {!showingAll && (
        <div className="import-preview-more">
          <AlertTriangle size={13} />
          {(totalRows - previewCount).toLocaleString()} more rows not shown — they will also be imported.
        </div>
      )}

      <div className="import-preview-actions" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px' }}>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="btn-secondary" onClick={onCancel} disabled={confirming}>
            Cancel
          </button>
          {onBackToMapping && (
            <button className="btn-ghost btn-sm" onClick={onBackToMapping} disabled={confirming} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <ArrowLeft size={14} /> Back to Mapping
            </button>
          )}
        </div>
        <button className="btn-primary" onClick={onConfirm} disabled={confirming}>
          {confirming
            ? 'Importing…'
            : `Confirm & Import ${totalRows.toLocaleString()} Transaction${totalRows !== 1 ? 's' : ''}`}
        </button>
      </div>
    </div>
  );
}
