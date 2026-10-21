import React from 'react';
import {AbsoluteFill, Img, staticFile} from 'remotion';
import {B, hit, INOUT, prog, useT} from './lib';
import {C, MARK, display, mono, sans} from './theme';

const NOTCH = 12;
// Slope of the chevron's edges in the mark (rise over run).
const SLOPE = 27.44 / 18.87;

/** A giant Climb sweeps up the frame and leaves the Night close behind it. */
export const Close: React.FC = () => {
	const t = useT();
	const a = B.close;
	if (t < a - 0.05) return null;
	const sweep = prog(t, a, a + 0.9, INOUT);
	const s = 61.5; // px per mark unit
	const apexY = 1900 - sweep * 5300; // screen y of the outer chevron's inner apex
	const logo = prog(t, a + 0.55, a + 0.95);
	const head = prog(t, a + 1.0, a + 1.4);
	const btn = prog(t, a + 2.3, a + 2.7);
	const url = prog(t, a + 2.6, a + 3.0);
	const far = 400;
	const strike = hit(t, B.logoStrike, 6);
	return (
		<AbsoluteFill>
			<svg width={1920} height={1080} style={{position: 'absolute', inset: 0}}>
				<g transform={`translate(${960 - 32 * s} ${apexY - 33.737 * s}) scale(${s})`}>
					<polygon points={`32,33.737 ${32 + far},${33.737 + far * SLOPE} ${32 - far},${33.737 + far * SLOPE}`} fill={C.night} />
					<path d={MARK.outer} fill={C.signal} />
					<path d={MARK.inner} fill={C.sky} />
				</g>
			</svg>
			{/* the logo strikes on the final chord: a flash and two rings */}
			{t >= B.logoStrike ? (
				<svg width={1920} height={1080} style={{position: 'absolute', inset: 0}}>
					{[0, 0.15].map((d, i) => {
						const r = Math.min(1, Math.max(0, (t - B.logoStrike - d) / 1.2));
						const e = 1 - Math.pow(1 - r, 3);
						return r > 0 && r < 1 ? <circle key={i} cx={960} cy={366} r={120 + e * 900} fill="none" stroke={i ? C.sky : '#fff'} strokeWidth={14 * (1 - e) + 1} opacity={(1 - e) * 0.7} /> : null;
					})}
				</svg>
			) : null}
			<AbsoluteFill style={{background: '#fff', opacity: 0.14 * hit(t, B.logoStrike, 12)}} />
			{/* the Climb watermark, 6% white */}
			<svg width={760} height={516} viewBox="4 25 56 38" style={{position: 'absolute', right: -90, bottom: -70, opacity: 0.06 * logo}}>
				<path d={MARK.outer} fill="#fff" />
				<path d={MARK.inner} fill="#fff" />
			</svg>
			<AbsoluteFill style={{alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 44}}>
				<Img src={staticFile('brand/arrowsterr-logo-white.svg')} style={{height: 110, opacity: logo, translate: `0 ${(1 - logo) * 16}px`, scale: `${1 + 0.12 * strike}`, filter: `brightness(${1 + 0.8 * strike})`}} />
				<div style={{fontFamily: display, fontWeight: 700, fontSize: 92, color: '#fff', letterSpacing: -1.5, opacity: head, translate: `0 ${(1 - head) * 16}px`}}>
					Get recommended in <span style={{color: C.signalOnDark}}>AI answers</span>
				</div>
				<div style={{display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 26}}>
					<div
						style={{
							fontFamily: sans,
							fontWeight: 700,
							fontSize: 34,
							color: C.night,
							background: '#fff',
							padding: '22px 46px',
							borderRadius: 4,
							clipPath: `polygon(0 0, calc(100% - ${NOTCH}px) 0, 100% ${NOTCH}px, 100% 100%, 0 100%)`,
							opacity: btn,
							translate: `0 ${(1 - btn) * 16}px`,
						}}
					>
						Start free trial
					</div>
					<span style={{fontFamily: mono, fontSize: 26, color: C.onNight2, opacity: url}}>arrowsterr.com</span>
				</div>
			</AbsoluteFill>
		</AbsoluteFill>
	);
};
