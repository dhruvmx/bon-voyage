import React, { useEffect, useRef, useState } from "react";

/*
 * Opening animation: the Red Sea fills the screen, Moses rises from the
 * bottom, lifts his staff, and the waters part to reveal the app.
 *
 * Phases (ms from mount):
 *   0     sea       calm sea at dusk
 *   600   rise      Moses rises from the bottom edge
 *   3200  raise     staff is lifted, light gathers
 *   4300  part      waters split left and right (onReveal fires here)
 *   7100  done      overlay unmounts (onDone fires)
 */
const TIMELINE = [
  [600, "rise"],
  [3200, "raise"],
  [4300, "part"],
];
const END = 7100;

function Moses() {
  return (
    <svg
      className="moses-svg"
      viewBox="0 0 400 640"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <radialGradient id="staff-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor="#fff6c8" stopOpacity="0.95" />
          <stop offset="0.45" stopColor="#ffd98a" stopOpacity="0.45" />
          <stop offset="1" stopColor="#ffd98a" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="robe" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#2b2a33" />
          <stop offset="1" stopColor="#111017" />
        </linearGradient>
      </defs>

      {/* Robe */}
      <path
        d="M200 150 C150 150 128 190 120 250 C108 350 92 470 74 640 L330 640 C312 470 296 350 284 250 C276 190 250 150 200 150 Z"
        fill="url(#robe)"
      />
      {/* Mantle fold */}
      <path
        d="M130 250 C170 290 230 290 270 250 L284 330 C240 360 160 360 116 330 Z"
        fill="#1c1b24"
        opacity="0.9"
      />
      {/* Left arm (resting) */}
      <path
        d="M128 245 C112 300 114 360 132 410 L158 404 C150 360 152 305 166 262 Z"
        fill="#1c1b24"
      />
      {/* Head covering */}
      <path
        d="M200 40 C158 40 140 78 142 122 C144 150 160 168 200 168 C240 168 256 150 258 122 C260 78 242 40 200 40 Z"
        fill="#24232d"
      />
      {/* Face */}
      <ellipse cx="200" cy="112" rx="34" ry="40" fill="#c99a6e" />
      {/* Beard */}
      <path
        d="M168 118 C170 168 188 196 200 202 C212 196 230 168 232 118 C222 140 210 146 200 146 C190 146 178 140 168 118 Z"
        fill="#e9e5dc"
      />
      {/* Brow and eye hints */}
      <path
        d="M178 100 q9 -5 18 0 M204 100 q9 -5 18 0"
        stroke="#3a2d22"
        strokeWidth="3"
        fill="none"
        strokeLinecap="round"
      />

      {/* Right arm + staff: the arm pivots at the shoulder, the staff
          counter-rotates at the hand so it stays upright while lifting. */}
      <g className="m-arm">
        <path
          d="M262 242 C284 290 292 340 288 396 L262 396 C264 340 258 296 246 258 Z"
          fill="#1c1b24"
        />
        <circle cx="276" cy="400" r="15" fill="#c99a6e" />
        <g className="m-staff">
          <circle className="m-glow" cx="276" cy="20" r="90" fill="url(#staff-glow)" />
          <rect x="271" y="18" width="10" height="560" rx="5" fill="#6b4a2b" />
          <path
            d="M276 18 C262 8 262 -6 276 -12 C290 -6 290 8 276 18 Z"
            fill="#6b4a2b"
          />
        </g>
      </g>
    </svg>
  );
}

export default function Intro({ onReveal, onDone }) {
  const [phase, setPhase] = useState("sea");
  const cb = useRef({ onReveal, onDone });
  cb.current = { onReveal, onDone };

  // Respect reduced-motion: skip the animation entirely.
  const reduced = useRef(
    typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches,
  );

  useEffect(() => {
    if (reduced.current) {
      cb.current.onReveal();
      cb.current.onDone();
      return;
    }
    const timers = TIMELINE.map(([ms, name]) =>
      setTimeout(() => {
        setPhase(name);
        if (name === "part") cb.current.onReveal();
      }, ms),
    );
    timers.push(setTimeout(() => cb.current.onDone(), END));
    return () => timers.forEach(clearTimeout);
  }, []);

  const skip = () => {
    cb.current.onReveal();
    cb.current.onDone();
  };

  if (reduced.current) return null;

  return (
    <div className={"intro phase-" + phase} role="presentation">
      <div className="intro-sky" />
      <div className="intro-half intro-left">
        <div className="intro-waves" />
      </div>
      <div className="intro-half intro-right">
        <div className="intro-waves" />
      </div>
      <div className="intro-flash" />
      <div className="moses">
        <Moses />
      </div>
      <div className="intro-title" aria-hidden="true">
        Bon Voyage
      </div>
      <button type="button" className="intro-skip" onClick={skip}>
        Skip
      </button>
    </div>
  );
}

