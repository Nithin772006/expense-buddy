import React from 'react';
import { AlertTriangle } from 'lucide-react';

export default function ErrorAlert({ message }) {
  if (!message) return null;
  return (
    <div className="error-alert">
      <AlertTriangle size={16} />
      <span>{message}</span>
    </div>
  );
}
