import React from 'react';
import {Img, staticFile} from 'remotion';
import {B, IN, OUT, prog, useT} from '../lib';
import {LOGO, MARK_H} from '../layout';
import {C, MARK, sans} from '../theme';

// Proportions of the colour logo file: mark box 55.326 × 59.5 units; the wordmark
// sits 0.28 mark-heights to the right and stands 0.645 mark-heights tall.
const MARK_W = (MARK_H * 55.326) / 59.5;
const WORD_H = MARK_H * 0.645;
const WORD_W = (WORD_H * 487) / 72.75;
const GAP = MARK_H * 0.28;

/** The route sweeps up into the mark: chevrons climb out, the sparkle lands, a ring goes out. */
export const LogoReveal: React.FC = () => {
	const t = useT();
	const d = B.drop;
	if (t < d - 0.1) return null;
	const outer = prog(t, d, d + 0.32);
	const inner = prog(t, d + 0.12, d + 0.44);
	const spark = prog(t, d + 0.26, d + 0.6);
	const flash = prog(t, d + 0.5, d + 0.62) * (1 - prog(t, d + 0.62, d + 1.0, IN));
	const ring = prog(t, d, d + 1.0, OUT);
	const ring2 = prog(t, d + 0.5, d + 1.5, OUT);
	const word = prog(t, d + 0.45, d + 1.05);
	const tag = prog(t, d + 1.0, d + 1.5);
	const leave = 1 - prog(t, B.stations[0] - 1.0, B.stations[0] - 0.6);
	const left = LOGO.x - MARK_W / 2;
	const top = LOGO.y - MARK_H;
	return (
		<>
			<svg style={{position: 'absolute', left: LOGO.x - 2000, top: LOGO.y - 2000, overflow: 'visible'}} width={4000} height={4000} viewBox="-2000 -2000 4000 4000">
				{[ring, ring2].map((r, i) => (
					<circle key={i} cx={0} cy={-MARK_H / 2} r={140 + r * (i ? 1100 : 900)} fill="none" stroke={i ? C.sky : C.signal} strokeWidth={10 * (1 - r) + 1} opacity={(r > 0 ? 1 : 0) * (1 - r) * 0.9} />
				))}
			</svg>
			<svg style={{position: 'absolute', left, top, overflow: 'visible'}} width={MARK_W} height={MARK_H} viewBox="4.337 3 55.326 59.5">
				<g style={{transformOrigin: '32px 62.5px', scale: `${0.4 + 0.6 * outer} ${outer}`}} opacity={outer}>
					<path d={MARK.outer} fill={C.signal} />
				</g>
				<g style={{transformOrigin: '32px 62.5px', scale: `${0.4 + 0.6 * inner} ${inner}`}} opacity={inner}>
					<path d={MARK.inner} fill={C.sky} />
				</g>
				<g style={{translate: `0 ${(1 - spark) * -26}px`, transformOrigin: '32px 11.6px', scale: `${1 + flash * 0.5}`}} opacity={spark}>
					<path d={MARK.sparkle} fill={C.signal} />
				</g>
			</svg>
			<div
				style={{
					position: 'absolute',
					left: LOGO.x + MARK_W / 2 + GAP,
					top: LOGO.y - WORD_H,
					width: WORD_W,
					height: WORD_H,
					clipPath: `inset(0 ${(1 - word) * 100}% 0 0)`,
					translate: `${(1 - word) * -30}px 0`,
				}}
			>
				<Img src={staticFile('brand/arrowsterr-wordmark-color.svg')} style={{width: WORD_W, height: WORD_H}} />
			</div>
			<div
				style={{
					position: 'absolute',
					left: LOCKUP_CENTER.x - 900,
					top: LOGO.y + 70,
					width: 1800,
					textAlign: 'center',
					fontFamily: sans,
					fontWeight: 600,
					fontSize: 64,
					letterSpacing: -1,
					color: C.inkStrong,
					opacity: tag * leave,
					translate: `0 ${(1 - tag) * 16}px`,
				}}
			>
				The agentic GEO platform to get <span style={{color: C.signalText}}>recommended by AI</span>
			</div>
		</>
	);
};

export const LOCKUP_CENTER = {x: LOGO.x - MARK_W / 2 + (MARK_W + GAP + WORD_W) / 2, y: LOGO.y - MARK_H / 2};
