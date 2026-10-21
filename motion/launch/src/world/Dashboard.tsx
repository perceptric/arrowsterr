import React from 'react';
import {Img, staticFile} from 'remotion';
import {B, hit, INOUT, prog, useT} from '../lib';
import {DASH, DASH_H, DASH_W, ENGINES} from '../layout';
import {C, display, mono} from '../theme';
import {At, Card, ChevronUp, Climb, Num, SlamRing, slamStyle, Tag} from './ui';

// Weekly AI visibility after the pages go live.
const WEEKS = [0, 4, 12, 27, 44, 60];
const LIT = [0, 1, 2, 3, 4]; // every engine now recommends you, in order
const CH = {x: 430, y: 140, w: 640, h: 380};

/** A few weeks later: the dashboard shows AI visibility climbing. */
export const Dashboard: React.FC = () => {
	const t = useT();
	const [c0, c1] = B.climb;
	const appear = prog(t, B.ship + 0.4, B.ship + 0.9);
	if (appear <= 0) return null;
	const p = prog(t, c0, c1, INOUT);
	const px = (i: number) => CH.x + (i / (WEEKS.length - 1)) * CH.w;
	const py = (v: number) => CH.y + CH.h - (v / 80) * CH.h;
	const pts = WEEKS.map((v, i) => `${px(i)},${py(v)}`).join(' ');
	const len = 900;
	const endOn = prog(t, c1 - 0.05, c1 + 0.2);
	return (
		<At p={DASH} w={DASH_W} h={DASH_H} style={{opacity: Math.min(1, appear * 1.6), transformOrigin: '50% 100%', transform: `perspective(1600px) rotateX(${(1 - appear) * -72}deg)`}}>
			<Card>
				<div style={{position: 'absolute', left: 44, top: 36, right: 44, display: 'flex', alignItems: 'center', gap: 14}}>
					<Climb size={34} />
					<span style={{fontFamily: display, fontWeight: 700, fontSize: 40, color: C.inkStrong, letterSpacing: -0.5, flex: 1}}>Dashboard</span>
					<Tag kind="neutral" size={20}>
						<span style={{fontFamily: mono}}>3 weeks later</span>
					</Tag>
				</div>
				<div style={{position: 'absolute', left: 44, top: 140, display: 'flex', flexDirection: 'column', gap: 10}}>
					<span style={{fontSize: 22, color: C.ink2, fontWeight: 600}}>AI visibility</span>
					<span style={slamStyle(hit(t, B.slams[2], 8))}>
						<Num size={120}>{Math.round(60 * p)}%</Num>
					</span>
					<span style={{opacity: endOn}}>
						<Tag kind="pos" size={20} icon={<ChevronUp size={16} color={C.pos} />}>
							+60 pts
						</Tag>
					</span>
					<span style={{fontSize: 20, color: C.ink2, fontWeight: 600, marginTop: 28}}>Recommended by</span>
					<div style={{display: 'flex', gap: 12}}>
						{ENGINES.map((e, i) => {
							const k = LIT.indexOf(i);
							const on = k >= 0 ? prog(t, c0 + 0.3 + k * 0.45, c0 + 0.5 + k * 0.45) : 0;
							return (
								<Img
									key={e.name}
									src={staticFile(e.file)}
									style={{width: 44, height: 44, borderRadius: 8, objectFit: 'contain', opacity: 0.25 + 0.75 * on, filter: `grayscale(${1 - on})`}}
								/>
							);
						})}
					</div>
				</div>
				<svg style={{position: 'absolute', left: 0, top: 0, overflow: 'visible'}} width={DASH_W} height={DASH_H}>
					{[0, 20, 40, 60, 80].map((v) => (
						<g key={v}>
							<line x1={CH.x} x2={CH.x + CH.w} y1={py(v)} y2={py(v)} stroke={C.lineFaint} strokeWidth={2} />
							<text x={CH.x - 14} y={py(v) + 6} textAnchor="end" fontFamily={mono} fontSize={16} fill={C.ink3}>
								{v}%
							</text>
						</g>
					))}
					{WEEKS.map((_, i) => (
						<text key={i} x={px(i)} y={CH.y + CH.h + 34} textAnchor="middle" fontFamily={mono} fontSize={16} fill={C.ink3}>
							W{i + 1}
						</text>
					))}
					<clipPath id="dash-reveal">
						<rect x={CH.x - 20} y={CH.y - 40} width={(CH.w + 40) * p} height={CH.h + 80} />
					</clipPath>
					<g clipPath="url(#dash-reveal)">
						<polygon points={`${px(0)},${py(0)} ${pts} ${px(WEEKS.length - 1)},${py(0)}`} fill={C.signal} opacity={0.08} />
					</g>
					<polyline points={pts} fill="none" stroke={C.signal} strokeWidth={6} strokeLinejoin="round" strokeLinecap="round" strokeDasharray={len} strokeDashoffset={len * (1 - p)} pathLength={len} />
					<circle cx={px(WEEKS.length - 1)} cy={py(60)} r={12 * endOn} fill={C.spark} />
				</svg>
			</Card>
			<SlamRing p={{x: 150, y: 260}} t={t} at={B.slams[2]} color={C.signal} size={0.8} />
		</At>
	);
};
