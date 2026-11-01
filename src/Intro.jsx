import { useCallback, useEffect, useRef } from "react";

// Vector figure used by the opening animation.
function Moses() {
  return <svg viewBox="0 0 320 560" className="intro-moses-art" aria-hidden="true">
    <defs>
      <linearGradient id="intro-cloth" x2="1" y2="0"><stop stopColor="#142d3a" /><stop offset=".55" stopColor="#345360" /><stop offset="1" stopColor="#193644" /></linearGradient>
      <linearGradient id="intro-hair" x2="1" y2="1"><stop stopColor="#c5cfcb" /><stop offset="1" stopColor="#7e999f" /></linearGradient>
    </defs>
    <g className="intro-person-body">
      <path d="M135 196Q115 207 113 240L111 348Q110 427 88 533Q119 544 152 536Q182 547 217 533Q194 439 193 359L192 239Q188 208 170 198Z" fill="url(#intro-cloth)" stroke="#6b8992" strokeWidth="1.2" />
      <path d="M124 222Q145 245 173 232L157 345 135 507M175 254L182 408 204 525M143 297L126 468M102 528Q148 516 194 531" stroke="#71919a" strokeOpacity=".36" strokeWidth="1.5" fill="none" />
      <path d="M124 215Q104 211 84 188L59 166 51 175 77 208Q94 234 116 245" fill="url(#intro-cloth)" stroke="#6b8992" strokeWidth="1.2" />
      <path d="M60 169L51 159 47 147Q43 144 43 149L44 160 36 156Q30 153 34 160L44 172 52 178Z" fill="#a1aaa1" />
      <path d="M139 196L139 185H166L168 200" fill="#788f91" />
      <path d="M131 171Q130 146 151 143Q175 141 176 169L172 202Q160 213 150 208L133 202Z" fill="url(#intro-hair)" />
      <path d="M139 155Q144 166 140 191M149 151Q154 175 148 202M159 151Q166 172 158 205M168 160L165 196" fill="none" stroke="#e1e4d9" strokeWidth="1" strokeOpacity=".35" />
      <g className="intro-staff-arm">
        <path d="M182 214Q204 201 220 179L236 142 248 147 236 188Q219 223 196 239" fill="url(#intro-cloth)" stroke="#819ba0" strokeWidth="1.2" />
        <path d="M237 146L237 135Q242 128 249 133L252 146 245 153Z" fill="#a1aaa1" />
        <path d="M246 519L246 49Q245 27 257 29Q268 32 261 44" fill="none" stroke="#b2bbae" strokeWidth="4.5" strokeLinecap="round" />
        <path d="M238 139L247 139" stroke="#bec4b8" strokeWidth="3" strokeLinecap="round" />
      </g>
    </g>
  </svg>;
}

function SeaHalf({ side }) {
  return <div className={`intro-sea-half intro-sea-${side}`} aria-hidden="true">
    <svg viewBox="0 0 720 600" preserveAspectRatio="none">
      <defs>
        <linearGradient id={`intro-water-${side}`} x1="0" y1="0" x2="0" y2="1"><stop stopColor="#3b778c" /><stop offset=".3" stopColor="#184a63" /><stop offset="1" stopColor="#0a263a" /></linearGradient>
        <linearGradient id={`intro-edge-${side}`}><stop stopColor="#8db9c0" stopOpacity="0" /><stop offset="1" stopColor="#b6d4d2" stopOpacity=".32" /></linearGradient>
      </defs>
      <path d="M0 82Q130 42 278 65T530 50Q643 20 718 47C673 171 721 293 676 441C665 500 689 556 705 600H0Z" fill={`url(#intro-water-${side})`} />
      <path d="M635 52Q675 47 718 47C673 171 721 293 676 441C665 500 689 556 705 600H629Q654 455 641 345T635 52Z" fill={`url(#intro-edge-${side})`} />
      <g className="intro-water-flow" fill="none" stroke="#9cc9cf" strokeWidth="1.2">
        {[105,170,255,360,490].map((y, i) => <path key={y} d={`M-40 ${y}Q120 ${y-28} 280 ${y}T690 ${y-8}`} opacity={.22-i*.035} />)}
      </g>
      <path d="M718 47C673 171 721 293 676 441C665 500 689 556 705 600" fill="none" stroke="#b9d9d7" strokeOpacity=".5" strokeWidth="2" />
      <path d="M0 82Q130 42 278 65T530 50Q643 20 718 47" fill="none" stroke="#9fc9cd" strokeOpacity=".28" strokeWidth="2" />
    </svg>
  </div>;
}

export default function Intro({ onDone }) {
  const done = useRef(onDone), finished = useRef(false);
  done.current = onDone;
  const finish = useCallback(() => {
    if (finished.current) return;
    finished.current = true;
    done.current();
  }, []);
  useEffect(() => {
    document.documentElement.classList.add("intro-active");
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const timer = setTimeout(finish, 5300);
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const motionChanged = () => { if (media.matches) finish(); };
    media.addEventListener("change", motionChanged);
    return () => {
      clearTimeout(timer); media.removeEventListener("change", motionChanged);
      document.body.style.overflow = previous;
      document.documentElement.classList.remove("intro-active");
    };
  }, [finish]);

  return <div className="intro" role="dialog" aria-modal="true" aria-label="Welcome to Bon Voyage"
    onKeyDown={(event) => { if (event.key === "Escape") finish(); }}
    onAnimationEnd={(event) => {
      if (event.target === event.currentTarget && event.animationName === "intro-dismiss") finish();
    }}>
    <div className="intro-atmosphere" aria-hidden="true" />
    <div className="intro-horizon-light" aria-hidden="true" />
    <svg className="intro-seabed" viewBox="0 0 1440 600" preserveAspectRatio="none" aria-hidden="true">
      <defs><radialGradient id="intro-sand" cx=".5" cy="1" r=".85"><stop stopColor="#7f9c9e" stopOpacity=".14" /><stop offset="1" stopColor="#7f9c9e" stopOpacity="0" /></radialGradient></defs>
      <rect width="1440" height="600" fill="url(#intro-sand)" />
      <g stroke="#90adaf" strokeWidth="1" opacity=".06" fill="none"><path d="M710 70Q640 300 430 600M730 70Q800 300 1010 600M720 180V600" /></g>
    </svg>
    <SeaHalf side="left" /><SeaHalf side="right" />
    <div className="intro-moses"><Moses /></div>
    <div className="intro-brand">
      <div className="intro-emblem" aria-hidden="true" />
      <h1>Bon Voyage<span>.</span></h1>
      <div className="intro-horizon" aria-hidden="true" />
    </div>
    <button type="button" className="intro-skip" autoFocus onClick={finish}>Skip intro <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M5 19 19 5M5 5h14v14" /></svg></button>
  </div>;
}
