import React from 'react';
import {AbsoluteFill} from 'remotion';
import caps from './captions.json';
import {LINES} from './Kinetic';
import {OUT, prog, useT} from './lib';
import {C, sans} from './theme';

/** Subtitles: a few words at a time, the spoken word lit up. They step aside while kinetic type is on. */
export const Captions: React.FC = () => {
	const t = useT();
	if (LINES.some((l) => t >= l.from - 0.1 && t < l.to)) return null;
	const page = caps.find((p, i) => t >= p.s - 0.05 && t < Math.max(p.e + 0.25, Math.min(p.e + 0.6, caps[i + 1]?.s ?? Infinity)) && (caps[i + 1] ? t < caps[i + 1].s - 0.05 : true));
	if (!page) return null;
	const inP = prog(t, page.s - 0.05, page.s + 0.1, OUT);
	return (
		<AbsoluteFill style={{justifyContent: 'flex-end', alignItems: 'center', paddingBottom: 92, pointerEvents: 'none'}}>
			<div
				style={{
					display: 'flex',
					gap: 14,
					padding: '12px 24px',
					borderRadius: 4,
					background: C.night,
					fontFamily: sans,
					fontSize: 46,
					fontWeight: 800,
					letterSpacing: -0.8,
					lineHeight: 1.1,
					opacity: inP,
					translate: `0 ${(1 - inP) * 14}px`,
					maxWidth: 1600,
				}}
			>
				{page.words.map((w, i) => {
					const now = t >= w.s && t < w.e + 0.05;
					const said = t >= w.s;
					const pop = prog(t, w.s, w.s + 0.12, OUT);
					return (
						<span key={i} style={{color: now ? C.signalOnDark : '#fff', opacity: said ? 1 : 0.45, display: 'inline-block', scale: now ? `${1 + 0.08 * (1 - pop) + 0.04}` : '1'}}>
							{w.w}
						</span>
					);
				})}
			</div>
		</AbsoluteFill>
	);
};
