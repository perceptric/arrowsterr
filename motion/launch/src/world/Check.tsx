import React from 'react';
import {Img, interpolate, random, staticFile} from 'remotion';
import {B, life, prog, roll, useT} from '../lib';
import {BEAM_FROM, CAL_A, CAL_B, COUNTER_A, COUNTER_B, ENGINES} from '../layout';
import type {Pt} from '../layout';
import {C, sans} from '../theme';
import {At, CalIcon, Card, ChevronUp, LogoTile, Num, Sparkle, Tag} from './ui';

const angleTo = (p: Pt) => Math.atan2(p.y - BEAM_FROM.y, p.x - BEAM_FROM.x);
const ENGINE_ANGLES = ENGINES.map((e) => angleTo(e.at));
const silenceDim = (t: number) => 1 - 0.7 * prog(t, B.silence[0], B.silence[0] + 0.25);

/** The radar: rings, a sweep that pings each engine, and a beam to each one. */
export const Radar: React.FC = () => {
	const t = useT();
	const show = life(t, 16.9, 24.2, 0.5, 0.8);
	if (show <= 0) return null;
	const sweepT = [17.4, ...B.pings, 22.7];
	const sweepA = [Math.PI, ...ENGINE_ANGLES.map((a) => (a < 0 ? a + 2 * Math.PI : a)), 2 * Math.PI];
	const a = interpolate(t, sweepT, sweepA, {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
	const R = 1500;
	return (
		<svg style={{position: 'absolute', left: -2000, top: -2000, overflow: 'visible'}} width={4000} height={4000} viewBox="-2000 -2000 4000 4000">
			<g opacity={show}>
				{[420, 820, 1220].map((r, i) => (
					<circle key={r} cx={BEAM_FROM.x} cy={BEAM_FROM.y} r={r * prog(t, 16.9 + i * 0.1, 17.6 + i * 0.1)} fill="none" stroke={C.lineStrong} strokeWidth={2} strokeDasharray="6 10" />
				))}
				{Array.from({length: 10}, (_, i) => {
					const aa = a - i * 0.035;
					return (
						<line
							key={i}
							x1={BEAM_FROM.x}
							y1={BEAM_FROM.y}
							x2={BEAM_FROM.x + Math.cos(aa) * R}
							y2={BEAM_FROM.y + Math.sin(aa) * R}
							stroke={C.signal}
							strokeWidth={i === 0 ? 4 : 3}
							opacity={(t > 17.4 && t < 22.9 ? 1 : 0) * (i === 0 ? 0.7 : 0.18 * (1 - i / 10))}
						/>
					);
				})}
				{ENGINES.map((e, i) => {
					const at = B.pings[i];
					const draw = prog(t, at - 0.05, at + 0.25);
					const x2 = BEAM_FROM.x + (e.at.x - BEAM_FROM.x) * draw;
					const y2 = BEAM_FROM.y + (e.at.y - BEAM_FROM.y) * draw;
					const ring = prog(t, at + 0.2, at + 0.9);
					const failed = t >= B.notMentioned;
					return (
						<g key={e.name}>
							<line x1={BEAM_FROM.x} y1={BEAM_FROM.y} x2={x2} y2={y2} stroke={failed ? C.lineStrong : C.signal} strokeWidth={4} opacity={draw > 0 ? 0.9 : 0} />
							{draw > 0 && draw < 1 ? <circle cx={x2} cy={y2} r={10} fill={C.signal} /> : null}
							<circle cx={e.at.x} cy={e.at.y} r={90 + ring * 160} fill="none" stroke={C.signal} strokeWidth={4} opacity={(1 - ring) * (ring > 0 ? 0.8 : 0)} />
						</g>
					);
				})}
			</g>
		</svg>
	);
};

export const Engines: React.FC = () => {
	const t = useT();
	return (
		<>
			{ENGINES.map((e, i) => {
				const appear = prog(t, 17.0 + i * 0.08, 17.5 + i * 0.08);
				const ping = B.pings[i];
				const lit = prog(t, ping + 0.2, ping + 0.3) * (1 - prog(t, B.notMentioned - 0.1, B.notMentioned + 0.2));
				const fail = prog(t, B.notMentioned + i * 0.06, B.notMentioned + 0.25 + i * 0.06);
				return (
					<At key={e.name} p={e.at} w={330} h={150} style={{opacity: appear * silenceDim(t), translate: `0 ${(1 - appear) * 30}px`}}>
						<Card style={{borderColor: lit > 0.5 ? C.signal : C.line, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 16, padding: '0 26px'}}>
							<div style={{display: 'flex', alignItems: 'center', gap: 16}}>
								<Img src={staticFile(e.file)} style={{width: 48, height: 48, borderRadius: 8, objectFit: 'contain'}} />
								<span style={{fontFamily: sans, fontWeight: 600, fontSize: 30, color: C.inkStrong}}>{e.name}</span>
							</div>
							<div style={{height: 34, position: 'relative'}}>
								<div style={{position: 'absolute', opacity: (1 - fail) * prog(t, ping, ping + 0.2)}}>
									<Tag kind="neutral" size={20}>
										Checking
									</Tag>
								</div>
								<div style={{position: 'absolute', opacity: fail, translate: `0 ${(1 - fail) * 12}px`}}>
									<Tag kind="neg" size={20}>
										Not mentioned
									</Tag>
								</div>
							</div>
						</Card>
					</At>
				);
			})}
		</>
	);
};

/** "AI visibility" stat: rolls down to 0% tonight, up to 60% next morning. */
export const Counter: React.FC<{v: 'A' | 'B'}> = ({v}) => {
	const t = useT();
	const isA = v === 'A';
	const p = isA ? COUNTER_A : COUNTER_B;
	const appear = isA ? prog(t, 23.4, 23.8) : prog(t, B.finalDrop + 0.1, B.finalDrop + 0.5);
	if (appear <= 0) return null;
	let value: number;
	if (isA) {
		value = t < 24 ? Math.floor(random(`c${Math.floor(t * 15)}`) * 90) : roll(t, 24, B.zero, 47, 0);
	} else {
		value = roll(t, B.finalDrop + 0.2, B.finalDrop + 1.6, 0, 60);
	}
	return (
		<At p={p} w={460} h={170} style={{opacity: appear * (isA ? silenceDim(t) : 1)}}>
			<Card style={{padding: '24px 30px', display: 'flex', flexDirection: 'column', gap: 6}}>
				<span style={{fontSize: 22, color: C.ink2, fontWeight: 500}}>AI visibility</span>
				<div style={{display: 'flex', alignItems: 'baseline', gap: 18}}>
					<Num size={78} color={C.inkStrong}>
						{value}%
					</Num>
					{!isA && t > B.finalDrop + 1.0 ? (
						<span style={{opacity: prog(t, B.finalDrop + 1.0, B.finalDrop + 1.3)}}>
							<Tag kind="pos" size={20} icon={<ChevronUp size={16} color={C.pos} />}>
								+60 pts
							</Tag>
						</span>
					) : null}
				</div>
			</Card>
		</At>
	);
};

/** "Demo booked": your competitor's tonight, yours next morning. */
export const CalCard: React.FC<{v: 'A' | 'B'}> = ({v}) => {
	const t = useT();
	const isA = v === 'A';
	const at = isA ? B.demoBookedCompetitor : B.demoBookedYou;
	const p = prog(t, at, at + 0.4);
	if (p <= 0) return null;
	const name = isA ? 'Revora' : 'tablely.com';
	return (
		<At p={isA ? CAL_A : CAL_B} w={420} h={190} style={{opacity: p * (isA ? silenceDim(t) : 1), translate: `0 ${(1 - p) * 24}px`}}>
			<Card style={{padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: 18, borderColor: isA ? C.line : C.signal}}>
				<div style={{display: 'flex', alignItems: 'center', gap: 12}}>
					<CalIcon size={28} color={isA ? C.ink2 : C.signal} />
					<span style={{fontSize: 26, fontWeight: 600, color: C.inkStrong, flex: 1}}>Demo booked</span>
					{isA ? (
						<Tag kind="neutral" size={18}>
							Booked
						</Tag>
					) : (
						<Tag kind="spark" size={18} icon={<Sparkle size={18} color={C.spark} />}>
							New
						</Tag>
					)}
				</div>
				<div style={{display: 'flex', alignItems: 'center', gap: 14}}>
					<LogoTile name={name} size={40} you={!isA} />
					<span style={{fontSize: 24, fontWeight: 500, color: C.ink, flex: 1}}>{name}</span>
					<Num size={20} color={C.ink2}>
						Thu 10:00 AM
					</Num>
				</div>
			</Card>
		</At>
	);
};
