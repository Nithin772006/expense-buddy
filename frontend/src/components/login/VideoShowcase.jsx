import React, { useRef, useEffect } from 'react';
import PerimeterLight from './PerimeterLight';

/**
 * VideoShowcase
 * Right column showcase featuring the 9:16 portrait video inside a 3D rounded frame
 * with an animated perimeter light, smooth autoplay, and native poster buffering.
 */
export default function VideoShowcase() {
  const videoRef = useRef(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    // Guarantee muted property directly on DOM element for browser autoplay compliance
    video.defaultMuted = true;
    video.muted = true;

    const playVideo = () => {
      const promise = video.play();
      if (promise !== undefined) {
        promise.catch(() => {
          // If browser initially blocks, re-assert muted and retry
          video.muted = true;
          video.play().catch(() => {});
        });
      }
    };

    if (video.readyState >= 2) {
      playVideo();
    } else {
      video.addEventListener('loadeddata', playVideo, { once: true });
      video.addEventListener('canplay', playVideo, { once: true });
    }
  }, []);

  return (
    <aside className="eb-showcase-panel" aria-label="Product Showcase">
      <div className="eb-video-frame-wrapper">
        {/* Soft Ambient Glow Halo behind the frame */}
        <div className="eb-frame-ambient-glow" aria-hidden="true" />

        {/* 3D Physical Display Frame with 9:16 aspect ratio */}
        <div className="eb-video-frame">
          {/* Animated Perimeter Light Track */}
          <PerimeterLight />

          {/* Inner Highlight Reflection */}
          <div className="eb-frame-inner-highlight" aria-hidden="true" />

          {/* Video Container */}
          <div className="eb-video-container">
            <video
              ref={videoRef}
              className="eb-video-element"
              autoPlay
              muted
              loop
              playsInline
              preload="auto"
              poster="/assets/expense-buddy-poster.jpg"
            >
              <source src="/assets/expense-buddy-login-animation.mp4" type="video/mp4" />
              <source src="/assets/expense-buddy/expense-buddy-login-animation.mp4" type="video/mp4" />
              Your browser does not support HTML5 video.
            </video>
          </div>
        </div>
      </div>
    </aside>
  );
}
