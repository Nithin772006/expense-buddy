import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Upload, History, CheckCircle2, AlertCircle, ChevronDown,
  FileText, RefreshCw, Table, FileSpreadsheet, FileScan,
  Lock, Eye, EyeOff, ShieldCheck,
} from 'lucide-react';
import Card from '../components/Card';
import DropZone from '../components/DropZone';
import ColumnMapper from '../components/ColumnMapper';
import ImportPreview from '../components/ImportPreview';
import ImportSummary from '../components/ImportSummary';
import Spinner from '../components/Spinner';
import { supabase } from '../lib/supabaseClient';
import { parseFile, parseExcelSheet, confirmImport, getImportHistory } from '../services/importApi';
import { invalidateUserData } from '../services/queryCache';

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

  // Password-protected PDF state
  const [needsPassword, setNeedsPassword] = useState(false);
  const [pdfPassword, setPdfPassword]     = useState('');
  const [showPassword, setShowPassword]   = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [isDecrypting, setIsDecrypting]   = useState(false);

  // Scanned PDF / OCR state
  const [ocrWarning, setOcrWarning]       = useState(null);

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
    setNeedsPassword(false);
    setPdfPassword('');
    setPasswordError('');
    setOcrWarning(null);
    setStage(STAGE.UPLOAD);

    if (!selectedFile) return;

    setParsing(true);
    try {
      const result = await parseFile(selectedFile);

      // Handle password-protected PDF
      if (result.requires_password) {
        setNeedsPassword(true);
        setParsing(false);
        return;
      }

      setParseResult(result);
      setMapping(result.auto_mapping);
      setSelectedSheet(result.selected_sheet);
      if (result.ocr_warning_message) {
        setOcrWarning(result.ocr_warning_message);
      }

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

  // ── Handle Password Unlock ────────────────────────────────────────────
  const handlePasswordSubmit = async (e) => {
    e.preventDefault();
    if (!file || !pdfPassword) return;

    setIsDecrypting(true);
    setPasswordError('');

    try {
      const result = await parseFile(file, pdfPassword);
      // Immediately clear sensitive password from state
      setPdfPassword('');
      setNeedsPassword(false);
      setParseResult(result);
      setMapping(result.auto_mapping);
      setSelectedSheet(result.selected_sheet);
      if (result.ocr_warning_message) {
        setOcrWarning(result.ocr_warning_message);
      }

      if (result.mapping_confident) {
        setStage(STAGE.PREVIEW);
      } else {
        setStage(STAGE.MAPPING);
      }
    } catch (err) {
      setPasswordError(extractErrorMessage(err, 'Incorrect PDF password. Please try again.'));
    } finally {
      setIsDecrypting(false);
    }
  };

  const handlePasswordCancel = () => {
    setPdfPassword('');
    setNeedsPassword(false);
    setPasswordError('');
    setFile(null);
    setStage(STAGE.UPLOAD);
  };

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
      invalidateUserData(userId);
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
    setNeedsPassword(false);
    setPdfPassword('');
    setPasswordError('');
    setOcrWarning(null);
    setImportSummary(null);
    setProgress(0);
    setStage(STAGE.UPLOAD);
  };

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <div className="page import-page">
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
              {!needsPassword ? (
                <>
                  <DropZone onFile={handleFile} />

                  {parsing && (
                    <div className="import-parsing" style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                      <Spinner />
                      <p style={{ color: 'var(--eb-forest, #1b4332)', fontWeight: 600 }}>
                        {file?.name?.toLowerCase()?.endsWith('.pdf')
                          ? 'Reading statement (inspecting digital text and checking for scanned tables/OCR)…'
                          : 'Parsing your file…'}
                      </p>
                    </div>
                  )}

                  {parseError && (
                    <div className="import-error" style={{ marginTop: '14px' }}>
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
                </>
              ) : (
                /* Password Prompt Card for Encrypted PDF */
                <div className="pdf-password-prompt" style={{ padding: '8px 4px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '16px' }}>
                    <div style={{ width: '42px', height: '42px', borderRadius: '12px', background: '#eaf5ee', color: '#2d6a4f', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <Lock size={22} />
                    </div>
                    <div>
                      <h3 style={{ fontSize: '17px', fontWeight: 800, color: 'var(--eb-forest, #1b4332)', margin: 0 }}>
                        Password-Protected PDF Statement
                      </h3>
                      <p style={{ fontSize: '13px', color: 'var(--eb-text-subtle, #688a77)', margin: '3px 0 0' }}>
                        This statement is encrypted by your bank. Enter the opening password to unlock and import.
                      </p>
                    </div>
                  </div>

                  {passwordError && (
                    <div className="import-error" style={{ marginBottom: '14px' }}>
                      <AlertCircle size={15} />
                      <span>{passwordError}</span>
                    </div>
                  )}

                  <form onSubmit={handlePasswordSubmit}>
                    <div style={{ marginBottom: '16px' }}>
                      <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px', color: 'var(--eb-forest, #1b4332)', marginBottom: '8px' }}>
                        Opening Password
                      </label>
                      <div style={{ position: 'relative' }}>
                        <input
                          type={showPassword ? 'text' : 'password'}
                          value={pdfPassword}
                          onChange={(e) => setPdfPassword(e.target.value)}
                          placeholder="Enter your PDF statement password"
                          autoFocus
                          disabled={isDecrypting}
                          style={{
                            width: '100%',
                            padding: '11px 44px 11px 14px',
                            borderRadius: '12px',
                            border: '1.5px solid rgba(82, 183, 136, 0.35)',
                            fontSize: '14px',
                            outline: 'none',
                            boxSizing: 'border-box',
                            background: '#ffffff',
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          style={{
                            position: 'absolute',
                            right: '12px',
                            top: '50%',
                            transform: 'translateY(-50%)',
                            background: 'transparent',
                            border: 'none',
                            cursor: 'pointer',
                            color: 'var(--eb-text-subtle, #688a77)',
                            padding: 0,
                            display: 'flex',
                            alignItems: 'center',
                          }}
                          aria-label={showPassword ? 'Hide password' : 'Show password'}
                        >
                          {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                        </button>
                      </div>
                      <p style={{ fontSize: '11.5px', color: 'var(--eb-text-subtle, #688a77)', marginTop: '8px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                        <ShieldCheck size={14} style={{ color: 'var(--eb-emerald, #2d6a4f)' }} />
                        Privacy guarantee: Your password is used in-memory only and is never stored, logged, or saved to the database.
                      </p>
                    </div>

                    <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                      <button
                        type="button"
                        className="btn-secondary btn-sm"
                        onClick={handlePasswordCancel}
                        disabled={isDecrypting}
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className="btn-primary btn-sm"
                        disabled={isDecrypting || !pdfPassword.trim()}
                      >
                        {isDecrypting ? 'Decrypting…' : 'Unlock & Import'}
                      </button>
                    </div>
                  </form>
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
                ocrUsed={parseResult.ocr_used}
                ocrWarning={ocrWarning}
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
