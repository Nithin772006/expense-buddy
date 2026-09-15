import React from 'react';

/**
 * LoginBrand
 * 3D Expense Buddy logo with rounded wallet mark, dual-tone typography,
 * and the brand tagline "Smarter Spending. Brighter Future."
 */
export default function LoginBrand() {
  return (
    <header className="eb-brand-header">
      <div className="eb-brand-lockup">
        {/* 3D Wallet Icon Mark */}
        <div className="eb-brand-icon-wrapper" aria-hidden="true">
          <img
            src="/assets/expense-buddy/wallet-3d.svg"
            alt=""
            className="eb-brand-icon"
            width="44"
            height="44"
          />
        </div>

        <div className="eb-brand-text">
          <div className="eb-brand-title">
            <span className="eb-brand-word-expense">Expense</span>
            <span className="eb-brand-word-buddy">Buddy</span>
          </div>
          <p className="eb-brand-tagline">Smarter Spending. Brighter Future.</p>
        </div>
      </div>
    </header>
  );
}
