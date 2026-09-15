import React from 'react';

/**
 * PerimeterLight
 * Continuous glowing green light particle traveling around the rounded
 * rectangular video frame along an exact SVG path with a soft luminous trail.
 */
export default function PerimeterLight() {
  return (
    <div className="perimeter-light-container" aria-hidden="true">
      <svg
        className="perimeter-light-svg"
        viewBox="0 0 360 640"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        preserveAspectRatio="none"
      >
        <defs>
          <filter id="perimeterGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="4" result="blur1" />
            <feGaussianBlur stdDeviation="8" result="blur2" />
            <feMerge>
              <feMergeNode in="blur2" />
              <feMergeNode in="blur1" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

          <linearGradient id="beamGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#40916c" stopOpacity="0" />
            <stop offset="65%" stopColor="#52b788" stopOpacity="0.6" />
            <stop offset="90%" stopColor="#95d5b2" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="1" />
          </linearGradient>
        </defs>

        {/* Static subtle border track */}
        <rect
          x="2"
          y="2"
          width="356"
          height="636"
          rx="26"
          ry="26"
          className="perimeter-track"
        />

        {/* Animated Traveling Soft Trail */}
        <rect
          x="2"
          y="2"
          width="356"
          height="636"
          rx="26"
          ry="26"
          pathLength="1000"
          className="perimeter-beam-trail"
        />

        {/* Animated Traveling Bright Head Particle */}
        <rect
          x="2"
          y="2"
          width="356"
          height="636"
          rx="26"
          ry="26"
          pathLength="1000"
          filter="url(#perimeterGlow)"
          className="perimeter-beam-head"
        />
      </svg>
    </div>
  );
}
