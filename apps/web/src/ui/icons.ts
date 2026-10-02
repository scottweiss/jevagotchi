/**
 * Hand-drawn 24px icons. Chunky strokes, a soft fill from currentColor, one
 * highlight each, so they read as little objects rather than glyphs.
 */
const wrap = (body: string, extra = ""): string =>
  `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false" ${extra}>${body}</svg>`;

const F = 'fill="currentColor" fill-opacity=".22"';

export const icons = {
  feed: wrap(`<path ${F} d="M12 8.2c-1.6-1.4-5.6-1.6-7 2-1.4 3.6.6 8.8 3.4 9.9 1.5.6 2.6-.2 3.6-.2s2.100.8 3.600.2c2.800-1.100 4.800-6.300 3.400-9.900-1.400-3.600-5.400-3.400-7-2z"/><path d="M12 8.200c0-2 .8-3.600 2.600-4.400"/><path d="M14.600 3.800c1.900-.2 3 .6 3.400 1.800-1.400.9-3 .8-3.400-1.800z" fill="currentColor" fill-opacity=".5"/><path d="M7.400 12.600c.3-1.100 1-1.800 1.900-2" stroke-width="1.500" opacity=".7"/>`),
  play: wrap(`<circle ${F} cx="12" cy="12" r="8.500"/><path d="M4.200 9.500c3.600 1 6.700 1 9.600-.5 2.600-1.300 4.400-3.300 5.500-4.800"/><path d="M4.500 15.800c3.500-1.100 6.300-.7 8.700.8 2 1.200 4.100 1.500 6.300.9"/><path d="M9 3.800c1 2.600 1.200 5.400.4 8.400" opacity=".0"/>`),
  clean: wrap(`<path ${F} d="M12 3.200c3.200 4 5.400 6.800 5.400 10a5.400 5.400 0 0 1-10.800 0c0-3.200 2.200-6 5.400-10z"/><path d="M9.300 14.200a2.900 2.900 0 0 0 2 2.600" stroke-width="1.500" opacity=".75"/><path d="M19.500 4v3M18 5.500h3" stroke-width="1.500"/><path d="M4.500 17.500v2.400M3.300 18.700h2.400" stroke-width="1.500"/>`),
  moon: wrap(`<path ${F} d="M19.500 14.600A8 8 0 0 1 9.400 4.500a8 8 0 1 0 10.100 10.100z"/><path d="M16.500 4.500v2.600M15.200 5.800h2.600" stroke-width="1.500"/>`),
  sun: wrap(`<circle ${F} cx="12" cy="12" r="4.200"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.600 5.600 7 7M17 17l1.400 1.400M5.600 18.400 7 17M17 7l1.400-1.400"/>`),
  medicine: wrap(`<g transform="rotate(-40 12 12)"><rect ${F} x="3.500" y="8" width="17" height="8" rx="4"/><path d="M12 8v8"/><path d="M6.200 10.200h2.200" stroke-width="1.500" opacity=".75"/></g>`),
  scold: wrap(`<path ${F} d="M5 4.500h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-7l-4.500 3.500V16.500H5a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2z"/><path d="M12 7.800v4"/><circle cx="12" cy="14.100" r=".6" fill="currentColor"/>`),
  mind: wrap(`<circle ${F} cx="12" cy="12" r="8.800"/><path d="M8 15.500v-3M12 15.500V8.500M16 15.500v-5" stroke-width="2.200"/>`),
  soundOn: wrap(`<path ${F} d="M4 9.500v5h3.500l4.500 3.800V5.700L7.500 9.500z"/><path d="M15.500 9a4.200 4.200 0 0 1 0 6M18 6.500a7.500 7.500 0 0 1 0 11"/>`),
  soundOff: wrap(`<path ${F} d="M4 9.500v5h3.500l4.500 3.800V5.700L7.500 9.500z"/><path d="m16 9.500 4.500 5M20.500 9.500 16 14.500"/>`),
  menu: wrap(`<circle cx="5.500" cy="12" r="1.600" fill="currentColor"/><circle cx="12" cy="12" r="1.600" fill="currentColor"/><circle cx="18.500" cy="12" r="1.600" fill="currentColor"/>`),
  close: wrap(`<path d="M6 6l12 12M18 6 6 18"/>`),
  book: wrap(`<path ${F} d="M5 4.500h10.500a3 3 0 0 1 3 3V19.500H8a3 3 0 0 1-3-3z"/><path d="M5 16.500a3 3 0 0 1 3-3h10.500"/><path d="M9.500 8h5" stroke-width="1.500"/>`),
  heart: wrap(`<path ${F} d="M12 19.500S4 14.800 4 9.200A4.100 4.100 0 0 1 12 7.500a4.100 4.100 0 0 1 8 1.700c0 5.600-8 10.300-8 10.300z"/>`),
  star: wrap(`<path ${F} d="m12 3.500 2.600 5.400 5.900.8-4.300 4.100 1 5.800-5.200-2.800-5.200 2.800 1-5.800-4.300-4.100 5.900-.8z"/>`),
  leaf: wrap(`<path ${F} d="M5 19C4 11 9 5 19 4.500c.5 9-4.500 14.500-12 14.500z"/><path d="M5 19c3-4 6-6.500 9.500-8.500"/>`),
  egg: wrap(`<path ${F} d="M12 3.500c3.600 0 6.500 5.400 6.500 9.500a6.500 6.500 0 0 1-13 0c0-4.100 2.900-9.500 6.500-9.500z"/><path d="M8.500 13.500l2 1.500 2-2 2.500 2" stroke-width="1.500"/>`),
  sparkle: wrap(`<path ${F} d="M12 3.500c.6 4.400 2.100 5.900 6.500 6.500-4.400.6-5.900 2.100-6.500 6.500-.6-4.400-2.100-5.900-6.500-6.500 4.400-.6 5.900-2.100 6.500-6.500z"/><path d="M18.500 15.500v4M16.500 17.500h4" stroke-width="1.500"/>`),
  flower: wrap(`<circle ${F} cx="12" cy="12" r="2.200"/><circle ${F} cx="12" cy="6.500" r="2.800"/><circle ${F} cx="17.200" cy="10.500" r="2.800"/><circle ${F} cx="15.200" cy="16.800" r="2.800"/><circle ${F} cx="8.800" cy="16.800" r="2.800"/><circle ${F} cx="6.800" cy="10.500" r="2.800"/>`),
  lock: wrap(`<rect ${F} x="5.500" y="10.500" width="13" height="9.500" rx="3"/><path d="M8.500 10.500V8a3.500 3.500 0 0 1 7 0v2.500"/>`),
  hat: wrap(`<path ${F} d="M6.500 19.500 12 5l5.500 14.500z"/><path d="M4.500 19.500h15"/><path d="M8.800 14.200l6.400-2.400M10.400 9.800l4-1.500" stroke-width="1.500" opacity=".7"/><circle cx="12" cy="4.200" r="1.500" fill="currentColor"/>`),
  gear: wrap(`<circle ${F} cx="12" cy="12" r="3"/><path d="M12 3.500v2.200M12 18.300v2.200M3.500 12h2.200M18.300 12h2.200M6 6l1.500 1.500M16.500 16.500 18 18M6 18l1.500-1.500M16.500 7.500 18 6"/>`),
} as const;

export type IconName = keyof typeof icons;
