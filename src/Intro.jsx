import { useEffect, useRef } from "react";

function Moses() {
  return <svg className="intro-moses-art" viewBox="0 0 400 620" aria-hidden="true">
    <defs>
      <linearGradient id="moses-robe" x1="0" x2="1"><stop stopColor="#06131d" /><stop offset=".55" stopColor="#1d3540" /><stop offset="1" stopColor="#091a26" /></linearGradient>
      <linearGradient id="moses-rim" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#f6deb3" /><stop offset="1" stopColor="#7a8e8b" /></linearGradient>
    </defs>
    {/* A single flowing silhouette avoids disconnected, rotating body parts. */}
    <path d="M174 222Q153 232 153 273L151 344Q153 390 140 455L107 599Q151 611 192 600L222 607 287 598Q253 509 248 449L242 339 239 276Q236 240 219 225Z" fill="url(#moses-robe)" stroke="#b2ad8a" strokeWidth="1.4" />
    <path d="M153 244Q173 262 195 275L167 421 141 559M214 269L228 443 259 584M195 302L185 547M157 579Q197 566 237 588" fill="none" stroke="#648080" strokeOpacity=".44" strokeWidth="2" />
    <path d="M168 242Q156 193 165 174 179 152 204 160 229 161 233 186L225 227 214 247 191 265Z" fill="#142c37" stroke="url(#moses-rim)" strokeWidth="1.5" />
    <path d="M178 184Q194 172 212 185L216 204 223 214 212 219 209 235 193 242 181 227Z" fill="#947b5f" />
    <path d="M176 208Q184 226 197 222L212 215Q218 249 196 267 177 252 176 208Z" fill="#c5c3af" />
    <path d="M174 208Q169 188 181 178L197 173Q171 167 166 186L166 218Z" fill="#b1b4a5" />
    <path d="M141 264Q106 266 82 239L58 220 49 230 65 252 112 302 143 309" fill="url(#moses-robe)" stroke="#b2ad8a" strokeWidth="1.4" />
    <path d="M59 222L47 207 43 191Q39 185 36 191L37 210 27 203Q18 197 22 207L36 225 49 232Z" fill="#a98d6c" />
    <g className="intro-raised-arm">
      <path d="M227 251Q257 230 271 202L284 177 301 184 290 222Q276 266 249 287" fill="url(#moses-robe)" stroke="#c9ba96" strokeWidth="1.4" />
      <path d="M291 180L293 162Q301 154 309 164L310 182 300 192Z" fill="#b49a77" />
      <path d="M306 573L306 48Q306 23 318 26Q331 29 321 44" fill="none" stroke="#d7bf8a" strokeWidth="6" strokeLinecap="round" />
      <circle className="intro-staff-light" cx="314" cy="30" r="8" fill="#fff1c4" />
    </g>
    <path d="M110 601Q193 613 285 601" fill="none" stroke="#e6cd9f" strokeOpacity=".5" />
  </svg>;
}

function SeaHalf({ side }) {
  return <div className={`intro-sea-half intro-sea-${side}`} aria-hidden="true">
    <svg viewBox="0 0 700 600" preserveAspectRatio="none">
      <defs><linearGradient id={`sea-${side}`} x2="0" y2="1"><stop stopColor="#559eaf" /><stop offset=".22" stopColor="#165674" /><stop offset="1" stopColor="#041c30" /></linearGradient></defs>
      <path d="M0 70Q90 25 180 66T350 53 530 42 700 35V600H0Z" fill={`url(#sea-${side})`} />
      {[110,190,290,410,530].map((y) => <path key={y} d={`M-30 ${y}Q130 ${y-45} 310 ${y}T740 ${y-12}`} fill="none" stroke="#92d0d6" strokeOpacity={y<200 ? .25 : .1} strokeWidth="2" />)}
      <path d="M694 37Q653 150 681 260T672 460L695 600" fill="none" stroke="#c0e6dd" strokeOpacity=".65" strokeWidth="4" />
    </svg>
    <div className="intro-water-wall" />
  </div>;
}

export default function Intro({ onDone }) {
  const done = useRef(onDone);
  done.current = onDone;
  useEffect(() => {
    document.documentElement.classList.add("intro-active");
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const timer = setTimeout(() => done.current(), 4900);
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
    <div className="intro-dawn" aria-hidden="true" />
    <div className="intro-passage" aria-hidden="true" />
    <SeaHalf side="left" /><SeaHalf side="right" />
    <div className="intro-moses"><Moses /></div>
    <div className="intro-brand">
      <div className="intro-emblem" aria-hidden="true" />
      <p className="intro-eyebrow">A better way across</p>
      <h1>Bon Voyage<span>.</span></h1>
      <div className="intro-horizon" aria-hidden="true" />
      <p className="intro-caption">Fresh cargo. Safer oceans. Smarter voyages.</p>
    </div>
    <span className="intro-coordinate" aria-hidden="true">CHART YOUR COURSE / 01</span>
    <button type="button" className="intro-skip" autoFocus onClick={() => done.current()}>Skip intro <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M5 19 19 5M5 5h14v14" /></svg></button>
  </div>;
}
