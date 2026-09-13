import React from 'react';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';

/**
 * AnomalyBadge — inline badge showing anomaly or normal status.
 * Props: isAnomaly (bool)
 */
export default function AnomalyBadge({ isAnomaly }) {
  return isAnomaly ? (
    <span className="anomaly-badge anomaly-badge--warn">
      <AlertTriangle size={11} />
      Unusual
    </span>
  ) : (
    <span className="anomaly-badge anomaly-badge--ok">
      <CheckCircle2 size={11} />
      Normal
    </span>
  );
}
