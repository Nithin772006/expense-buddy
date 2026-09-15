import React from 'react';

/**
 * FloatingFinanceElements
 * Renders the 3D financial ecosystem surrounding the login form:
 * Spotify, Amazon, Uber cards, Rupee coin, Spending Trend, AI Insights,
 * and 3D wallet with organic floating animations and mouse parallax offset.
 */
export default function FloatingFinanceElements({ parallaxOffset = { x: 0, y: 0 } }) {
  const { x, y } = parallaxOffset;

  return (
    <div className="eb-floating-ecosystem" aria-hidden="true">
      {/* 1. Spending Trend Chart (Top Left) */}
      <div
        className="eb-floating-item eb-item-trend float-duration-1"
        style={{
          transform: `translate3d(${x * -18}px, ${y * -18}px, 0)`,
        }}
      >
        <img
          src="/assets/expense-buddy/spending-chart.svg"
          alt=""
          className="eb-asset-img"
          width="170"
          height="105"
          loading="lazy"
        />
      </div>

      {/* 2. AI Insights Card (Top Right / Center) */}
      <div
        className="eb-floating-item eb-item-ai float-duration-2"
        style={{
          transform: `translate3d(${x * 15}px, ${y * 15}px, 0)`,
        }}
      >
        <img
          src="/assets/expense-buddy/ai-insight.svg"
          alt=""
          className="eb-asset-img"
          width="200"
          height="68"
          loading="lazy"
        />
      </div>

      {/* 3. Spotify Transaction Card (Mid Right) */}
      <div
        className="eb-floating-item eb-item-spotify float-duration-3"
        style={{
          transform: `translate3d(${x * 22}px, ${y * 22}px, 0)`,
        }}
      >
        <img
          src="/assets/expense-buddy/spotify-card.svg"
          alt=""
          className="eb-asset-img"
          width="230"
          height="72"
          loading="lazy"
        />
      </div>

      {/* 4. Amazon Shopping Card (Bottom Left) */}
      <div
        className="eb-floating-item eb-item-amazon float-duration-4"
        style={{
          transform: `translate3d(${x * -24}px, ${y * -24}px, 0)`,
        }}
      >
        <img
          src="/assets/expense-buddy/amazon-card.svg"
          alt=""
          className="eb-asset-img"
          width="230"
          height="72"
          loading="lazy"
        />
      </div>

      {/* 5. Uber Transportation Card (Bottom Right) */}
      <div
        className="eb-floating-item eb-item-uber float-duration-1"
        style={{
          transform: `translate3d(${x * 16}px, ${y * 16}px, 0)`,
        }}
      >
        <img
          src="/assets/expense-buddy/uber-card.svg"
          alt=""
          className="eb-asset-img"
          width="220"
          height="70"
          loading="lazy"
        />
      </div>

      {/* 6. Rupee Coin (Foreground Accent - Mid Left) */}
      <div
        className="eb-floating-item eb-item-coin float-duration-2"
        style={{
          transform: `translate3d(${x * -32}px, ${y * -32}px, 0) rotate(${x * 8}deg)`,
        }}
      >
        <img
          src="/assets/expense-buddy/rupee-coin.svg"
          alt=""
          className="eb-asset-img"
          width="64"
          height="64"
          loading="lazy"
        />
      </div>

      {/* 7. 3D Receipt (Bottom Center Accent) */}
      <div
        className="eb-floating-item eb-item-receipt float-duration-3"
        style={{
          transform: `translate3d(${x * -12}px, ${y * -12}px, 0) rotate(-6deg)`,
        }}
      >
        <img
          src="/assets/expense-buddy/receipt-3d.svg"
          alt=""
          className="eb-asset-img"
          width="76"
          height="98"
          loading="lazy"
        />
      </div>

      {/* 8. Shopping Bag (Far Bottom Left Accent) */}
      <div
        className="eb-floating-item eb-item-bag float-duration-4"
        style={{
          transform: `translate3d(${x * -20}px, ${y * -20}px, 0)`,
        }}
      >
        <img
          src="/assets/expense-buddy/shopping-bag.svg"
          alt=""
          className="eb-asset-img"
          width="82"
          height="82"
          loading="lazy"
        />
      </div>
    </div>
  );
}
