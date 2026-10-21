import React from 'react';
import {Img, staticFile} from 'remotion';
import {B, IN, INOUT, OUT, prog, useT} from '../lib';
import {LOGO, MARK_H} from '../layout';
import {C, MARK, sans} from '../theme';

// Proportions of the colour logo file: mark box 55.326 × 59.5 units; the wordmark
// sits 0.28 mark-heights to the right and stands 0.645 mark-heights tall.
const MARK_W = (MARK_H * 55.326) / 59.5;
const WORD_H = MARK_H * 0.645;
const WORD_W = (WORD_H * 487) / 72.75;
const GAP = MARK_H * 0.28;
// The 3D sides: stacked copies of the chevrons pushed back in depth, in deeper blues.
const DEPTH = 12;
const SIDE_OUTER = '#062C78';
const SIDE_INNER = '#2F55A8';

/** The route sweeps up into the mark: chevrons climb out, the sparkle lands, a ring goes out. */
export const LogoReveal: React.FC = () => {
	const t = useT();
	const d = B.drop;
	if (t < d - 0.1) return null;
	const spin = prog(t, d, d + 0.9, OUT);
	const spark = prog(t, d + 0.6, d + 0.9);
	const flash = prog(t, d + 0.85, d + 0.95) * (1 - prog(t, d + 0.95, d + 1.3, IN));
	const sweep = prog(t, d + 0.9, d + 1.4, INOUT);
	const ring = prog(t, d, d + 1.0, OUT);
	const ring2 = prog(t, d + 0.5, d + 1.5, OUT);
	const word = prog(t, d + 0.45, d + 1.05);
	const tag = prog(t, d + 1.0, d + 1.5);
	const leave = 1 - prog(t, B.stations[0] - 1.4, B.stations[0] - 1.0);
	const left = LOGO.x - MARK_W / 2;
	const top = LOGO.y - MARK_H;
	return (
		<>
			<svg style={{position: 'absolute', left: LOGO.x - 2000, top: LOGO.y - 2000, overflow: 'visible'}} width={4000} height={4000} viewBox="-2000 -2000 4000 4000">
				{[ring, ring2].map((r, i) => (
					<circle key={i} cx={0} cy={-MARK_H / 2} r={140 + r * (i ? 1100 : 900)} fill="none" stroke={i ? C.sky : C.signal} strokeWidth={10 * (1 - r) + 1} opacity={(r > 0 ? 1 : 0) * (1 - r) * 0.9} />
				))}
			</svg>
			{/* the mark in 3D: thick chevrons spin up out of the map and lock in, then light sweeps across */}
			<div style={{position: 'absolute', left, top, width: MARK_W, height: MARK_H, perspective: 1400}}>
				<div
					style={{
						position: 'absolute',
						inset: 0,
						transformStyle: 'preserve-3d',
						transformOrigin: '50% 100%',
						transform: `rotateY(${(1 - spin) * -100}deg) rotateX(${(1 - spin) * 35}deg) scale(${0.55 + 0.45 * spin})`,
						opacity: Math.min(1, spin * 3),
					}}
				>
					{Array.from({length: DEPTH}, (_, i) => DEPTH - i).map((i) => (
						<svg key={i} style={{position: 'absolute', inset: 0, transform: `translateZ(${-i * 3}px)`}} width={MARK_W} height={MARK_H} viewBox="4.337 3 55.326 59.5">
							<path d={MARK.outer} fill={SIDE_OUTER} />
							<path d={MARK.inner} fill={SIDE_INNER} />
						</svg>
					))}
					<svg style={{position: 'absolute', inset: 0, overflow: 'visible'}} width={MARK_W} height={MARK_H} viewBox="4.337 3 55.326 59.5">
						<defs>
							<clipPath id="mark-face">
								<path d={MARK.outer} />
								<path d={MARK.inner} />
							</clipPath>
						</defs>
						<path d={MARK.outer} fill={C.signal} />
						<path d={MARK.inner} fill={C.sky} />
						<g clipPath="url(#mark-face)">
							<rect x={-20 + sweep * 110} y={0} width={9} height={80} fill="#fff" opacity={0.55 * (sweep > 0 && sweep < 1 ? 1 : 0)} transform="skewX(-20)" />
						</g>
						<g style={{translate: `0 ${(1 - spark) * -26}px`, transformOrigin: '32px 11.6px', scale: `${1 + flash * 0.5}`}} opacity={spark}>
							<path d={MARK.sparkle} fill={C.signal} />
						</g>
					</svg>
				</div>
			</div>
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
					fontWeight: 700,
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
