import React, { useRef, useState } from 'react';
import { UploadCloud, FileText, X } from 'lucide-react';

const ACCEPTED_TYPES = {
  'text/csv': ['.csv'],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
  'application/vnd.ms-excel': ['.xls'],
  'application/pdf': ['.pdf'],
};

const ACCEPTED_EXTS = ['.csv', '.xlsx', '.xls', '.pdf'];
const MAX_SIZE_MB = 20;

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export default function DropZone({ onFile }) {
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(null);
  const inputRef = useRef(null);

  const handleFile = (file) => {
    setError('');
    if (!file) return;

    const ext = '.' + file.name.split('.').pop().toLowerCase();
    if (!ACCEPTED_EXTS.includes(ext)) {
      setError(`Unsupported file type "${ext}". Please upload CSV, XLSX, XLS, or PDF.`);
      return;
    }
    if (file.size > MAX_SIZE_MB * 1024 * 1024) {
      setError(`File exceeds ${MAX_SIZE_MB} MB limit (${formatSize(file.size)}).`);
      return;
    }

    setSelected(file);
    onFile(file);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    handleFile(file);
  };

  const handleClear = () => {
    setSelected(null);
    setError('');
    onFile(null);
    if (inputRef.current) inputRef.current.value = '';
  };

  return (
    <div className="dropzone-wrapper">
      {/* Format badges */}
      <div className="format-badges">
        {['CSV', 'Excel (.xlsx/.xls)', 'PDF Bank Statement'].map((f) => (
          <span key={f} className="format-badge">{f}</span>
        ))}
      </div>

      {/* Drop area */}
      <div
        className={`dropzone${dragging ? ' dropzone--active' : ''}${selected ? ' dropzone--filled' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => !selected && inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && !selected && inputRef.current?.click()}
        aria-label="Upload transaction file"
      >
        <input
          ref={inputRef}
          type="file"
          accept=".csv,.xlsx,.xls,.pdf"
          className="dropzone-input"
          onChange={(e) => handleFile(e.target.files?.[0])}
          id="file-upload-input"
        />

        {selected ? (
          <div className="dropzone-selected">
            <FileText size={32} className="dropzone-file-icon" />
            <div className="dropzone-file-info">
              <p className="dropzone-filename">{selected.name}</p>
              <p className="dropzone-filesize">{formatSize(selected.size)}</p>
            </div>
            <button
              className="dropzone-clear"
              onClick={(e) => { e.stopPropagation(); handleClear(); }}
              aria-label="Remove file"
            >
              <X size={16} />
            </button>
          </div>
        ) : (
          <div className="dropzone-empty">
            <UploadCloud size={40} className="dropzone-icon" />
            <p className="dropzone-title">Drag & drop your file here</p>
            <p className="dropzone-sub">or click to browse</p>
            <div className="dropzone-hints">
              <span>Max {MAX_SIZE_MB} MB</span>
              <span>·</span>
              <span>CSV, XLSX, XLS, PDF</span>
            </div>
          </div>
        )}
      </div>

      {error && <p className="dropzone-error">{error}</p>}
    </div>
  );
}
