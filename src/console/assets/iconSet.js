// The console's one icon set, drawn for AMC: a 24 px grid, 1.75 px round strokes in currentColor. icon(name) returns an
// inline <svg> string (inline because the console's content security policy loads no data: images). An icon is
// decoration: the control or line that carries it always has words or an aria-label of its own.

const DOT = (cx, cy) => `<circle cx="${cx}" cy="${cy}" r=".9" fill="currentColor" stroke="none"/>`;

const PATHS = {
  home: '<path d="M3.5 10.5 12 3.5l8.5 7V20a1 1 0 0 1-1 1H15v-6H9v6H4.5a1 1 0 0 1-1-1z"/>',
  build: '<rect x="3.5" y="13" width="7.5" height="7.5" rx="1.5"/><rect x="13" y="13" width="7.5" height="7.5" rx="1.5"/><rect x="8.25" y="3.5" width="7.5" height="7.5" rx="1.5"/>',
  run: '<circle cx="12" cy="12" r="9"/><path d="M10 8.5v7l6-3.5z"/>',
  agent: `<rect x="4.5" y="8" width="15" height="11.5" rx="3"/><path d="M12 4.5V8M9.5 16h5"/>${DOT(9.25, 12.5)}${DOT(14.75, 12.5)}`,
  approvals: '<circle cx="8" cy="8" r="3"/><path d="M2.75 19.5a5.25 5.25 0 0 1 10.5 0"/><circle cx="15.75" cy="7.5" r="2.5"/><path d="m15 17 2 2 4-4.5"/>',
  records: '<rect x="7" y="3" width="13" height="15.5" rx="2"/><path d="M4 7v12a2 2 0 0 0 2 2h10M10.5 8h6M10.5 11.5h6M10.5 15h3.5"/>',
  packs: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7M3 12.5h18"/>',
  live: '<path d="M3 12h4l2.5-6 5 12 2.5-6h4"/>',
  more: '<rect x="4" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5"/>',
  "sign-in": '<path d="M10 17l5-5-5-5M15 12H3.5M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M2.5 12h2M19.5 12h2M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/>',
  moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>',
  auto: '<circle cx="12" cy="12" r="8.5"/><path d="M12 3.5a8.5 8.5 0 0 1 0 17z" fill="currentColor"/>',
  info: `<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5"/>${DOT(12, 7.75)}`,
  help: `<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.4 2.33c-.55.22-.9.75-.9 1.34v.58"/>${DOT(12, 16.75)}`,
  plus: '<path d="M12 5v14M5 12h14"/>',
  send: '<path d="M5 12h13M13 6l6 6-6 6"/>',
  stop: '<circle cx="12" cy="12" r="9"/><rect x="9" y="9" width="6" height="6" rx="1"/>',
  steer: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="2.5"/><path d="M12 3v6.5M12 14.5V21M3 12h6.5M14.5 12H21"/>',
  restart: '<path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3M4.5 4v4h4"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  wait: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.25 2"/>',
  refused: '<circle cx="12" cy="12" r="9"/><path d="m5.7 5.7 12.6 12.6"/>',
  person: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  people: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0M15.5 4.6a3.5 3.5 0 0 1 0 6.8M18 14a6.5 6.5 0 0 1 3.5 6"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7.5a4 4 0 0 1 8 0V11"/>',
  shield: '<path d="M12 3 4.5 6v5.5c0 4.5 3.2 8.2 7.5 9.5 4.3-1.3 7.5-5 7.5-9.5V6z"/>',
  score: '<path d="M3.5 17.5a8.5 8.5 0 1 1 17 0"/><path d="m12 15.5 3.5-5"/><circle cx="12" cy="16" r="1.25"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/>',
  "chevron-left": '<path d="M15 6l-6 6 6 6"/>',
  "chevron-right": '<path d="M9 6l6 6-6 6"/>',
  "chevron-down": '<path d="M6 9l6 6 6-6"/>',
  warning: `<path d="M12 4 2.5 20h19z"/><path d="M12 10v4.5"/>${DOT(12, 17.25)}`,
  file: '<path d="M6 3h8l5 5v12a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/><path d="M14 3v5h5"/>',
  download: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
  external: '<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
  sidebar: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  // The seven Industry Pack stations.
  environment: '<path d="M5 19c0-8 5-13 14-14 0 9-5 14-13 14z"/><path d="M5 19l8-8"/>',
  health: '<path d="M12 20s-7.5-4.6-7.5-10A4.5 4.5 0 0 1 12 7a4.5 4.5 0 0 1 7.5 3c0 5.4-7.5 10-7.5 10z"/>',
  wealth: '<ellipse cx="12" cy="6" rx="7" ry="2.75"/><path d="M5 6v6c0 1.5 3.1 2.75 7 2.75S19 13.5 19 12V6M5 12v6c0 1.5 3.1 2.75 7 2.75S19 19.5 19 18v-6"/>',
  education: '<path d="M2.5 9 12 4.5 21.5 9 12 13.5z"/><path d="M6.5 11v5c3 2 8 2 11 0v-5M21.5 9v5.5"/>',
  mobility: '<path d="M4 16.5V12l2-5h12l2 5v4.5z"/><circle cx="7.5" cy="16.5" r="1.75"/><circle cx="16.5" cy="16.5" r="1.75"/><path d="M4 12h16"/>',
  technology: '<rect x="6" y="6" width="12" height="12" rx="2"/><rect x="9.5" y="9.5" width="5" height="5" rx="1"/><path d="M9 3v3M15 3v3M9 18v3M15 18v3M3 9h3M3 15h3M18 9h3M18 15h3"/>',
  governance: '<path d="M3 9.5 12 4l9 5.5M5 10.5v7.5M9.5 10.5v7.5M14.5 10.5v7.5M19 10.5v7.5M3 20.5h18"/>',
  // The four A4 stages.
  aspire: '<path d="M5.5 21V4M5.5 4H17l-2.25 4L17 12H5.5"/>',
  assemble: '<path d="M14.5 6.5a4 4 0 0 0-5.3 5.3L4 17l3 3 5.2-5.2a4 4 0 0 0 5.3-5.3l-2.5 2.5-2.5-.5-.5-2.5z"/>',
  adapt: '<path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/>',
  activate: '<path d="M12 3v8"/><path d="M6.3 7a8 8 0 1 0 11.4 0"/>'
};

/** The names icon() draws (tests check that every name the console asks for exists). */
export const ICON_NAMES = Object.freeze(Object.keys(PATHS));

/** An inline icon; an unknown name draws the info icon rather than nothing. */
export function icon(name, { size = 20, className = "icon" } = {}) {
  const body = PATHS[name] ?? PATHS.info;
  return `<svg class="${className}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor"`
    + ` stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${body}</svg>`;
}

// Spot drawings for Home's tiles and empty states: 96 x 72, the same stroke, ink at 60% and one accent part.
const PICTURES = {
  build: '<g class="pic-ink"><rect x="14" y="40" width="22" height="20" rx="3"/><rect x="40" y="40" width="22" height="20" rx="3"/><path d="M8 63h80"/></g>'
    + '<rect class="pic-accent" x="27" y="15" width="22" height="20" rx="3"/><path class="pic-accent" d="M68 24h14M75 17v14"/>',
  run: '<g class="pic-ink"><rect x="10" y="12" width="56" height="38" rx="10"/><path d="M24 50l-6 12 16-12"/><path d="M22 26h20M22 36h12"/></g>'
    + '<circle class="pic-accent" cx="70" cy="44" r="15"/><path class="pic-accent" d="M66 37.5v13l11-6.5z"/>',
  check: '<g class="pic-ink"><path d="M18 56a30 30 0 1 1 60 0"/><path d="M14 62h68"/><path d="M48 26v5M30 36l3.5 3.5M66 36l-3.5 3.5"/></g>'
    + '<path class="pic-accent" d="M48 56l14-17"/><circle class="pic-accent" cx="48" cy="56" r="4"/>',
  empty: '<g class="pic-ink"><path d="M14 30h68v28a4 4 0 0 1-4 4H18a4 4 0 0 1-4-4z"/><path d="M14 30l10-16h48l10 16"/></g>'
    + '<path class="pic-accent" d="M36 30a12 12 0 0 0 24 0"/>'
};

/** A spot drawing (decoration, hidden from screen readers); null for a name it does not draw. */
export function picture(name) {
  const body = PICTURES[name];
  return body ? `<svg class="picture" width="96" height="72" viewBox="0 0 96 72" fill="none" stroke="currentColor" stroke-width="1.75"`
    + ` stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${body}</svg>` : null;
}
