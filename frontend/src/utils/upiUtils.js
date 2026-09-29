/**
 * upiUtils.js — UPI Payment Intent Generator & Mobile Device Detection.
 * Complies strictly with the NPCI Unified Payments Interface Linking Specifications.
 */

// UPI Virtual Payment Address (VPA) validation regex:
// Must be username@bankhandle (e.g. merchant@upi, biller@okhdfcbank, electricity@sbi)
export const UPI_VPA_REGEX = /^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z0-9]{2,64}$/;

/**
 * Validate whether a string is a valid UPI VPA.
 * @param {string} upiId
 * @returns {boolean}
 */
export const isValidUpiId = (upiId) => {
  if (!upiId || typeof upiId !== 'string') return false;
  return UPI_VPA_REGEX.test(upiId.trim());
};

/**
 * Format a numeric amount to standard 2-decimal string format for UPI intents.
 * @param {number|string} amount
 * @returns {string|null}
 */
export const formatUpiAmount = (amount) => {
  const num = parseFloat(String(amount).replace(/[^0-9.-]/g, ''));
  if (isNaN(num) || num <= 0) return null;
  return num.toFixed(2);
};

/**
 * Build a valid, URL-encoded UPI payment intent URI.
 *
 * Structure:
 *   upi://pay?pa={PAYEE_UPI_ID}&pn={PAYEE_NAME}&am={AMOUNT}&cu=INR[&tn={NOTE}]
 *
 * @param {object} params
 * @param {string} params.payeeUpiId — Virtual Payment Address of payee (e.g. electricity@upi)
 * @param {string} params.payeeName — Business or Person Name (e.g. ABC Electricity Board)
 * @param {number|string} params.amount — Payable amount (e.g. 1850 or 119.18)
 * @param {string} [params.currency='INR'] — Currency code, strictly INR
 * @param {string} [params.transactionNote] — Optional transaction note
 * @returns {string}
 */
export const buildUpiUri = ({
  payeeUpiId,
  payeeName,
  amount,
  currency = 'INR',
  transactionNote = '',
}) => {
  if (!isValidUpiId(payeeUpiId)) {
    throw new Error('Invalid or missing Payee UPI ID (VPA).');
  }

  const cleanAmount = formatUpiAmount(amount);
  if (!cleanAmount) {
    throw new Error('Invalid payment amount. Amount must be greater than 0.');
  }

  const cleanCurrency = String(currency || 'INR').trim().toUpperCase();
  if (cleanCurrency !== 'INR') {
    throw new Error('Domestic UPI payments only support INR currency.');
  }

  const cleanPayee = String(payeeName || 'Merchant').trim();
  const cleanVpa = payeeUpiId.trim();

  let uri = `upi://pay?pa=${encodeURIComponent(cleanVpa)}&pn=${encodeURIComponent(cleanPayee)}&am=${encodeURIComponent(cleanAmount)}&cu=INR`;

  if (transactionNote) {
    const cleanNote = String(transactionNote).trim().slice(0, 80);
    if (cleanNote) {
      uri += `&tn=${encodeURIComponent(cleanNote)}`;
    }
  }

  return uri;
};

/**
 * Detect whether the user is browsing on a mobile device (Android/iOS) capable
 * of handling native upi:// deep links.
 * @returns {boolean}
 */
export const isMobileDevice = () => {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || navigator.vendor || window.opera || '';
  const isMobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);
  const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  return isMobileUA || (hasTouch && window.innerWidth <= 1024);
};

/**
 * Provides suggested VPAs for well-known Indian recurring billers and subscriptions
 * when no VPA has been manually configured by the user yet.
 * @param {string} merchantName
 * @returns {{ vpa: string, payeeName: string } | null}
 */
export const getSuggestedBillerDetails = (merchantName) => {
  if (!merchantName) return null;
  const name = merchantName.toLowerCase();

  if (name.includes('bescom')) return { vpa: 'bescom@upi', payeeName: 'BESCOM Bangalore Electricity' };
  if (name.includes('tneb')) return { vpa: 'tneb@upi', payeeName: 'TNEB Tamil Nadu Electricity' };
  if (name.includes('electricity') || name.includes('power')) return { vpa: 'electricity@upi', payeeName: merchantName };
  if (name.includes('airtel')) return { vpa: 'airtel.pay@icici', payeeName: 'Airtel Telecommunications' };
  if (name.includes('jio')) return { vpa: 'jio.recharge@hdfcbank', payeeName: 'Reliance Jio Infocomm' };
  if (name.includes('act') || name.includes('fibernet') || name.includes('broadband')) return { vpa: 'actfibernet@citi', payeeName: 'ACT Fibernet Broadband' };
  if (name.includes('netflix')) return { vpa: 'netflix@upi', payeeName: 'Netflix India' };
  if (name.includes('spotify')) return { vpa: 'spotify.pay@hdfcbank', payeeName: 'Spotify India' };
  if (name.includes('prime') || name.includes('amazon')) return { vpa: 'amazonprime@apl', payeeName: 'Amazon Prime India' };
  if (name.includes('water')) return { vpa: 'waterboard@upi', payeeName: merchantName };
  if (name.includes('gas') || name.includes('lpg') || name.includes('indane')) return { vpa: 'lpgpay@upi', payeeName: merchantName };

  return null;
};
