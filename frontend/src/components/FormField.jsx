import React from 'react';

/**
 * Reusable form field with label and input/select.
 * Props: label, name, type, value, onChange, options (for select), min, max, step, placeholder
 */
export default function FormField({ label, name, type = 'number', value, onChange, options, placeholder, min, max, step }) {
  return (
    <div className="form-field">
      <label htmlFor={name}>{label}</label>
      {type === 'select' ? (
        <select id={name} name={name} value={value} onChange={onChange}>
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      ) : (
        <input
          id={name}
          type={type}
          name={name}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          min={min}
          max={max}
          step={step ?? (type === 'number' ? 'any' : undefined)}
        />
      )}
    </div>
  );
}
