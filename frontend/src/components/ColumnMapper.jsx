import React, { useState } from 'react';
import { AlertCircle, ChevronDown } from 'lucide-react';

const TARGET_FIELDS = [
  { field: 'date',           label: 'Date *',           required: true },
  { field: 'description',    label: 'Description *',    required: true },
  { field: 'amount',         label: 'Amount',           required: false },
  { field: 'debit',          label: 'Debit Amount',     required: false },
  { field: 'credit',         label: 'Credit Amount',    required: false },
  { field: 'balance',        label: 'Account Balance',  required: false },
  { field: 'type',           label: 'Transaction Type', required: false },
  { field: 'merchant',       label: 'Merchant',         required: false },
  { field: 'payment_method', label: 'Payment Method',   required: false },
];

/**
 * ColumnMapper — lets the user confirm or override the auto-detected column mapping.
 * @param {string[]} columns — list of columns from the parsed file
 * @param {object} initialMapping — auto-detected mapping {field: column | null}
 * @param {function} onConfirm — called with the final mapping object
 */
export default function ColumnMapper({ columns, initialMapping, onConfirm }) {
  const [mapping, setMapping] = useState({ ...initialMapping });

  const handleChange = (field, value) => {
    setMapping((prev) => ({ ...prev, [field]: value || null }));
  };

  const isValid = () => {
    const hasDate = !!mapping.date;
    const hasDesc = !!mapping.description;
    const hasAmount = !!(mapping.amount || mapping.debit || mapping.credit);
    return hasDate && hasDesc && hasAmount;
  };

  return (
    <div className="column-mapper">
      <div className="column-mapper-header">
        <AlertCircle size={16} className="column-mapper-icon" />
        <div>
          <h3 className="column-mapper-title">Map Your Columns</h3>
          <p className="column-mapper-sub">
            We auto-detected the column mapping below. Please verify and correct if needed.
            Fields marked * are required.
          </p>
        </div>
      </div>

      <div className="column-mapper-grid">
        {TARGET_FIELDS.map(({ field, label, required }) => (
          <div key={field} className="column-mapper-row">
            <label className="column-mapper-label" htmlFor={`map-${field}`}>
              {label}
            </label>
            <div className="column-mapper-select-wrap">
              <select
                id={`map-${field}`}
                className="column-mapper-select"
                value={mapping[field] || ''}
                onChange={(e) => handleChange(field, e.target.value)}
              >
                <option value="">— not mapped —</option>
                {columns.map((col) => (
                  <option key={col} value={col}>{col}</option>
                ))}
              </select>
              <ChevronDown size={14} className="column-mapper-chevron" />
            </div>
          </div>
        ))}
      </div>

      {!isValid() && (
        <p className="column-mapper-error">
          Please map at least: Date, Description, and one of Amount / Debit / Credit.
        </p>
      )}

      <button
        className="btn-primary"
        onClick={() => onConfirm(mapping)}
        disabled={!isValid()}
      >
        Confirm Mapping & Preview
      </button>
    </div>
  );
}
