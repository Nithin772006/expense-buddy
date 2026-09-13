import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import ProtectedRoute from './components/ProtectedRoute';
import Dashboard from './pages/Dashboard';
import AddExpense from './pages/AddExpense';
import SpendingAnalysis from './pages/SpendingAnalysis';
import Forecast from './pages/Forecast';
import RecurringPayments from './pages/RecurringPayments';
import Settings from './pages/Settings';
import ImportTransactions from './pages/ImportTransactions';
import Login from './pages/Login';
import Register from './pages/Register';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public routes — no sidebar */}
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />

        {/* Protected routes — with sidebar */}
        <Route
          path="/*"
          element={
            <ProtectedRoute>
              <div className="app-shell">
                <Sidebar />
                <main className="main-content">
                  <Routes>
                    <Route path="/"                   element={<Dashboard />} />
                    <Route path="/add-expense"        element={<AddExpense />} />
                    <Route path="/import-transactions" element={<ImportTransactions />} />
                    <Route path="/spending-analysis"  element={<SpendingAnalysis />} />
                    <Route path="/forecast"           element={<Forecast />} />
                    <Route path="/recurring-payments" element={<RecurringPayments />} />
                    <Route path="/settings"           element={<Settings />} />
                  </Routes>
                </main>
              </div>
            </ProtectedRoute>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}
