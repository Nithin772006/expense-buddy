export const CLUSTER_LABELS = {
  0: { label: 'Active High Spenders', description: 'Frequent transactions with high spending volume.' },
  1: { label: 'Balanced Customers', description: 'Moderate, well-distributed spending patterns.' },
  2: { label: 'Ultra High-Value Customers', description: 'Very large transaction amounts, top-tier customers.' },
  3: { label: 'Premium High-Value Customers', description: 'High-value transactions with premium spending habits.' },
  4: { label: 'Frequent Essential Spenders', description: 'High frequency of small, essential transactions.' },
};

export const formatCurrency = (amount) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(amount);
