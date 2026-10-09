// Dynamic SVG badge for Whop listings: /badge/<username>.svg
// Green VERIFIED once 100+ graded picks; grey "building" state before.
import { config } from './config.js';

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function badgeSvg({ username, graded, winPct, total }) {
  const verified = graded >= config.minGradedForBadge;
  const accent = verified ? '#22c55e' : '#6b7280';
  const bg1 = '#0b0f1a';
  const bg2 = '#131a2e';
  const line1 = verified ? '✓ VERIFIED TRACK RECORD' : '● BUILDING TRACK RECORD';
  const line2 = verified
    ? `${winPct.toFixed(1)}% · ${total} PICKS`
    : `${graded}/${config.minGradedForBadge} PICKS TO UNLOCK`;
  const sub = `${esc(config.appName)} · ${esc(username)}`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="340" height="96" viewBox="0 0 340 96" role="img" aria-label="${esc(line1)} ${esc(line2)}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${bg1}"/><stop offset="1" stop-color="${bg2}"/>
    </linearGradient>
  </defs>
  <rect x="1" y="1" width="338" height="94" rx="14" fill="url(#g)" stroke="${accent}" stroke-width="2.5"/>
  <text x="170" y="34" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="19" font-weight="bold" fill="${accent}" letter-spacing="1.5">${esc(line1)}</text>
  <text x="170" y="60" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="17" font-weight="bold" fill="#f3f4f6" letter-spacing="1">${esc(line2)}</text>
  <text x="170" y="80" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="11" fill="#9ca3af" letter-spacing="2">${sub}</text>
</svg>`;
}
