const trajectories = {
  wide: {
    viewBox: "189 134 462 653.70",
    center: "M151 209 C61 206 27 240 72 310 C136 412 298 518 409 642 C492 735 589 776 681 783 C726 786.4 768 780 794 763",
    ink: "M151 209 C61 205.7 26.5 239.8 71.6 310.3 C135.5 412.5 297.5 518.4 408.5 642.4 C491.5 735.5 589 776.6 681 783.55 C726 786.95 768.2 780.3 794 763 C767.8 779.7 726 785.85 681 782.45 C589 775.4 492.5 734.5 409.5 641.6 C298.5 517.6 136.5 411.5 72.4 309.7 C27.5 240.2 61 206.3 151 209 Z",
    gold: "M480 686 C550 745 642 776 737 774",
    goldWidth: 1.02,
  },
  compact: {
    viewBox: "11 -1 131 185.36",
    center: "M27 24 C5 21 -3 34 6 49 C23 81 80 132 119 155 C138 166 151 171 159 162",
    ink: "M27 24 C5 20.8 -3.4 34 5.65 49.2 C22.6 81.3 79.7 132.4 118.8 155.4 C137.8 166.4 151.2 171.3 159 162 C150.8 170.7 138.2 165.6 119.2 154.6 C80.3 131.6 23.4 80.7 6.35 48.8 C-2.6 34 5 21.2 27 24 Z",
    gold: "M99 136 C120 152 141 164 154 165",
    goldWidth: .8,
  },
} as const;

function Orbit({ size }: { size: keyof typeof trajectories }) {
  const art = trajectories[size];
  const clip = `login-ink-${size}`;
  return (
    <svg className={`login-orbit-${size}`} viewBox={art.viewBox} width="482" height="682" overflow="visible">
      <defs>
        <clipPath id={clip}><path d={art.ink} /></clipPath>
      </defs>
      <g fill="none" strokeLinecap="round" strokeLinejoin="round">
        <path className="login-orbit-ink" d={art.center} pathLength="1" stroke="#35495f" strokeWidth="4" clipPath={`url(#${clip})`} />
        <path className="login-orbit-gold" d={art.gold} pathLength="1" stroke="#a78040" strokeWidth={art.goldWidth} />
      </g>
    </svg>
  );
}

const photograph = "/images/login/approved-window.webp";
const rim = "M240 23 C179 23 135 39 103 65 C70 96 47 143 36 190 C26 236 25 317 28 363 C29 424 35 472 44 510 C54 557 69 583 94 605 C133 643 179 657 239 657 C299 657 347 641 381 605 C405 580 420 550 429 510 C443 452 447 379 446 306 C447 257 445 220 439 190 C428 126 402 78 357 51 C326 29 283 23 240 23 Z";

export function LoginWindow() {
  return (
    <div className="login-window" aria-hidden="true">
      <img src={photograph} width="482" height="682" fetchPriority="high" alt="" />
      <svg className="login-window-detail" viewBox="0 0 482 682" width="482" height="682" focusable="false">
        <defs>
          {/* The opening in this clip follows the rim of the original photograph. */}
          <clipPath id="login-outside-rim">
            <path clipRule="evenodd" d={`M-600 -400 H1100 V1100 H-600 Z ${rim}`} />
          </clipPath>
          <mask id="login-photo-paper" maskUnits="objectBoundingBox" maskContentUnits="objectBoundingBox" x="0" y="0" width="1" height="1">
            <path transform="scale(.002074689 .001466276)" d={rim} fill="white" stroke="white" strokeWidth="24" />
          </mask>
          <radialGradient id="login-cloud-feather">
            <stop offset="62%" stopColor="white" />
            <stop offset="100%" stopColor="white" stopOpacity="0" />
          </radialGradient>
          <mask id="login-cloud-field" maskUnits="userSpaceOnUse" x="88" y="380" width="296" height="179">
            <ellipse cx="236" cy="467" rx="146" ry="86" fill="url(#login-cloud-feather)" />
          </mask>
        </defs>
        <g clipPath="url(#login-outside-rim)">
          <g className="login-orbit-direction"><Orbit size="wide" /><Orbit size="compact" /></g>
        </g>
        <g className="login-cloud-field" mask="url(#login-cloud-field)">
          <image className="login-cloud-drift" href={photograph} width="482" height="682" />
        </g>
      </svg>
    </div>
  );
}
