import React from 'react';
import {B, INOUT, prog, typed, useT} from '../lib';
import {STATIONS, STATION_H, STATION_W} from '../layout';
import {C, display, mono} from '../theme';
import {At, Card, ChevronUp, Climb, Cursor, LogoTile, Num, Tag} from './ui';

const Panel: React.FC<{k: number; title: string; children: React.ReactNode}> = ({k, title, children}) => {
	const t = useT();
	const a = prog(t, B.stations[k] - 0.7, B.stations[k] + 0.1);
	const scan = prog(t, B.stations[k], B.stations[k] + 0.9, INOUT);
	return (
		<At
			p={STATIONS[k]}
			w={STATION_W}
			h={STATION_H}
			style={{opacity: Math.min(1, a * 1.6), transformOrigin: '50% 100%', transform: `perspective(1600px) rotateX(${(1 - a) * -72}deg)`}}
		>
			<Card>
				{scan > 0 && scan < 1 ? <div style={{position: 'absolute', left: 0, right: 0, top: `${scan * 100}%`, height: 3, background: C.signal, opacity: 0.5 * (1 - scan), zIndex: 5}} /> : null}
				<div style={{position: 'absolute', left: 44, top: 36, display: 'flex', alignItems: 'center', gap: 14}}>
					<Climb size={34} />
					<span style={{fontFamily: display, fontWeight: 700, fontSize: 40, color: C.inkStrong, letterSpacing: -0.5}}>{title}</span>
				</div>
				{children}
			</Card>
		</At>
	);
};

/** Four L-shaped corner marks: "look here". */
const Ticks: React.FC<{x: number; y: number; w: number; h: number; on: number}> = ({x, y, w, h, on}) => {
	const s = 18;
	const o = 10 + (1 - on) * 30;
	const corner = (cx: number, cy: number, sx: number, sy: number) => (
		<path d={`M ${cx} ${cy + sy * s} L ${cx} ${cy} L ${cx + sx * s} ${cy}`} fill="none" stroke={C.signalText} strokeWidth={4} />
	);
	return (
		<svg style={{position: 'absolute', left: x - o, top: y - o, overflow: 'visible', opacity: on}} width={w + 2 * o} height={h + 2 * o}>
			{corner(0, 0, 1, 1)}
			{corner(w + 2 * o, 0, -1, 1)}
			{corner(0, h + 2 * o, 1, -1)}
			{corner(w + 2 * o, h + 2 * o, -1, -1)}
		</svg>
	);
};

const Check: React.FC<{on: number}> = ({on}) => (
	<span
		style={{
			width: 30,
			height: 30,
			borderRadius: 4,
			border: `2px solid ${on > 0.5 ? C.signal : C.lineStrong}`,
			background: on > 0.5 ? C.signal : C.bg,
			display: 'inline-flex',
			alignItems: 'center',
			justifyContent: 'center',
		}}
	>
		<svg width={18} height={18} viewBox="0 0 16 16" fill="none" stroke="#fff" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" style={{opacity: on}}>
			<path d="M3 8.5 6.5 12 13 4.5" />
		</svg>
	</span>
);

// ---------- 01 See: the competitive quadrant, by topic ----------

const TOPICS = ['Reservation software', 'Waitlist apps', 'Table management', 'Online ordering', 'Guest CRM'];
type Spot = {v: number; r: number};
const BRANDS: {name: string; you?: boolean; a: Spot; b: Spot}[] = [
	{name: 'Acme', a: {v: 84, r: 1.3}, b: {v: 46, r: 3.0}},
	{name: 'Northwind', a: {v: 66, r: 2.1}, b: {v: 82, r: 1.4}},
	{name: 'Globex', a: {v: 49, r: 2.8}, b: {v: 28, r: 3.7}},
	{name: 'Initech', a: {v: 31, r: 3.5}, b: {v: 66, r: 2.0}},
	{name: 'Your Brand', you: true, a: {v: 14, r: 4.4}, b: {v: 12, r: 4.5}},
];
const PLOT = {x: 420, y: 120, w: 580, h: 420};
const spotXY = (s: Spot) => ({x: PLOT.x + PLOT.w * (0.06 + ((5 - s.r) / 4) * 0.88), y: PLOT.y + PLOT.h * (0.06 + ((100 - s.v) / 100) * 0.88)});

export const See: React.FC = () => {
	const t = useT();
	const t0 = B.stations[0];
	const pick = B.topicPick;
	const picked = t >= pick ? 1 : 0;
	const lerpSpot = (a: Spot, b: Spot, i: number) => {
		const p = prog(t, pick + 0.1 + i * 0.05, pick + 1.0 + i * 0.05, INOUT);
		return {v: a.v + (b.v - a.v) * p, r: a.r + (b.r - a.r) * p};
	};
	const leadP = prog(t, pick + 0.1, pick + 1.0, INOUT);
	const leadA = spotXY(BRANDS[0].a);
	const leadB = spotXY(BRANDS[1].b);
	const lead = {x: leadA.x + (leadB.x - leadA.x) * leadP, y: leadA.y + (leadB.y - leadA.y) * leadP};
	const chipY = (i: number) => 160 + i * 66;
	const cur = prog(t, pick - 0.7, pick - 0.05);
	const showCursor = t > pick - 0.8 && t < pick + 0.9;
	return (
		<Panel k={0} title="Who AI recommends in your industry">
			<span style={{position: 'absolute', left: 44, top: 118, fontSize: 18, fontWeight: 600, color: C.ink2}}>Topic</span>
			{TOPICS.map((tp, i) => {
				const on = i === picked;
				return (
					<div
						key={tp}
						style={{
							position: 'absolute',
							left: 44,
							top: chipY(i),
							width: 320,
							height: 54,
							display: 'flex',
							alignItems: 'center',
							padding: '0 16px',
							borderRadius: 4,
							border: `2px solid ${on ? C.signal : C.line}`,
							background: on ? C.signalTint : C.bg,
							color: on ? C.signalText : C.ink,
							fontSize: 20,
							fontWeight: on ? 700 : 600,
							opacity: prog(t, t0 + i * 0.06, t0 + 0.3 + i * 0.06),
						}}
					>
						{tp}
					</div>
				);
			})}
			{/* the plot */}
			<div style={{position: 'absolute', left: PLOT.x, top: PLOT.y, width: PLOT.w, height: PLOT.h, border: `2px solid ${C.line}`, opacity: prog(t, t0, t0 + 0.3)}}>
				<div style={{position: 'absolute', left: '50%', top: 0, width: '50%', height: '50%', background: C.signalTint}} />
				<div style={{position: 'absolute', left: 0, right: 0, top: '50%', borderTop: `2px solid ${C.lineStrong}`}} />
				<div style={{position: 'absolute', top: 0, bottom: 0, left: '50%', borderLeft: `2px solid ${C.lineStrong}`}} />
				<span style={{position: 'absolute', left: 14, top: 10, fontSize: 17, fontWeight: 600, color: C.ink2}}>Challengers</span>
				<span style={{position: 'absolute', right: 14, top: 10, fontSize: 17, fontWeight: 700, color: C.signalText}}>Leaders</span>
				<span style={{position: 'absolute', left: 0, bottom: -40, fontSize: 18, color: C.ink2, display: 'flex', alignItems: 'center', gap: 6}}>
					<ChevronUp size={14} color={C.ink3} />
					Visibility
				</span>
				<span style={{position: 'absolute', right: 0, bottom: -40, fontSize: 18, color: C.ink2, display: 'flex', alignItems: 'center', gap: 6}}>
					Higher rank
					<span style={{rotate: '90deg', display: 'inline-flex'}}>
						<ChevronUp size={14} color={C.ink3} />
					</span>
				</span>
			</div>
			<Ticks x={lead.x - 31} y={lead.y - 31} w={62} h={62} on={prog(t, t0 + 1.2, t0 + 1.5)} />
			{BRANDS.map((b, i) => {
				const s = spotXY(lerpSpot(b.a, b.b, i));
				const pop = prog(t, t0 + 0.4 + i * 0.12, t0 + 0.7 + i * 0.12);
				return (
					<div key={b.name} style={{position: 'absolute', left: s.x - 31, top: s.y - 31, opacity: pop, scale: `${0.6 + 0.4 * pop}`}}>
						<div style={{width: 62, height: 62, borderRadius: 8, border: `2px solid ${b.you ? C.signal : C.inkStrong}`, background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
							<LogoTile name={b.name} size={44} you={b.you} />
						</div>
						<span
							style={{
								position: 'absolute',
								// Names near the right edge sit on the tile's left so they stay inside the plot.
								...(s.x > PLOT.x + PLOT.w * 0.68 ? {right: 72} : {left: 72}),
								top: 16,
								fontSize: 18,
								fontWeight: 700,
								whiteSpace: 'nowrap',
								color: b.you ? C.signalText : C.inkStrong,
							}}
						>
							{b.name}
						</span>
					</div>
				);
			})}
			{showCursor ? <Cursor p={{x: 300 - 80 * cur, y: 520 - (520 - chipY(1) - 18) * cur}} press={prog(t, pick - 0.05, pick) * (1 - prog(t, pick + 0.12, pick + 0.25))} opacity={Math.min(prog(t, pick - 0.8, pick - 0.6), 1 - prog(t, pick + 0.6, pick + 0.9))} /> : null}
		</Panel>
	);
};

// ---------- 02 Find: the keywords most likely to convert ----------

const KEYWORDS = [
	{kw: 'restaurant reservation system', conv: 92, lift: 18},
	{kw: 'table booking software', conv: 88, lift: 15},
	{kw: 'best reservation app for restaurants', conv: 84, lift: 21},
	{kw: 'online booking for restaurants', conv: 79, lift: 12},
	{kw: 'free restaurant booking widget', conv: 41, lift: 4},
	{kw: 'how to take reservations', conv: 33, lift: 6},
];
const START_SLOT = [3, 1, 5, 0, 4, 2]; // where each keyword sits before the sort

export const Find: React.FC = () => {
	const t = useT();
	const t1 = B.stations[1];
	const sort = prog(t, B.keywordSort, B.keywordSort + 0.8, INOUT);
	const rowY = (slot: number) => 168 + slot * 70;
	const done = prog(t, B.keywordPicks[3] + 0.5, B.keywordPicks[3] + 0.9);
	return (
		<Panel k={1} title="Keywords most likely to convert">
			<div style={{position: 'absolute', left: 44, right: 44, top: 126, display: 'flex', fontSize: 18, fontWeight: 600, color: C.ink2, opacity: prog(t, t1, t1 + 0.3)}}>
				<span style={{width: 50}} />
				<span style={{flex: 1}}>Keyword</span>
				<span style={{width: 250}}>Conversion potential</span>
				<span style={{width: 170}}>AI visibility lift</span>
			</div>
			{KEYWORDS.map((k, i) => {
				const y = rowY(START_SLOT[i]) + (rowY(i) - rowY(START_SLOT[i])) * sort;
				const on = i < 4 ? prog(t, B.keywordPicks[i], B.keywordPicks[i] + 0.12) : 0;
				const a = prog(t, t1 + 0.1 + i * 0.07, t1 + 0.4 + i * 0.07);
				return (
					<div
						key={k.kw}
						style={{
							position: 'absolute',
							left: 44,
							right: 44,
							top: y,
							height: 60,
							display: 'flex',
							alignItems: 'center',
							padding: '0 16px',
							borderRadius: 8,
							border: `2px solid ${on > 0.5 ? C.signal : C.line}`,
							background: on > 0.5 ? C.signalTint : C.bg,
							opacity: a * (i < 4 ? 1 : 1 - 0.6 * done),
							fontSize: 21,
							color: C.ink,
						}}
					>
						<span style={{width: 50}}>
							<Check on={on} />
						</span>
						<span style={{flex: 1, whiteSpace: 'nowrap'}}>{k.kw}</span>
						<span style={{width: 250, display: 'flex', alignItems: 'center', gap: 12}}>
							<span style={{width: 150, height: 12, borderRadius: 2, background: C.bg4, overflow: 'hidden'}}>
								<span style={{display: 'block', height: '100%', width: `${k.conv * prog(t, t1 + 0.3, t1 + 1.1)}%`, background: k.conv > 70 ? C.signal : C.ink4}} />
							</span>
							<Num size={20}>{k.conv}</Num>
						</span>
						<span style={{width: 170}}>
							<Tag kind={k.lift >= 10 ? 'pos' : 'neutral'} size={18} icon={<ChevronUp size={14} color={k.lift >= 10 ? C.pos : C.ink2} />}>
								+{k.lift} pts
							</Tag>
						</span>
					</div>
				);
			})}
		</Panel>
	);
};

// ---------- 03 Plan: the full editorial calendar, written ----------

const TOPIC_DAYS = [2, 3, 5, 6, 9, 10, 12, 13, 16, 17, 19, 20, 23, 24, 26, 27];
const DRAFT_TITLE = 'The best reservation software for small restaurants';

export const Plan: React.FC = () => {
	const t = useT();
	const t2 = B.stations[2];
	const [f0, f1] = B.calendarFill;
	const [d0, d1] = B.draftType;
	const cell = 62;
	const gap = 7;
	const calX = 44;
	const calY = 196;
	const pos = (day: number) => ({x: calX + ((day - 1) % 7) * (cell + gap), y: calY + Math.floor((day - 1) / 7) * (cell + gap)});
	const card = prog(t, d0 - 0.5, d0 - 0.1);
	return (
		<Panel k={2} title="Your editorial calendar">
			<span style={{position: 'absolute', left: calX, top: 118, fontFamily: display, fontWeight: 700, fontSize: 26, color: C.inkStrong}}>November</span>
			{['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
				<span key={i} style={{position: 'absolute', left: calX + i * (cell + gap) + 6, top: 162, fontSize: 16, color: C.ink3, fontWeight: 600}}>
					{d}
				</span>
			))}
			{Array.from({length: 30}, (_, i) => {
				const day = i + 1;
				const p = pos(day);
				const k = TOPIC_DAYS.indexOf(day);
				const planned = k >= 0 ? prog(t, f0 + (k / TOPIC_DAYS.length) * (f1 - f0), f0 + (k / TOPIC_DAYS.length) * (f1 - f0) + 0.12) : 0;
				const written = k >= 0 ? prog(t, d0 + k * 0.12, d0 + k * 0.12 + 0.1) : 0;
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
							border: `2px solid ${planned > 0.5 ? (written > 0.5 ? C.signal : C.sky) : C.line}`,
							background: written > 0.5 ? C.signalTint : C.bg,
							opacity: prog(t, t2 - 0.3 + i * 0.005, t2 + i * 0.005),
						}}
					>
						<span style={{position: 'absolute', left: 6, top: 4, fontFamily: mono, fontSize: 14, color: written > 0.5 ? C.signalText : C.ink3}}>{day}</span>
						<div style={{position: 'absolute', left: 6, right: 6, bottom: 8, height: 8, borderRadius: 2, background: written > 0.5 ? C.signal : C.sky, opacity: planned, scale: `${planned} 1`, transformOrigin: 'left'}} />
					</div>
				);
			})}
			{/* one day opens into its draft, written for you */}
			<div style={{position: 'absolute', left: 560, top: 118, width: 436, height: 460, opacity: card, translate: `0 ${(1 - card) * 24}px`}}>
				<Card style={{padding: 26, display: 'flex', flexDirection: 'column', gap: 14, borderColor: C.lineStrong}}>
					<div style={{display: 'flex', alignItems: 'center', gap: 10}}>
						<Num size={18} color={C.ink2}>
							Nov 3
						</Num>
						<span style={{flex: 1}} />
						{t > d1 + 0.2 ? (
							<span style={{opacity: prog(t, d1 + 0.2, d1 + 0.4)}}>
								<Tag kind="pos" size={17}>
									Written
								</Tag>
							</span>
						) : (
							<Tag kind="neutral" size={17}>
								Writing
							</Tag>
						)}
					</div>
					<div style={{fontFamily: display, fontWeight: 700, fontSize: 28, lineHeight: 1.18, color: C.inkStrong, minHeight: 100}}>{typed(DRAFT_TITLE, t, d0, d0 + 1.0)}</div>
					{[0.95, 0.88, 0.92, 0.6, -1, 0.9, 0.84, 0.7].map((w, i) => {
						const a = prog(t, d0 + 0.8 + i * 0.13, d0 + 1.0 + i * 0.13);
						return <div key={i} style={{height: w < 0 ? 18 : 12, width: `${(w < 0 ? 0.5 : w) * 100 * a}%`, borderRadius: 2, background: w < 0 ? C.ink3 : C.bg4, marginTop: w < 0 ? 8 : 0}} />;
					})}
				</Card>
			</div>
		</Panel>
	);
};

// ---------- 04 Create: screenshots, tables and interactive demos ----------

export const PAGE = {left: 44, top: 104, w: 600, h: 492};
const BLOCKS = ['Screenshots', 'Tables', 'Interactive demos'];

const Block: React.FC<{at: number; h: number; children: React.ReactNode}> = ({at, h, children}) => {
	const t = useT();
	const p = prog(t, at, at + 0.35);
	return (
		<div style={{height: h * p, opacity: p, overflow: 'hidden', marginTop: 14 * p}}>
			<div style={{height: h, translate: `0 ${(1 - p) * -24}px`}}>{children}</div>
		</div>
	);
};

// A product screenshot: a small Arrowsterr window with a rising chart.
const MiniShot: React.FC = () => (
	<div style={{height: '100%', borderRadius: 8, border: `2px solid ${C.line}`, background: C.bg2, overflow: 'hidden', display: 'flex', flexDirection: 'column'}}>
		<div style={{height: 22, background: C.bg, borderBottom: `1px solid ${C.line}`, display: 'flex', alignItems: 'center', gap: 6, padding: '0 10px'}}>
			<Climb size={14} />
			<div style={{height: 6, width: 70, borderRadius: 2, background: C.bg4}} />
		</div>
		<div style={{flex: 1, display: 'flex', gap: 12, padding: '8px 12px'}}>
			<div style={{width: 110, display: 'flex', flexDirection: 'column', gap: 6, justifyContent: 'center'}}>
				<div style={{height: 6, width: '60%', borderRadius: 2, background: C.bg4}} />
				<Num size={26}>60%</Num>
			</div>
			<svg viewBox="0 0 200 60" preserveAspectRatio="none" style={{flex: 1, height: '100%'}}>
				<polygon points="0,58 40,54 80,46 120,32 160,18 200,6 200,60 0,60" fill={C.signal} opacity={0.08} />
				<polyline points="0,58 40,54 80,46 120,32 160,18 200,6" fill="none" stroke={C.signal} strokeWidth={3} vectorEffect="non-scaling-stroke" />
			</svg>
		</div>
	</div>
);

const MiniTable: React.FC = () => (
	<div style={{height: '100%', borderRadius: 8, border: `2px solid ${C.line}`, overflow: 'hidden', fontSize: 15}}>
		{[
			['', 'Deposits', 'Waitlist'],
			['Your Brand', 'Yes', 'Yes'],
			['Acme', 'Yes', 'No'],
		].map((r, i) => (
			<div key={i} style={{display: 'flex', height: '33.4%', alignItems: 'center', background: i === 0 ? C.bg3 : C.bg, borderTop: i ? `1px solid ${C.lineFaint}` : 'none'}}>
				{r.map((c, j) => (
					<span key={j} style={{flex: j ? 1 : 1.4, padding: '0 12px', fontWeight: i === 0 || j === 0 ? 700 : 500, color: i === 1 && j === 0 ? C.signalText : C.ink}}>
						{c}
					</span>
				))}
			</div>
		))}
	</div>
);

const MiniDemo: React.FC<{at: number}> = ({at}) => {
	const t = useT();
	const s = 0.2 + 0.65 * prog(t, at + 0.4, at + 1.6, INOUT);
	const covers = Math.round(40 + s * 160);
	return (
		<div style={{height: '100%', borderRadius: 8, border: `2px solid ${C.signal}`, padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 10}}>
			<div style={{display: 'flex', alignItems: 'center', fontSize: 16, color: C.ink2}}>
				<span style={{flex: 1}}>Covers per night</span>
				<Num size={18}>{covers}</Num>
			</div>
			<div style={{position: 'relative', height: 8, borderRadius: 2, background: C.bg4}}>
				<div style={{position: 'absolute', left: 0, top: 0, bottom: 0, width: `${s * 100}%`, background: C.signal, borderRadius: 2}} />
				<div style={{position: 'absolute', left: `calc(${s * 100}% - 11px)`, top: -7, width: 22, height: 22, borderRadius: 999, background: C.bg, border: `3px solid ${C.signal}`}} />
			</div>
			<div style={{display: 'flex', alignItems: 'baseline', gap: 8}}>
				<Num size={26} color={C.signalText}>
					${(covers * 21).toLocaleString('en-US')}
				</Num>
				<span style={{fontSize: 15, color: C.ink2}}>more a month</span>
			</div>
		</div>
	);
};

export const Create: React.FC = () => {
	const t = useT();
	const [b0, b1, b2] = B.blocks;
	const pageOn = 1 - prog(t, B.fold, B.fold + 0.15);
	return (
		<Panel k={3} title="More than text">
			<div
				style={{
					position: 'absolute',
					left: PAGE.left,
					top: PAGE.top,
					width: PAGE.w,
					height: PAGE.h,
					border: `2px solid ${C.lineStrong}`,
					borderRadius: 8,
					padding: '22px 26px',
					opacity: pageOn,
					overflow: 'hidden',
					background: C.bg,
				}}
			>
				<div style={{fontFamily: display, fontSize: 26, fontWeight: 700, color: C.inkStrong, lineHeight: 1.15}}>{DRAFT_TITLE}</div>
				<div style={{height: 10, width: '86%', borderRadius: 2, background: C.bg4, marginTop: 12}} />
				<Block at={b0} h={104}>
					<MiniShot />
				</Block>
				<Block at={b1} h={96}>
					<MiniTable />
				</Block>
				<Block at={b2} h={112}>
					<MiniDemo at={b2} />
				</Block>
			</div>
			<div style={{opacity: pageOn}}>
				<Ticks x={PAGE.left} y={PAGE.top} w={PAGE.w} h={PAGE.h} on={prog(t, B.standOut, B.standOut + 0.3)} />
			</div>
			{BLOCKS.map((label, i) => {
				const on = prog(t, B.blocks[i], B.blocks[i] + 0.2);
				return (
					<div
						key={label}
						style={{
							position: 'absolute',
							left: 690,
							top: 150 + i * 96,
							width: 306,
							height: 76,
							display: 'flex',
							alignItems: 'center',
							gap: 14,
							padding: '0 18px',
							borderRadius: 8,
							border: `2px solid ${on > 0.5 ? C.signal : C.line}`,
							background: on > 0.5 ? C.signalTint : C.bg,
							color: on > 0.5 ? C.signalText : C.ink3,
							fontSize: 22,
							fontWeight: 700,
							opacity: prog(t, B.stations[3] + i * 0.08, B.stations[3] + 0.3 + i * 0.08),
						}}
					>
						<span style={{width: 34, height: 34, borderRadius: 4, background: on > 0.5 ? C.signal : C.bg3, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontFamily: mono, fontSize: 16}}>
							{i + 1}
						</span>
						{label}
					</div>
				);
			})}
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
