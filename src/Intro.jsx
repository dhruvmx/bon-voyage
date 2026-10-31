import { useEffect, useRef } from "react";
import { markIntroSeen } from "./intro";

export default function Intro({ onDone }) {
  const done = useRef(onDone);
  done.current = onDone;
  useEffect(() => {
    // Remember the visit immediately, including a refresh halfway through.
    markIntroSeen();
    document.documentElement.classList.add("intro-active");
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const timer = setTimeout(() => done.current(), 3300);
    return () => { clearTimeout(timer); document.body.style.overflow = previous; document.documentElement.classList.remove("intro-active"); };
  }, []);

  return <div className="intro" role="dialog" aria-modal="true" aria-label="Welcome to Bon Voyage"
    onAnimationEnd={(event) => {
      if (event.target === event.currentTarget && event.animationName === "intro-dismiss") done.current();
    }}>
    <div className="intro-atmosphere" aria-hidden="true" />
    <svg className="intro-chart" viewBox="0 0 1440 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <g fill="none" stroke="currentColor" strokeWidth="1">
        {[0,1,2,3,4,5].map((n) => <ellipse key={n} cx="720" cy="510" rx={240+n*85} ry={130+n*62} />)}
        <path d="M720 80V820M100 450H1340" strokeDasharray="3 12" />
        <path d="M210 690C430 720 470 380 720 450S1060 190 1240 230" strokeDasharray="5 10" />
      </g>
    </svg>
    <div className="intro-current intro-current-left" aria-hidden="true"><svg viewBox="0 0 700 1000" preserveAspectRatio="none"><path d="M0 0H700C360 200 750 370 510 560S420 860 700 1000H0Z" /></svg></div>
    <div className="intro-current intro-current-right" aria-hidden="true"><svg viewBox="0 0 700 1000" preserveAspectRatio="none"><path d="M0 0H700C360 200 750 370 510 560S420 860 700 1000H0Z" /></svg></div>
    <div className="intro-brand">
      <div className="intro-emblem" aria-hidden="true" />
      <p className="intro-eyebrow">A better way across</p>
      <h1>Bon Voyage<span>.</span></h1>
      <div className="intro-horizon" aria-hidden="true" />
      <p className="intro-caption">Fresh cargo. Safer oceans. Smarter voyages.</p>
    </div>
    <span className="intro-coordinate" aria-hidden="true">CHART YOUR COURSE / 01</span>
    <button type="button" className="intro-skip" autoFocus onClick={() => done.current()}>Skip intro <span aria-hidden="true">↗</span></button>
  </div>;
}
