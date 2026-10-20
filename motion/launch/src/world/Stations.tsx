import React from 'react';
import {random} from 'remotion';
import {B, IN, INOUT, OUT, prog, roll, tw, useT} from '../lib';
import {STATIONS, STATION_H, STATION_W} from '../layout';
import {C, display, mono, sans} from '../theme';
import {At, Card, Climb, Num, Tag} from './ui';

const Panel: React.FC<{k: number; title: string; children: React.ReactNode}> = ({k, title, children}) => {
	const t = useT();
	const a = prog(t, B.stations[k] - 0.5, B.stations[k] - 0.1);
	return (
		<At p={STATIONS[k]} w={STATION_W} h={STATION_H} style={{opacity: a, translate: `0 ${(1 - a) * 30}px`}}>
			<Card>
				<div style={{position: 'absolute', left: 44, top: 36, display: 'flex', alignItems: 'center', gap: 14}}>
					<Climb size={34} />
					<span style={{fontFamily: display, fontWeight: 600, fontSize: 40, color: C.inkStrong, letterSpacing: -0.5}}>{title}</span>
				</div>
				{children}
			</Card>
		</At>
	);
};

/** Four L-shaped corner marks: "look here". */
const Ticks: React.FC<{w: number; h: number; on: number}> = ({w, h, on}) => {
	const s = 18;
	const o = 10 + (1 - on) * 30;
	const corner = (x: number, y: number, sx: number, sy: number) => (
		<path d={`M ${x} ${y + sy * s} L ${x} ${y} L ${x + sx * s} ${y}`} fill="none" stroke={C.signalText} strokeWidth={4} />
	);
	return (
		<svg style={{position: 'absolute', left: -o, top: -o, overflow: 'visible', opacity: on}} width={w + 2 * o} height={h + 2 * o}>
			{corner(0, 0, 1, 1)}
			{corner(w + 2 * o, 0, -1, 1)}
			{corner(0, h + 2 * o, 1, -1)}
			{corner(w + 2 * o, h + 2 * o, -1, -1)}
		</svg>
	);
};

// ---------- 01 See: gap rows peel off the answers like stickers ----------

const GAPS = [
	{prompt: 'best reservation software', recs: 'Revora, Guestly'},
	{prompt: 'table booking app for cafes', recs: 'Plateful'},
	{prompt: 'online waitlist for restaurants', recs: 'Guestly'},
	{prompt: 'reservation system for small restaurants', recs: 'Revora'},
];

export const See: React.FC = () => {
	const t = useT();
	const t0 = B.stations[0];
	const tick = prog(t, t0 + 0.8, t0 + 1.2);
	return (
		<Panel k={0} title="Where AI recommends your competitors">
			<div style={{position: 'absolute', left: 44, top: 128, width: 600, display: 'flex', fontSize: 18, color: C.ink2, fontWeight: 500}}>
				<span style={{flex: 1}}>Prompt</span>
				<span style={{width: 150}}>AI recommends</span>
				<span style={{width: 150}}>You</span>
			</div>
			{GAPS.map((g, i) => {
				const show = prog(t, t0 + 0.05 + i * 0.08, t0 + 0.35 + i * 0.08);
				const peelAt = t0 + 0.75 + i * 0.32;
				const peel = prog(t, peelAt, peelAt + 0.55, INOUT);
				const lift = Math.sin(peel * Math.PI);
				const y0 = 168 + i * 92;
				const y1 = 300 + i * 60;
				return (
					<div
						key={g.prompt}
						style={{
							position: 'absolute',
							left: 44 + peel * 640,
							top: y0 + (y1 - y0) * peel - lift * 60,
							width: 600 - peel * 300,
							height: 76 - peel * 22,
							opacity: show,
							rotate: `${lift * (i % 2 ? 4 : -5)}deg`,
							display: 'flex',
							alignItems: 'center',
							gap: 12,
							padding: '0 18px',
							background: C.bg,
							border: `2px solid ${peel > 0.02 ? C.neg : C.line}`,
							borderRadius: 8,
							fontSize: 21 - peel * 3,
							color: C.ink,
							overflow: 'hidden',
						}}
					>
						<span style={{flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'}}>{g.prompt}</span>
						<span style={{width: 150 * (1 - peel), opacity: 1 - peel, whiteSpace: 'nowrap', color: C.ink2}}>{g.recs}</span>
						<span style={{width: 150 * (1 - peel), opacity: 1 - peel}}>
							<Tag kind="neg" size={16}>
								Not mentioned
							</Tag>
						</span>
						{/* the curl of a peeled sticker */}
						<div
							style={{
								position: 'absolute',
								right: 0,
								bottom: 0,
								width: 30 * lift,
								height: 30 * lift,
								background: C.bg3,
								clipPath: 'polygon(100% 0, 0 100%, 100% 100%)',
							}}
						/>
					</div>
				);
			})}
			<div style={{position: 'absolute', left: 700, top: 150, width: 290, height: 120}}>
				<Ticks w={290} h={120} on={tick} />
				<div style={{display: 'flex', alignItems: 'baseline', gap: 14, padding: '6px 18px', opacity: tick}}>
					<Num size={84}>{roll(t, t0 + 0.9, t0 + 2.5, 0, 14)}</Num>
					<span style={{fontSize: 26, color: C.ink2, fontWeight: 500}}>gaps found</span>
				</div>
			</div>
		</Panel>
	);
};

// ---------- 02 Find: a gap goes into a funnel and comes out as keywords ----------

const KEYWORDS = [
	{kw: 'restaurant reservation system', vol: '8,100'},
	{kw: 'table booking software', vol: '5,400'},
	{kw: 'online booking for restaurants', vol: '3,600'},
	{kw: 'reservation app for small restaurants', vol: '1,900'},
];

export const Find: React.FC = () => {
	const t = useT();
	const t1 = B.stations[1];
	const suck = prog(t, t1 + 0.35, t1 + 0.85, IN);
	const funnelX = 210;
	return (
		<Panel k={1} title="Keywords people search">
			{/* the gap card */}
			<div
				style={{
					position: 'absolute',
					left: 44 + suck * 40,
					top: 140 + suck * 170,
					width: 340,
					height: 74,
					opacity: prog(t, t1 - 0.1, t1 + 0.15) * (1 - prog(t, t1 + 0.7, t1 + 0.85)),
					scale: `${1 - suck * 0.75} ${1 - suck * 0.5}`,
					transformOrigin: '50% 100%',
					display: 'flex',
					alignItems: 'center',
					padding: '0 18px',
					border: `2px solid ${C.neg}`,
					borderRadius: 8,
					background: C.bg,
					fontSize: 21,
					color: C.ink,
				}}
			>
				best reservation software
			</div>
			{/* the funnel */}
			<svg style={{position: 'absolute', left: funnelX - 140, top: 300, overflow: 'visible'}} width={280} height={240}>
				<path d="M 0 0 L 280 0 L 170 150 L 170 230 L 110 230 L 110 150 Z" fill={C.signalTint} stroke={C.signal} strokeWidth={4} strokeLinejoin="round" opacity={prog(t, t1 - 0.2, t1 + 0.2)} />
			</svg>
			{/* particles stream out and re-form as rows */}
			{Array.from({length: 64}, (_, i) => {
				const row = i % 4;
				const start = t1 + 0.8 + random(`ps${i}`) * 0.7;
				const p = prog(t, start, start + 0.7, INOUT);
				if (p <= 0 || p >= 1) return null;
				const x0 = funnelX + (random(`px${i}`) - 0.5) * 40;
				const y0 = 535;
				const x1 = 470 + random(`qx${i}`) * 420;
				const y1 = 210 + row * 84 + (random(`qy${i}`) - 0.5) * 30;
				const cx = x0 + 120;
				const cy = y0 + 40;
				const x = (1 - p) * (1 - p) * x0 + 2 * (1 - p) * p * cx + p * p * x1;
				const y = (1 - p) * (1 - p) * y0 + 2 * (1 - p) * p * cy + p * p * y1;
				return <div key={i} style={{position: 'absolute', left: x, top: y, width: 9, height: 9, background: i % 3 ? C.signal : C.sky, opacity: 1 - p * 0.6}} />;
			})}
			<div style={{position: 'absolute', left: 450, top: 136, width: 550, display: 'flex', fontSize: 18, color: C.ink2, fontWeight: 500, opacity: prog(t, t1 + 0.9, t1 + 1.2)}}>
				<span style={{flex: 1}}>Keyword</span>
				<span>Searches/mo</span>
			</div>
			{KEYWORDS.map((k, i) => {
				const a = prog(t, t1 + 1.35 + i * 0.18, t1 + 1.75 + i * 0.18);
				return (
					<div
						key={k.kw}
						style={{
							position: 'absolute',
							left: 450,
							top: 176 + i * 84,
							width: 550,
							height: 70,
							display: 'flex',
							alignItems: 'center',
							padding: '0 18px',
							border: `2px solid ${C.line}`,
							borderRadius: 8,
							opacity: a,
							translate: `${(1 - a) * -24}px 0`,
							fontSize: 21,
							color: C.ink,
						}}
					>
						<span style={{flex: 1}}>{k.kw}</span>
						<Num size={22} color={C.inkStrong}>
							{k.vol}
						</Num>
					</div>
				);
			})}
		</Panel>
	);
};

// ---------- 03 Plan: topic cards sort by value and fly into the calendar ----------

const TOPICS = [
	{title: 'Best reservation software 2026', v: 2.9, day: 3},
	{title: 'Cut no-shows with deposits', v: 1.8, day: 6},
	{title: 'Table booking for cafes', v: 1.6, day: 10},
	{title: 'Reservations vs walk-ins', v: 1.1, day: 13},
	{title: 'Restaurant waitlist guide', v: 1.0, day: 17},
];
const SCRAMBLE = [3, 0, 4, 1, 2]; // where each sorted topic starts

export const Plan: React.FC = () => {
	const t = useT();
	const t2 = B.stations[2];
	const sort = prog(t, t2 + 0.45, t2 + 1.15, INOUT);
	const cell = 60;
	const gap = 6;
	const calX = 560;
	const calY = 176;
	const cellPos = (day: number) => ({x: calX + ((day - 1) % 7) * (cell + gap), y: calY + 40 + Math.floor((day - 1) / 7) * (cell + gap)});
	return (
		<Panel k={2} title="Your month, ranked by revenue">
			{/* calendar */}
			<div style={{position: 'absolute', left: calX, top: calY, display: 'flex', opacity: prog(t, t2 - 0.2, t2 + 0.2)}}>
				{['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
					<span key={i} style={{width: cell + gap, fontSize: 17, color: C.ink3, fontWeight: 500}}>
						{d}
					</span>
				))}
			</div>
			{Array.from({length: 28}, (_, i) => {
				const day = i + 1;
				const p = cellPos(day);
				const topic = TOPICS.findIndex((x) => x.day === day);
				const land = topic >= 0 ? prog(t, t2 + 1.75 + topic * 0.14, t2 + 1.9 + topic * 0.14) : 0;
				return (
					<div
						key={day}
						style={{
							position: 'absolute',
							left: p.x,
							top: p.y,
							width: cell,
							height: cell,
							borderRadius: 4,
							border: `2px solid ${land > 0.5 ? C.signal : C.line}`,
							background: land > 0.5 ? C.signalTint : C.bg,
							opacity: prog(t, t2 - 0.2 + i * 0.006, t2 + 0.2 + i * 0.006),
						}}
					>
						<span style={{position: 'absolute', left: 6, top: 4, fontFamily: mono, fontSize: 14, color: land > 0.5 ? C.signalText : C.ink3}}>{day}</span>
						{land > 0.5 ? <div style={{position: 'absolute', left: 6, right: 6, bottom: 8, height: 8, borderRadius: 2, background: C.signal}} /> : null}
					</div>
				);
			})}
			{/* topic cards */}
			{TOPICS.map((tp, i) => {
				const from = {x: 44 + (random(`tx${i}`) - 0.5) * 40, y: 150 + SCRAMBLE[i] * 76};
				const sorted = {x: 44, y: 150 + i * 76};
				const flyAt = t2 + 1.4 + i * 0.14;
				const fly = prog(t, flyAt, flyAt + 0.5, INOUT);
				const target = cellPos(tp.day);
				const x = from.x + (sorted.x - from.x) * sort + (target.x - sorted.x) * fly;
				const y = from.y + (sorted.y - from.y) * sort + (target.y - sorted.y) * fly;
				const w = 460 - (460 - cell) * fly;
				const h = 62 - (62 - cell) * fly;
				const a = prog(t, t2 + i * 0.06, t2 + 0.3 + i * 0.06);
				const tilt = (1 - sort) * (random(`tr${i}`) - 0.5) * 10;
				return (
					<div
						key={tp.title}
						style={{
							position: 'absolute',
							left: x,
							top: y,
							width: w,
							height: h,
							opacity: a * (1 - prog(t, flyAt + 0.42, flyAt + 0.52)),
							rotate: `${tilt}deg`,
							display: 'flex',
							alignItems: 'center',
							gap: 12,
							padding: `0 ${18 * (1 - fly)}px`,
							border: `2px solid ${C.signal}`,
							borderRadius: 8 - fly * 4,
							background: C.bg,
							overflow: 'hidden',
							whiteSpace: 'nowrap',
							fontSize: 20,
							color: C.ink,
						}}
					>
						<span style={{flex: 1, opacity: 1 - fly * 2}}>{tp.title}</span>
						<span style={{opacity: 1 - fly * 2}}>
							<Num size={21} color={C.signalText}>
								${tp.v.toFixed(1)}k
							</Num>
						</span>
					</div>
				);
			})}
			{/* projected revenue */}
			<div style={{position: 'absolute', left: calX, top: 470, display: 'flex', alignItems: 'baseline', gap: 16, opacity: prog(t, t2 + 2.3, t2 + 2.6)}}>
				<Num size={72} color={C.signalText}>
					${(roll(t, t2 + 2.35, t2 + 3.3, 0, 84) / 10).toFixed(1)}k/mo
				</Num>
				<span style={{fontSize: 22, color: C.ink2, fontWeight: 500}}>from search</span>
			</div>
		</Panel>
	);
};

// ---------- 04 Create: the page writes itself and scores high ----------

export const PAGE = {left: 44, top: 120, w: 520, h: 460};
const HEADLINE = 'The best reservation software for small restaurants';

const Ring: React.FC<{label: string; value: number; at: number; x: number; y: number}> = ({label, value, at, x, y}) => {
	const t = useT();
	const p = prog(t, at, at + 1.1, OUT);
	const r = 74;
	const len = 2 * Math.PI * r;
	return (
		<div style={{position: 'absolute', left: x, top: y, width: 380, display: 'flex', alignItems: 'center', gap: 26, opacity: prog(t, at - 0.3, at)}}>
			<div style={{position: 'relative', width: 180, height: 180}}>
				<svg width={180} height={180} viewBox="-90 -90 180 180" style={{rotate: '-90deg'}}>
					<circle r={r} fill="none" stroke={C.bg4} strokeWidth={16} />
					<circle r={r} fill="none" stroke={C.signal} strokeWidth={16} strokeDasharray={len} strokeDashoffset={len * (1 - (p * value) / 100)} />
				</svg>
				<div style={{position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
					<Num size={52}>{Math.round(p * value)}</Num>
				</div>
			</div>
			<span style={{fontSize: 26, color: C.ink, fontWeight: 600}}>{label}</span>
		</div>
	);
};

export const Create: React.FC = () => {
	const t = useT();
	const t3 = B.stations[3];
	const typed = Math.floor(tw(t, [t3 + 0.15, t3 + 1.0], [0, HEADLINE.length], (n) => n));
	// The page's paper leaves for the paper arrow once the fold starts.
	const pageOn = 1 - prog(t, t3 + 2.5, t3 + 2.65);
	return (
		<Panel k={3} title="Pages built for Google and AI">
			<div
				style={{
					position: 'absolute',
					left: PAGE.left,
					top: PAGE.top,
					width: PAGE.w,
					height: PAGE.h,
					border: `2px solid ${C.lineStrong}`,
					borderRadius: 8,
					padding: 28,
					opacity: pageOn,
					overflow: 'hidden',
				}}
			>
				<div style={{fontFamily: display, fontSize: 30, fontWeight: 600, color: C.inkStrong, lineHeight: 1.15, height: 112}}>
					{HEADLINE.slice(0, typed)}
					<span style={{opacity: typed < HEADLINE.length ? 1 : 0, color: C.signal}}>|</span>
				</div>
				{[0.92, 0.86, 0.95, 0.5, -1, 0.9, 0.82, 0.88, 0.6].map((w, i) => {
					const a = prog(t, t3 + 0.75 + i * 0.1, t3 + 0.95 + i * 0.1);
					return (
						<div
							key={i}
							style={{
								marginTop: w < 0 ? 26 : 16,
								height: w < 0 ? 22 : 14,
								width: `${(w < 0 ? 0.55 : w) * 100 * a}%`,
								borderRadius: 2,
								background: w < 0 ? C.ink3 : C.bg4,
							}}
						/>
					);
				})}
			</div>
			<Ring label="Google" value={92} at={t3 + 0.9} x={620} y={130} />
			<Ring label="AI answers" value={88} at={t3 + 1.15} x={620} y={350} />
		</Panel>
	);
};

export const Stations: React.FC = () => (
	<>
		<See />
		<Find />
		<Plan />
		<Create />
	</>
);

