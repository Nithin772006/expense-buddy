import React, { useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  FileSpreadsheet,
  FileText,
  SlidersHorizontal,
  Sparkles,
  ArrowRight,
} from 'lucide-react';

const TARGET_FIELDS = [
  { field: 'date',           label: 'Date *',           required: true },
  { field: 'value_date',     label: 'Value Date',       required: false },
  { field: 'description',    label: 'Description *',    required: true },
  { field: 'reference',      label: 'Reference No.',    required: false },
  { field: 'amount',         label: 'Amount',           required: false },
  { field: 'debit',          label: 'Debit Amount',     required: false },
  { field: 'credit',         label: 'Credit Amount',    required: false },
  { field: 'balance',        label: 'Account Balance',  required: false },
  { field: 'type',           label: 'Transaction Type', required: false },
  { field: 'merchant',       label: 'Merchant',         required: false },
  { field: 'payment_method', label: 'Payment Method',   required: false },
];

const DISPLAY_NAMES = {
  date: 'Date',
  value_date: 'Value Date',
  description: 'Description',
  reference: 'Reference',
  amount: 'Amount',
  debit: 'Debit',
  credit: 'Credit',
  balance: 'Balance',
  type: 'Transaction Type',
  merchant: 'Merchant',
  payment_method: 'Payment Method',
};

/**
 * ColumnMapper — displays auto-detected table recognition and lets the user
 * confirm or customize the column mapping before transaction preview.
 */
export default function ColumnMapper({
  columns = [],
  initialMapping = {},
  onConfirm,
  detectedTable,
  source = 'excel',
  headerRow = 1,
  confidence = 1.0,
  totalRows = 0,
  selectedSheet,
  detectionMessage,
}) {
  const [mapping, setMapping] = useState({ ...initialMapping });
  const isAutoDetected = (confidence >= 0.70) && !!(mapping.date && mapping.description && (mapping.amount || mapping.debit || mapping.credit));
  const [showManual, setShowManual] = useState(!isAutoDetected);

  const handleChange = (field, value) => {
    setMapping((prev) => ({ ...prev, [field]: value || null }));
  };

  const isValid = () => {
    const hasDate = !!mapping.date;
    const hasDesc = !!mapping.description;
    const hasAmount = !!(mapping.amount || mapping.debit || mapping.credit);
    return hasDate && hasDesc && hasAmount;
  };

  const confidencePct = Math.round((confidence || 1.0) * 100);

  // Active detected entries for the summary card
  const detectedEntries = Object.entries(mapping).filter(
    ([field, col]) => col && DISPLAY_NAMES[field]
  );

  return (
    <div className="column-mapper">
      {/* ── Auto-Detection Summary Card ── */}
      {isAutoDetected ? (
        <div
          className="detection-summary-card"
          style={{
            background: 'linear-gradient(135deg, rgba(234, 245, 238, 0.95), rgba(216, 243, 220, 0.5))',
            border: '1.5px solid rgba(82, 183, 136, 0.45)',
            borderRadius: '16px',
            padding: '20px 22px',
            marginBottom: '20px',
            boxShadow: '0 4px 18px rgba(45, 106, 79, 0.06)',
          }}
        >
          {/* Header Row */}
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', marginBottom: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div
                style={{
                  width: '38px',
                  height: '38px',
                  borderRadius: '10px',
                  background: 'var(--eb-emerald, #2d6a4f)',
                  color: '#ffffff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 2px 8px rgba(45, 106, 79, 0.25)',
                }}
              >
                <CheckCircle2 size={22} />
              </div>
              <div>
                <h3 style={{ fontSize: '16px', fontWeight: 800, color: 'var(--eb-forest, #1b4332)', margin: 0 }}>
                  ✓ {source === 'excel' ? 'Excel statement detected' : source === 'csv' ? 'CSV statement detected' : 'Statement detected'}
                </h3>
                {selectedSheet && (
                  <p style={{ fontSize: '13px', fontWeight: 600, color: 'var(--eb-emerald, #2d6a4f)', margin: '2px 0 0' }}>
                    Sheet: <strong>{selectedSheet}</strong>
                  </p>
                )}
              </div>
            </div>

            {/* Badges */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 700,
                  padding: '3px 10px',
                  borderRadius: '999px',
                  background: '#ffffff',
                  color: 'var(--eb-emerald, #2d6a4f)',
                  border: '1px solid rgba(82, 183, 136, 0.4)',
                }}
              >
                {confidencePct}% Confidence
              </span>
            </div>
          </div>

          {/* Quick Metrics */}
          <div
            style={{
              display: 'flex',
              gap: '16px',
              flexWrap: 'wrap',
              fontSize: '13px',
              color: 'var(--eb-forest, #1b4332)',
              fontWeight: 600,
              padding: '10px 14px',
              background: 'rgba(255, 255, 255, 0.8)',
              borderRadius: '10px',
              border: '1px solid rgba(82, 183, 136, 0.25)',
              marginBottom: '16px',
            }}
          >
            <span>✓ Transaction table detected automatically</span>
            <span>•</span>
            <span>✓ Header row: <strong>{headerRow}</strong></span>
            <span>•</span>
            <span>✓ <strong>{totalRows}</strong> transactions detected</span>
          </div>

          {/* Detected Columns Grid */}
          <div>
            <p style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px', color: 'var(--eb-forest, #1b4332)', marginBottom: '8px' }}>
              Detected columns:
            </p>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                gap: '8px',
              }}
            >
              {detectedEntries.map(([field, colName]) => (
                <div
                  key={field}
                  style={{
                    background: '#ffffff',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    border: '1px solid rgba(82, 183, 136, 0.3)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    fontSize: '12.5px',
                  }}
                >
                  <span style={{ color: 'var(--eb-text-subtle, #688a77)', fontWeight: 600 }}>
                    {DISPLAY_NAMES[field] || field}
                  </span>
                  <span style={{ fontWeight: 700, color: 'var(--eb-forest, #1b4332)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <span style={{ color: 'var(--eb-emerald, #2d6a4f)' }}>→</span> {colName}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        /* Low confidence / fallback header */
        <div className="column-mapper-header">
          <AlertCircle size={18} className="column-mapper-icon" />
          <div>
            <h3 className="column-mapper-title">Map Your Columns</h3>
            <p className="column-mapper-sub">
              {detectionMessage ||
                'Please verify or map your statement columns below. Fields marked * are required.'}
            </p>
          </div>
        </div>
      )}

      {/* ── Toggle to customize manual mappings ── */}
      {isAutoDetected && (
        <div style={{ marginBottom: '16px' }}>
          <button
            type="button"
            className="btn-ghost btn-sm"
            onClick={() => setShowManual(!showManual)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              color: 'var(--eb-emerald, #2d6a4f)',
              fontWeight: 600,
              fontSize: '13px',
              padding: '4px 8px',
            }}
          >
            <SlidersHorizontal size={14} />
            {showManual ? 'Hide manual column overrides' : 'Customize or override column mappings'}
            {showManual ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        </div>
      )}

      {/* ── Full Column Mapping Dropdown Grid ── */}
      {showManual && (
        <div
          className="column-mapper-grid"
          style={{
            background: 'var(--eb-surface, #ffffff)',
            padding: '16px',
            borderRadius: '12px',
            border: '1px solid var(--eb-border, rgba(82, 183, 136, 0.2))',
            marginBottom: '18px',
          }}
        >
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
                    <option key={col} value={col}>
                      {col}
                    </option>
                  ))}
                </select>
                <ChevronDown size={14} className="column-mapper-chevron" />
              </div>
            </div>
          ))}
        </div>
      )}

      {!isValid() && (
        <p className="column-mapper-error" style={{ marginBottom: '14px' }}>
          Please map at least: Date, Description, and one of Amount / Debit / Credit.
        </p>
      )}

      {/* ── Action Buttons ── */}
      <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
        <button
          className="btn-primary"
          onClick={() => onConfirm(mapping)}
          disabled={!isValid()}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            padding: '12px 24px',
            fontSize: '14.5px',
            fontWeight: 700,
          }}
        >
          Confirm Mapping & Preview <ArrowRight size={16} />
        </button>
      </div>
    </div>
  );
}
