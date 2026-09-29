/**
 * recurringService.js
 * Client-side data layer for Smart Recurring Payment Detector & Reminder System.
 */

import api, {
  getRecurringPayments,
  getRecurringSummary,
  getUpcomingRecurringPayments,
  getDueRecurringPayments,
  getOverdueRecurringPayments,
  getPaymentCycleHistory,
  triggerRecurringDetection,
  confirmRecurringPayment,
  dismissRecurringPayment,
  pauseRecurringPayment,
  resumeRecurringPayment,
  markRecurringPaymentPaid,
  updateRecurringUpiConfig,
  getRecurringUpiIntent,
} from './api';

export {
  getRecurringPayments,
  getRecurringSummary,
  getUpcomingRecurringPayments,
  getDueRecurringPayments,
  getOverdueRecurringPayments,
  getPaymentCycleHistory,
  triggerRecurringDetection,
  confirmRecurringPayment,
  dismissRecurringPayment,
  pauseRecurringPayment,
  resumeRecurringPayment,
  markRecurringPaymentPaid,
  updateRecurringUpiConfig,
  getRecurringUpiIntent,
};

export default {
  getRecurringPayments,
  getRecurringSummary,
  getUpcomingRecurringPayments,
  getDueRecurringPayments,
  getOverdueRecurringPayments,
  getPaymentCycleHistory,
  triggerRecurringDetection,
  confirmRecurringPayment,
  dismissRecurringPayment,
  pauseRecurringPayment,
  resumeRecurringPayment,
  markRecurringPaymentPaid,
  updateRecurringUpiConfig,
  getRecurringUpiIntent,
};
