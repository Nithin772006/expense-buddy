import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Upload, History, CheckCircle2, AlertCircle, ChevronDown,
  FileText, RefreshCw, Table, FileSpreadsheet, FileScan,
} from 'lucide-react';
import Card from '../components/Card';
import DropZone from '../components/DropZone';
import ColumnMapper from '../components/ColumnMapper';
import ImportPreview from '../components/ImportPreview';
import ImportSummary from '../components/ImportSummary';
import Spinner from '../components/Spinner';
import { supabase } from '../lib/supabaseClient';
import { parseFile, parseExcelSheet, confirmImport, getImportHistory } from '../services/importApi';

// ── Stages ────────────────────────────────────────────────────────────────
const STAGE = {
  UPLOAD:   'upload',
  MAPPING:  'mapping',
  PREVIEW:  'preview',
  IMPORTING:'importing',
  DONE:     'done',
};

// ── Format icon map ────────────────────────────────────────────────────────
function FileIcon({ source }) {
  if (source === 'pdf')   return <FileScan  size={14} />;
  if (source === 'excel') return <FileSpreadsheet size={14} />;
  return <Table size={14} />;
}

function formatDate(iso) {
  return new Date(iso).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function extractErrorMessage(err, defaultMsg) {
  const detail = err?.response?.data?.detail;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) return detail.map(d => d.msg || JSON.stringify(d)).join(', ');
  if (detail && typeof detail === 'object') return JSON.stringify(detail);
  return err?.message || defaultMsg;
}

// ── Main Page ─────────────────────────────────────────────────────────────
export default function ImportTransactions() {
  const navigate = useNavigate();
  const [userId, setUserId]     = useState(null);

  // File + parse state
  const [file, setFile]               = useState(null);
  const [parseResult, setParseResult] = useState(null);
  const [selectedSheet, setSelectedSheet] = useState(null);
  const [mapping, setMapping]         = useState(null);

  // Import state
  const [stage, setStage]             = useState(STAGE.UPLOAD);
  const [parseError, setParseError]   = useState('');
  const [parsing, setParsing]         = useState(false);
  const [confirming, setConfirming]   = useState(false);
  const [importSummary, setImportSummary] = useState(null);
  const [progress, setProgress]       = useState(0);

  // Import history
  const [history, setHistory]         = useState([]);
  const [histLoading, setHistLoading] = useState(false);

  // Get user ID
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        setUserId(user.id);
        loadHistory(user.id);
      }
    });
  }, []);

  const loadHistory = async (uid) => {
    setHistLoading(true);
    try {
      const imports = await getImportHistory(uid);
      setHistory(imports);
    } catch (e) {
      console.error('Failed to load import history:', e);
    } finally {
      setHistLoading(false);
    }
  };

  // ── Handle file selection ─────────────────────────────────────────────
  const handleFile = useCallback(async (selectedFile) => {
    setFile(selectedFile);
    setParseResult(null);
    setParseError('');
    setMapping(null);
    setStage(STAGE.UPLOAD);

    if (!selectedFile) return;

    setParsing(true);
    try {
      const result = await parseFile(selectedFile);
      setParseResult(result);
      setMapping(result.auto_mapping);
      setSelectedSheet(result.selected_sheet);

      if (result.mapping_confident) {
        setStage(STAGE.PREVIEW);
      } else {
        setStage(STAGE.MAPPING);
      }
    } catch (err) {
      setParseError(extractErrorMessage(err, 'Failed to parse file. Please check the file format and try again.'));
    } finally {
      setParsing(false);
    }
  }, []);

  // ── Sheet change (Excel) ──────────────────────────────────────────────
  const handleSheetChange = async (sheetName) => {
    if (!file) return;
    setParsing(true);
    setParseError('');
    try {
      const result = await parseExcelSheet(file, sheetName);
      setParseResult(result);
      setMapping(result.auto_mapping);
      setSelectedSheet(sheetName);
      if (result.mapping_confident) {
        setStage(STAGE.PREVIEW);
      } else {
        setStage(STAGE.MAPPING);
      }
    } catch (err) {
      setParseError(extractErrorMessage(err, 'Failed to parse sheet.'));
    } finally {
      setParsing(false);
    }
  };

  // ── Mapping confirmed ─────────────────────────────────────────────────
  const handleMappingConfirm = (confirmedMapping) => {
    setMapping(confirmedMapping);
    setStage(STAGE.PREVIEW);
  };

  // ── Import confirmed ──────────────────────────────────────────────────
  const handleImportConfirm = async () => {
    if (!userId || !parseResult || !mapping) return;
    setStage(STAGE.IMPORTING);
    setConfirming(true);
    setProgress(0);

    // Fake progress animation
    const progressInterval = setInterval(() => {
      setProgress((p) => Math.min(p + Math.random() * 8, 90));
    }, 300);

    try {
      const summary = await confirmImport({
        userId,
        rows:     parseResult.rows,
        mapping,
        source:   parseResult.source,
        filename: file.name,
        fileType: parseResult.source,
      });
      clearInterval(progressInterval);
      setProgress(100);
      setImportSummary(summary);
      setStage(STAGE.DONE);
      loadHistory(userId);
    } catch (err) {
      clearInterval(progressInterval);
      setParseError(extractErrorMessage(err, 'Import failed. Please try again.'));
      setStage(STAGE.PREVIEW);
    } finally {
      setConfirming(false);
    }
  };

  // ── Reset ─────────────────────────────────────────────────────────────
  const handleReset = () => {
    setFile(null);
    setParseResult(null);
    setParseError('');
    setMapping(null);
    setImportSummary(null);
    setProgress(0);
    setStage(STAGE.UPLOAD);
  };

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Import Transactions</h1>
          <p className="page-subtitle">
            Upload your bank statement — CSV, Excel, or PDF — and let AI classify every transaction.
          </p>
        </div>
      </div>

      <div className="import-layout">
        {/* ── Left: Import Panel ── */}
        <div className="import-main">

          {/* Upload stage */}
          {stage === STAGE.UPLOAD && (
            <Card>
              <DropZone onFile={handleFile} />

              {parsing && (
                <div className="import-parsing">
                  <Spinner />
                  <p>Parsing your file…</p>
                </div>
              )}

              {parseError && (
                <div className="import-error">
                  <AlertCircle size={15} />
                  <span>{parseError}</span>
                </div>
              )}

              {/* Sheet selector (Excel multi-sheet) */}
              {parseResult?.sheet_names?.length > 1 && (
                <div className="sheet-selector">
                  <label className="sheet-selector-label">
                    <FileSpreadsheet size={14} /> Select Sheet
                  </label>
                  <div className="sheet-selector-wrap">
                    <select
                      className="sheet-selector-select"
                      value={selectedSheet || ''}
                      onChange={(e) => handleSheetChange(e.target.value)}
                    >
                      {parseResult.sheet_names.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                    <ChevronDown size={14} />
                  </div>
                </div>
              )}
            </Card>
          )}

          {/* Column mapping stage */}
          {stage === STAGE.MAPPING && parseResult && (
            <Card>
              {/* Sheet selector if Excel */}
              {parseResult.sheet_names?.length > 1 && (
                <div className="sheet-selector sheet-selector--inline">
                  <label className="sheet-selector-label">
                    <FileSpreadsheet size={14} /> Sheet:
                  </label>
                  <div className="sheet-selector-wrap">
                    <select
                      className="sheet-selector-select"
                      value={selectedSheet || ''}
                      onChange={(e) => handleSheetChange(e.target.value)}
                    >
                      {parseResult.sheet_names.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                    <ChevronDown size={14} />
                  </div>
                </div>
              )}
              <ColumnMapper
                columns={parseResult.columns}
                initialMapping={parseResult.auto_mapping}
                onConfirm={handleMappingConfirm}
              />
              <button className="btn-ghost btn-sm import-back-btn" onClick={handleReset}>
                ← Change File
              </button>
            </Card>
          )}

          {/* Preview stage */}
          {stage === STAGE.PREVIEW && parseResult && mapping && (
            <Card>
              <ImportPreview
                rows={parseResult.preview_rows}
                mapping={mapping}
                totalRows={parseResult.total_rows}
                onConfirm={handleImportConfirm}
                onCancel={handleReset}
                confirming={confirming}
              />
              {parseError && (
                <div className="import-error">
                  <AlertCircle size={15} />
                  <span>{parseError}</span>
                </div>
              )}
            </Card>
          )}

          {/* Importing progress stage */}
          {stage === STAGE.IMPORTING && (
            <Card className="import-progress-card">
              <div className="import-progress-content">
                <RefreshCw size={32} className="import-progress-icon spin" />
                <h3 className="import-progress-title">Processing Transactions</h3>
                <p className="import-progress-sub">
                  Running AI classification and anomaly detection on your transactions…
                </p>
                <div className="import-progress-bar-wrap">
                  <div
                    className="import-progress-bar"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <p className="import-progress-pct">{Math.round(progress)}%</p>
              </div>
            </Card>
          )}

          {/* Done stage */}
          {stage === STAGE.DONE && importSummary && (
            <Card>
              <ImportSummary
                summary={importSummary}
                onDone={handleReset}
                onViewDashboard={() => navigate('/')}
              />
            </Card>
          )}
        </div>

        {/* ── Right: Import History ── */}
        <div className="import-sidebar">
          <Card>
            <div className="card-title-row">
              <History size={15} />
              <h2 className="card-title">Import History</h2>
            </div>

            {histLoading ? (
              <div className="import-hist-loading"><Spinner /></div>
            ) : history.length === 0 ? (
              <p className="import-hist-empty">No imports yet.</p>
            ) : (
              <div className="import-hist-list">
                {history.map((imp) => (
                  <div key={imp.id} className="import-hist-row">
                    <div className="import-hist-icon">
                      <FileIcon source={imp.file_type} />
                    </div>
                    <div className="import-hist-info">
                      <p className="import-hist-name" title={imp.file_name}>
                        {imp.file_name.length > 28
                          ? imp.file_name.slice(0, 25) + '…'
                          : imp.file_name}
                      </p>
                      <p className="import-hist-meta">
                        {formatDate(imp.created_at)}
                      </p>
                      <div className="import-hist-stats">
                        <span className="import-hist-stat import-hist-stat--ok">
                          {imp.successful_rows ?? 0} imported
                        </span>
                        {imp.duplicate_rows > 0 && (
                          <span className="import-hist-stat import-hist-stat--dup">
                            {imp.duplicate_rows} dup
                          </span>
                        )}
                        {imp.failed_rows > 0 && (
                          <span className="import-hist-stat import-hist-stat--err">
                            {imp.failed_rows} failed
                          </span>
                        )}
                      </div>
                    </div>
                    <span className={`import-hist-badge import-hist-badge--${imp.status}`}>
                      {imp.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
