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
};
