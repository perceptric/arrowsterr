import React from 'react';
import {Img, random, staticFile} from 'remotion';
import {B, hit, INOUT, mixColor, prog, typed, useT} from '../lib';
import {STATIONS, STATION_H, STATION_W} from '../layout';
import {C, display, mono} from '../theme';
import {GoogleWord} from './Platforms';
import {At, BRAND_COLOR, Card, ChevronUp, Climb, Cursor, LogoTile, Num, slamStyle, Tag} from './ui';

const NOTCH = 28;

const Panel: React.FC<{k: number; title: string; children: React.ReactNode}> = ({k, title, children}) => {
	const t = useT();
	const a = prog(t, B.stations[k] - 0.7, B.stations[k] + 0.1);
	const scan = prog(t, B.stations[k], B.stations[k] + 0.9, INOUT);
	const lock = prog(t, B.stations[k] + 0.1, B.stations[k] + 0.6) * (1 - prog(t, B.stationEnds[k] - 0.7, B.stationEnds[k] - 0.3));
	const blink = Math.floor(t * 3) % 2 ? 1 : 0.35;
	return (
		<>
			<At
				p={STATIONS[k]}
				w={STATION_W}
				h={STATION_H}
				style={{opacity: Math.min(1, a * 1.6), transformOrigin: '50% 100%', transform: `perspective(1600px) rotateX(${(1 - a) * -72}deg)`}}
			>
				{/* the frame carries the Notch: a 45 degree cut on its top-right corner */}
				<div style={{position: 'absolute', inset: 0, clipPath: `polygon(0 0, calc(100% - ${NOTCH}px) 0, 100% ${NOTCH}px, 100% 100%, 0 100%)`}}>
					<Card>
						{scan > 0 && scan < 1 ? <div style={{position: 'absolute', left: 0, right: 0, top: `${scan * 100}%`, height: 3, background: C.signal, opacity: 0.5 * (1 - scan), zIndex: 5}} /> : null}
						<div style={{position: 'absolute', left: 44, top: 36, display: 'flex', alignItems: 'center', gap: 14}}>
							<Climb size={34} />
							<span style={{fontFamily: display, fontWeight: 700, fontSize: 40, color: C.inkStrong, letterSpacing: -0.5}}>{title}</span>
						</div>
						{children}
					</Card>
				</div>
				<svg style={{position: 'absolute', right: 0, top: 0, overflow: 'visible'}} width={NOTCH} height={NOTCH}>
					<line x1={0} y1={1} x2={NOTCH - 1} y2={NOTCH} stroke={C.lineStrong} strokeWidth={2.5} />
				</svg>
			</At>
			{/* a lock-on frame and a step counter while the camera holds on the panel */}
			<At p={STATIONS[k]} w={STATION_W} h={STATION_H} style={{pointerEvents: 'none'}}>
				<Ticks x={0} y={0} w={STATION_W} h={STATION_H} on={lock} />
				<div
					style={{
						position: 'absolute',
						right: 0,
						top: -54,
						display: 'flex',
						alignItems: 'center',
						gap: 10,
						opacity: lock,
						fontFamily: mono,
						fontSize: 22,
						fontWeight: 600,
						color: C.signalText,
						fontVariantNumeric: 'tabular-nums',
					}}
				>
					<span style={{width: 10, height: 10, background: C.signal, opacity: blink}} />
					{`0${k + 1} / 04`}
				</div>
			</At>
		</>
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

const Picks: React.FC = () => {
	const t = useT();
	const t1 = B.stations[1];
	const sort = prog(t, B.keywordSort, B.keywordSort + 0.8, INOUT);
	const rowY = (slot: number) => 168 + slot * 70;
	const done = prog(t, B.keywordPicks[3] + 0.5, B.keywordPicks[3] + 0.9);
	return (
		<>
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
		</>
	);
};

// The database view: search 8.4B keywords, pick your own, then research any domain.
const DB_ROWS = [
	{kw: 'table booking app', cc: 'us', vol: '12,100'},
	{kw: 'table booking system', cc: 'gb', vol: '4,400'},
	{kw: 'online table booking', cc: 'de', vol: '2,900'},
	{kw: 'table booking widget', cc: 'au', vol: '1,600'},
	{kw: 'free table booking software', cc: 'ca', vol: '1,300'},
];
const DOMAIN_ROWS = [
	{kw: 'acme reservations', cc: '#1', vol: '8,100'},
	{kw: 'table reservation software', cc: '#2', vol: '3,600'},
	{kw: 'restaurant booking app', cc: '#3', vol: '5,400'},
	{kw: 'reservation system pricing', cc: '#4', vol: '1,900'},
	{kw: 'acme vs northwind', cc: '#5', vol: '880'},
];
// Flags from the flag-icons package (MIT).
const COUNTRIES = ['us', 'gb', 'au', 'de', 'fr', 'es', 'it', 'nl', 'se', 'jp', 'in'];

const Database: React.FC = () => {
	const t = useT();
	const dom = t >= B.domainTab;
	const [ty0, ty1] = B.dbType;
	const query = dom ? typed('acme.com', t, B.domainTab + 0.1, B.domainTab + 0.7) : typed('table booking', t, ty0, ty1);
	const rows = dom ? DOMAIN_ROWS : DB_ROWS;
	const rowsIn = dom ? B.domainTab + 0.8 : ty1 + 0.1;
	const slamK = hit(t, B.dbSlam, 8);
	return (
		<>
			{/* tabs */}
			<div style={{position: 'absolute', left: 44, top: 108, display: 'flex', gap: 28, fontSize: 21, fontWeight: 700}}>
				{['Keywords', 'Domains'].map((tab, i) => {
					const on = (i === 1) === dom;
					return (
						<span key={tab} style={{color: on ? C.signalText : C.ink3, paddingBottom: 8, borderBottom: `3px solid ${on ? C.signal : 'transparent'}`}}>
							{tab}
						</span>
					);
				})}
			</div>
			{/* the size of the database */}
			<div style={{position: 'absolute', right: 44, top: 100, width: 300, height: 110, display: 'flex', alignItems: 'baseline', justifyContent: 'flex-end', gap: 12, opacity: prog(t, B.dbSlam - 0.15, B.dbSlam)}}>
				<span style={{...slamStyle(slamK), transformOrigin: 'right center'}}>
					<Num size={84} color={C.signalText} weight={800}>
						8.4B
					</Num>
				</span>
				<span style={{fontSize: 22, fontWeight: 700, color: C.ink2}}>keywords</span>
			</div>
			<Ticks x={700} y={100} w={300} h={110} on={prog(t, B.dbSlam, B.dbSlam + 0.3)} />
			{/* search */}
			<div style={{position: 'absolute', left: 44, top: 160, width: 600, height: 60, borderRadius: 8, border: `2px solid ${C.signal}`, display: 'flex', alignItems: 'center', gap: 12, padding: '0 18px', fontSize: 23, color: C.inkStrong}}>
				<svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={C.ink2} strokeWidth={2.4}>
					<circle cx={10.5} cy={10.5} r={6.5} />
					<path d="M15.5 15.5 L21 21" />
				</svg>
				{query}
				<span style={{width: 3, height: 28, background: C.signal}} />
			</div>
			{rows.map((r, i) => {
				const a = prog(t, rowsIn + i * 0.08, rowsIn + 0.25 + i * 0.08);
				const pickAt = !dom && i === 0 ? B.dbPicks[0] : !dom && i === 2 ? B.dbPicks[1] : 0;
				const on = pickAt ? prog(t, pickAt, pickAt + 0.12) : 0;
				return (
					<div
						key={(dom ? 'd' : 'k') + r.kw}
						style={{
							position: 'absolute',
							left: 44,
							right: 44,
							top: 240 + i * 60,
							height: 52,
							display: 'flex',
							alignItems: 'center',
							gap: 16,
							padding: '0 16px',
							borderRadius: 8,
							border: `2px solid ${on > 0.5 ? C.signal : C.line}`,
							background: on > 0.5 ? C.signalTint : C.bg,
							opacity: a,
							translate: `${(1 - a) * -24}px 0`,
							fontSize: 20,
							color: C.ink,
						}}
					>
						{dom ? null : <Check on={on} />}
						<span style={{flex: 1}}>{r.kw}</span>
						{dom ? (
							<Tag kind="signal" size={16}>
								{r.cc}
							</Tag>
						) : (
							<Img src={staticFile(`flags/${r.cc}.svg`)} style={{width: 32, height: 24, borderRadius: 3, border: `1px solid ${C.lineStrong}`, objectFit: 'cover'}} />
						)}
						<span style={{width: 90, textAlign: 'right'}}>
							<Num size={20}>{r.vol}</Num>
						</span>
					</div>
				);
			})}
			{/* every industry, every country */}
			<div style={{position: 'absolute', left: 44, top: 556, display: 'flex', gap: 10, alignItems: 'center'}}>
				{['All industries', 'All countries'].map((c, i) => {
					const a = prog(t, B.dbChips[i], B.dbChips[i] + 0.2);
					return (
						<span key={c} style={{opacity: a, scale: `${0.8 + 0.2 * a}`}}>
							<Tag kind="signal" size={18}>
								{c}
							</Tag>
						</span>
					);
				})}
				{COUNTRIES.map((c, i) => {
					const a = prog(t, B.dbChips[1] + 0.1 + i * 0.04, B.dbChips[1] + 0.25 + i * 0.04);
					return (
						<Img
							key={c}
							src={staticFile(`flags/${c}.svg`)}
							style={{width: 36, height: 27, borderRadius: 3, border: `1px solid ${C.lineStrong}`, objectFit: 'cover', opacity: a, scale: `${0.7 + 0.3 * a}`}}
						/>
					);
				})}
				<span style={{opacity: prog(t, B.dbChips[1] + 0.6, B.dbChips[1] + 0.8), fontSize: 18, fontWeight: 700, color: C.ink2}}>+190</span>
			</div>
			{!dom && t > B.dbPicks[0] - 0.8 && t < B.dbPicks[1] + 0.6 ? (
				<Cursor
					p={{x: 120, y: t < B.dbPicks[0] + 0.1 ? 300 - 34 * prog(t, B.dbPicks[0] - 0.7, B.dbPicks[0]) : 266 + 120 * prog(t, B.dbPicks[0] + 0.2, B.dbPicks[1])}}
					press={Math.max(hit(t, B.dbPicks[0], 18), hit(t, B.dbPicks[1], 18))}
					opacity={Math.min(prog(t, B.dbPicks[0] - 0.8, B.dbPicks[0] - 0.6), 1 - prog(t, B.dbPicks[1] + 0.3, B.dbPicks[1] + 0.6))}
				/>
			) : null}
		</>
	);
};

export const Find: React.FC = () => {
	const t = useT();
	const sw = prog(t, B.dbView - 0.15, B.dbView + 0.3, INOUT);
	return (
		<Panel k={1} title={sw < 0.5 ? 'Keywords most likely to convert' : 'Keyword and domain research'}>
			<div style={{position: 'absolute', inset: 0, opacity: 1 - sw, translate: `${-sw * 60}px 0`}}>
				<Picks />
			</div>
			{sw > 0 ? (
				<div style={{position: 'absolute', inset: 0, opacity: sw, translate: `${(1 - sw) * 60}px 0`}}>
					<Database />
				</div>
			) : null}
		</Panel>
	);
};

// ---------- 03 Write: in your brand voice, learning from the top of Google ----------

const DRAFT_TITLE = 'The best reservation software for small restaurants';
const VOICE = ['Friendly', 'Expert', 'Clear', 'No jargon'];
const SERP = [
	{t: 'The 9 Best Reservation Apps (2026)', d: 'northwind.io', b: 'Northwind'},
	{t: 'Reservation Software: A Buyer\'s Guide', d: 'acme.com', b: 'Acme'},
	{t: 'How to Pick Booking Software', d: 'globex.com', b: 'Globex'},
];

export const Write: React.FC = () => {
	const t = useT();
	const t2 = B.stations[2];
	const [w0, w1] = B.writeIn;
	const [d0, d1] = B.draftType;
	return (
		<Panel k={2} title="Written in your voice">
			{/* brand voice */}
			<div style={{position: 'absolute', left: 44, top: 112, width: 400, height: 200, opacity: prog(t, t2, t2 + 0.3)}}>
				<Card style={{padding: 20, display: 'flex', flexDirection: 'column', gap: 14, borderColor: C.lineStrong}}>
					<span style={{fontSize: 22, fontWeight: 700, color: C.inkStrong}}>Brand Voice</span>
					<div style={{display: 'flex', flexWrap: 'wrap', gap: 8}}>
						{VOICE.map((v, i) => (
							<span key={v} style={{opacity: prog(t, t2 + 0.2 + i * 0.1, t2 + 0.4 + i * 0.1)}}>
								<Tag kind="signal" size={17}>
									{v}
								</Tag>
							</span>
						))}
					</div>
					{[0.9, 0.7].map((w, i) => (
						<div key={i} style={{height: 10, width: `${w * 100}%`, borderRadius: 2, background: C.bg4}} />
					))}
				</Card>
			</div>
			{/* top of Google */}
			<div style={{position: 'absolute', left: 44, top: 330, width: 400, height: 250, opacity: prog(t, t2 + 0.2, t2 + 0.5)}}>
				<Card style={{borderColor: C.lineStrong, display: 'flex', flexDirection: 'column'}}>
					<div style={{display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px 10px', borderBottom: '1px solid #EBEBEB'}}>
						<GoogleWord size={22} />
						<div style={{flex: 1, height: 30, borderRadius: 15, border: '1px solid #DFE1E5', boxShadow: '0 1px 4px rgba(32,33,36,0.16)', display: 'flex', alignItems: 'center', padding: '0 12px', fontSize: 13, color: '#202124', whiteSpace: 'nowrap', overflow: 'hidden'}}>
							best reservation software
						</div>
					</div>
					<div style={{padding: '8px 16px', display: 'flex', flexDirection: 'column', gap: 9}}>
						{SERP.map((r, i) => (
							<div key={r.t} style={{display: 'flex', flexDirection: 'column', gap: 2, opacity: prog(t, t2 + 0.4 + i * 0.12, t2 + 0.6 + i * 0.12)}}>
								<span style={{display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#4D5156'}}>
									<span style={{width: 18, height: 18, borderRadius: 99, background: '#F1F3F4', display: 'inline-flex', alignItems: 'center', justifyContent: 'center'}}>
										<LogoTile name={r.b} size={12} />
									</span>
									{r.d}
								</span>
								<span style={{fontSize: 17, color: '#1A0DAB', lineHeight: 1.2}}>{r.t}</span>
							</div>
						))}
					</div>
				</Card>
			</div>
			{/* both stream into the draft */}
			{Array.from({length: 40}, (_, i) => {
				const fromVoice = i % 2 === 0;
				const start = w0 + random(`ws${i}`) * (w1 - w0 + 1.2);
				const p = prog(t, start, start + 0.7, INOUT);
				if (p <= 0 || p >= 1) return null;
				const x0 = 444;
				const y0 = fromVoice ? 210 : 450;
				const x1 = 540;
				const y1 = 200 + random(`wy${i}`) * 300;
				const cx = 500;
				const x = (1 - p) * (1 - p) * x0 + 2 * (1 - p) * p * cx + p * p * x1;
				const y = (1 - p) * (1 - p) * y0 + 2 * (1 - p) * p * ((y0 + y1) / 2) + p * p * y1;
				return <div key={i} style={{position: 'absolute', left: x, top: y, width: 9, height: 9, background: fromVoice ? C.signal : C.sky}} />;
			})}
			{/* the draft */}
			<div style={{position: 'absolute', left: 540, top: 112, width: 456, height: 468, opacity: prog(t, w0, w0 + 0.4)}}>
				<Card style={{padding: 26, display: 'flex', flexDirection: 'column', gap: 14, borderColor: C.signal}}>
					<div style={{display: 'flex', alignItems: 'center', gap: 10}}>
						<span style={{fontSize: 18, fontWeight: 700, color: C.ink2, flex: 1}}>Draft</span>
						{t > d1 + 0.2 ? (
							<span style={{opacity: prog(t, d1 + 0.2, d1 + 0.4)}}>
								<Tag kind="pos" size={17} icon={<ChevronUp size={14} color={C.pos} />}>
									Voice match 96%
								</Tag>
							</span>
						) : (
							<Tag kind="neutral" size={17}>
								Writing
							</Tag>
						)}
					</div>
					<div style={{fontFamily: display, fontWeight: 800, fontSize: 30, lineHeight: 1.15, color: C.inkStrong, minHeight: 104}}>{typed(DRAFT_TITLE, t, d0, d0 + 1.0)}</div>
					{[0.95, 0.88, 0.92, 0.6, -1, 0.9, 0.84, 0.7, 0.8].map((w, i) => {
						const a = prog(t, d0 + 0.8 + i * 0.22, d0 + 1.0 + i * 0.22);
						return <div key={i} style={{height: w < 0 ? 18 : 12, width: `${(w < 0 ? 0.5 : w) * 100 * a}%`, borderRadius: 2, background: w < 0 ? C.ink3 : C.bg4, marginTop: w < 0 ? 8 : 0}} />;
					})}
				</Card>
			</div>
		</Panel>
	);
};

// ---------- 04 Create: screenshots, tables and demos, in your brand style ----------

export const PAGE = {left: 44, top: 104, w: 600, h: 492};
const YOU = BRAND_COLOR['Your Brand'];
const YOU_INK = '#3B0A1E';
const YOU_TINT = '#FCE4EC';

const Block: React.FC<{at: number; h: number; children: React.ReactNode}> = ({at, h, children}) => {
	const t = useT();
	const p = prog(t, at, at + 0.35);
	return (
		<div style={{height: h * p, opacity: p, overflow: 'hidden', marginTop: 14 * p}}>
			<div style={{height: h, translate: `0 ${(1 - p) * -24}px`}}>{children}</div>
		</div>
	);
};

type Style = {accent: string; tint: string; ink: string; r: number};

// A product screenshot: your app's reservations dashboard, in whatever style the article has.
const BOOKINGS = [22, 38, 64, 92, 78, 54, 30];
const MiniShot: React.FC<{s: Style; at: number}> = ({s, at}) => {
	const t = useT();
	const g = (i: number) => prog(t, at + 0.15 + i * 0.04, at + 0.5 + i * 0.04);
	return (
		<div style={{height: '100%', borderRadius: s.r, border: `2px solid ${C.lineStrong}`, background: '#fff', overflow: 'hidden', display: 'flex', flexDirection: 'column'}}>
			<div style={{height: 20, background: '#F1F3F5', borderBottom: '1px solid #DEE2E6', display: 'flex', alignItems: 'center', gap: 4, padding: '0 8px', flexShrink: 0}}>
				{['#FF5F57', '#FEBC2E', '#28C840'].map((c) => (
					<span key={c} style={{width: 7, height: 7, borderRadius: 99, background: c}} />
				))}
				<span style={{marginLeft: 8, height: 12, padding: '0 8px', borderRadius: 3, background: '#fff', fontSize: 9, color: '#868E96', display: 'inline-flex', alignItems: 'center'}}>app.yourbrand.com/tonight</span>
			</div>
			<div style={{flex: 1, display: 'flex'}}>
				<div style={{width: 96, background: s.ink, padding: 8, display: 'flex', flexDirection: 'column', gap: 5}}>
					<span style={{display: 'flex', alignItems: 'center', gap: 5, marginBottom: 3}}>
						<LogoTile name="Your Brand" size={16} />
						<span style={{fontSize: 10, fontWeight: 700, color: '#fff'}}>Your Brand</span>
					</span>
					{['Tonight', 'Floor plan', 'Waitlist', 'Guests', 'Reports'].map((x, i) => (
						<span key={x} style={{display: 'flex', alignItems: 'center', gap: 5, padding: '3px 5px', borderRadius: Math.min(s.r, 6), background: i === 0 ? s.accent : 'transparent', fontSize: 9.5, fontWeight: 600, color: i === 0 ? '#fff' : 'rgba(255,255,255,0.6)'}}>
							<span style={{width: 7, height: 7, borderRadius: 2, background: i === 0 ? '#fff' : 'rgba(255,255,255,0.35)'}} />
							{x}
						</span>
					))}
				</div>
				<div style={{flex: 1, padding: '7px 10px', display: 'flex', flexDirection: 'column', gap: 6, background: '#F8F9FA'}}>
					<div style={{display: 'flex', alignItems: 'center', gap: 6}}>
						<span style={{fontSize: 12.5, fontWeight: 800, color: '#212529', flex: 1}}>Tonight · Friday</span>
						<span style={{fontSize: 9, fontWeight: 700, color: '#fff', padding: '2px 7px', borderRadius: Math.min(s.r, 8), background: s.accent}}>+ Booking</span>
					</div>
					<div style={{display: 'flex', gap: 6}}>
						{[
							['Covers', '184', '+22%'],
							['No-shows', '3%', '-40%'],
							['Waitlist', '12', ''],
						].map(([l, v, d], i) => (
							<div key={l} style={{flex: 1, background: '#fff', border: '1px solid #E9ECEF', borderRadius: Math.min(s.r, 6), padding: '3px 6px', opacity: g(i), translate: `0 ${(1 - g(i)) * 6}px`}}>
								<div style={{fontSize: 8.5, color: '#868E96', fontWeight: 600}}>{l}</div>
								<div style={{display: 'flex', alignItems: 'baseline', gap: 4}}>
									<span style={{fontSize: 13, fontWeight: 800, color: '#212529', fontVariantNumeric: 'tabular-nums'}}>{v}</span>
									{d ? <span style={{fontSize: 8.5, fontWeight: 700, color: '#2B8A3E'}}>{d}</span> : null}
								</div>
							</div>
						))}
					</div>
					<div style={{flex: 1, display: 'flex', gap: 6}}>
						<div style={{flex: 1.5, background: '#fff', border: '1px solid #E9ECEF', borderRadius: Math.min(s.r, 6), padding: '3px 6px', display: 'flex', flexDirection: 'column'}}>
							<span style={{fontSize: 8.5, color: '#868E96', fontWeight: 600}}>Bookings by hour</span>
							<div style={{flex: 1, display: 'flex', alignItems: 'flex-end', gap: 3, paddingTop: 2}}>
								{BOOKINGS.map((v, i) => (
									<span key={i} style={{flex: 1, height: `${v * g(3 + i)}%`, borderRadius: '2px 2px 0 0', background: i === 3 ? s.accent : s.tint}} />
								))}
							</div>
						</div>
						<div style={{flex: 1, background: '#fff', border: '1px solid #E9ECEF', borderRadius: Math.min(s.r, 6), padding: '3px 6px', display: 'flex', flexDirection: 'column', gap: 2}}>
							<span style={{fontSize: 8.5, color: '#868E96', fontWeight: 600}}>Next up</span>
							{[
								['7:30', 'Chen', '2'],
								['7:45', 'Ruiz', '4'],
								['8:00', 'Patel', '6'],
							].map(([h, n, c], i) => (
								<span key={h} style={{display: 'flex', alignItems: 'center', gap: 4, fontSize: 8.5, color: '#495057', fontWeight: 600, opacity: g(10 + i)}}>
									<span style={{width: 5, height: 5, borderRadius: 99, background: i === 0 ? s.accent : '#ADB5BD'}} />
									<span style={{fontVariantNumeric: 'tabular-nums'}}>{h}</span>
									<span style={{flex: 1}}>{n}</span>
									<span>{c}</span>
								</span>
							))}
						</div>
					</div>
				</div>
			</div>
		</div>
	);
};

const MiniTable: React.FC<{s: Style}> = ({s}) => (
	<div style={{height: '100%', borderRadius: s.r, border: `2px solid ${C.line}`, overflow: 'hidden', fontSize: 15}}>
		{[
			['', 'Deposits', 'Waitlist'],
			['Your Brand', 'Yes', 'Yes'],
			['Acme', 'Yes', 'No'],
		].map((r, i) => (
			<div key={i} style={{display: 'flex', height: '33.4%', alignItems: 'center', background: i === 0 ? s.tint : C.bg, borderTop: i ? `1px solid ${C.lineFaint}` : 'none'}}>
				{r.map((c, j) => (
					<span key={j} style={{flex: j ? 1 : 1.4, padding: '0 12px', fontWeight: i === 0 || j === 0 ? 700 : 500, color: i === 1 && j === 0 ? s.accent : i === 0 ? s.ink : C.ink}}>
						{c}
					</span>
				))}
			</div>
		))}
	</div>
);

const MiniDemo: React.FC<{at: number; s: Style}> = ({at, s}) => {
	const t = useT();
	const v = 0.2 + 0.65 * prog(t, at + 0.4, at + 1.6, INOUT);
	const covers = Math.round(40 + v * 160);
	return (
		<div style={{height: '100%', borderRadius: s.r, border: `2px solid ${s.accent}`, padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 10}}>
			<div style={{display: 'flex', alignItems: 'center', fontSize: 16, color: C.ink2}}>
				<span style={{flex: 1}}>Covers per night</span>
				<Num size={18}>{covers}</Num>
			</div>
			<div style={{position: 'relative', height: 8, borderRadius: 4, background: C.bg4}}>
				<div style={{position: 'absolute', left: 0, top: 0, bottom: 0, width: `${v * 100}%`, background: s.accent, borderRadius: 4}} />
				<div style={{position: 'absolute', left: `calc(${v * 100}% - 11px)`, top: -7, width: 22, height: 22, borderRadius: 999, background: C.bg, border: `3px solid ${s.accent}`}} />
			</div>
			<div style={{display: 'flex', alignItems: 'baseline', gap: 8}}>
				<Num size={26} color={s.accent}>
					${(covers * 21).toLocaleString('en-US')}
				</Num>
				<span style={{fontSize: 15, color: C.ink2}}>more a month</span>
			</div>
		</div>
	);
};

/** The brand style kit: scanned off your site, then poured into the article. */
const StyleKit: React.FC = () => {
	const t = useT();
	const [s0, s1] = B.scan;
	const scan = prog(t, s0, s1, INOUT);
	const sw = [YOU, YOU_INK, YOU_TINT];
	return (
		<>
			{/* your site, being scanned */}
			<div style={{position: 'absolute', left: 690, top: 104, width: 306, height: 220, opacity: prog(t, s0 - 0.4, s0)}}>
				<Card style={{borderColor: C.lineStrong}}>
					<div style={{height: 34, borderBottom: `1px solid ${C.line}`, display: 'flex', alignItems: 'center', gap: 8, padding: '0 12px'}}>
						<LogoTile name="Your Brand" size={18} />
						<span style={{fontSize: 15, fontWeight: 700, color: C.ink2}}>yourbrand.com</span>
					</div>
					<div style={{padding: 14, display: 'flex', flexDirection: 'column', gap: 8}}>
						<div style={{height: 16, width: '80%', borderRadius: 3, background: YOU_INK}} />
						<div style={{height: 10, width: '95%', borderRadius: 2, background: C.bg4}} />
						<div style={{height: 10, width: '70%', borderRadius: 2, background: C.bg4}} />
						<div style={{height: 34, width: 120, borderRadius: 16, background: YOU, marginTop: 6}} />
					</div>
					{scan > 0 && scan < 1 ? (
						<div style={{position: 'absolute', left: 0, right: 0, top: `${scan * 100}%`, height: 4, background: C.signal, opacity: 0.9}} />
					) : null}
					{scan > 0 && scan < 1 ? <div style={{position: 'absolute', left: 0, right: 0, top: 0, height: `${scan * 100}%`, background: C.signal, opacity: 0.06}} /> : null}
				</Card>
			</div>
			{/* what the scan found */}
			<div style={{position: 'absolute', left: 690, top: 340, width: 306, height: 252, opacity: prog(t, s0 + 0.6, s0 + 0.9)}}>
				<Card style={{padding: 18, display: 'flex', flexDirection: 'column', gap: 14, borderColor: C.lineStrong}}>
					<span style={{fontSize: 20, fontWeight: 700, color: C.inkStrong}}>Brand Style</span>
					<div style={{display: 'flex', gap: 10}}>
						{sw.map((c, i) => {
							const a = prog(t, s0 + 1.0 + i * 0.4, s0 + 1.2 + i * 0.4);
							return <div key={c} style={{width: 56, height: 56, borderRadius: 12, background: c, border: `2px solid ${C.line}`, opacity: a, scale: `${0.6 + 0.4 * a}`}} />;
						})}
					</div>
					<div style={{display: 'flex', alignItems: 'center', gap: 14, opacity: prog(t, s1 - 0.4, s1)}}>
						<span style={{fontSize: 34, fontWeight: 800, color: YOU_INK}}>Aa</span>
						<span style={{fontSize: 16, color: C.ink2, fontWeight: 600}}>Headings 800 · Corners 16</span>
					</div>
				</Card>
			</div>
		</>
	);
};

export const Create: React.FC = () => {
	const t = useT();
	const [b0, b1, b2] = B.blocks;
	const pageOn = 1 - prog(t, B.fold, B.fold + 0.15);
	// The article takes on your brand style the moment it's applied.
	const st = prog(t, B.restyle, B.restyle + 0.5, INOUT);
	const s: Style = {accent: mixColor(C.signal, YOU, st), tint: mixColor(C.bg3, YOU_TINT, st), ink: mixColor(C.inkStrong, YOU_INK, st), r: 8 + 8 * st};
	const flashX = prog(t, B.restyle, B.restyle + 0.6, INOUT);
	return (
		<Panel k={3} title="Articles in your brand style">
			<div
				style={{
					position: 'absolute',
					left: PAGE.left,
					top: PAGE.top,
					width: PAGE.w,
					height: PAGE.h,
					border: `2px solid ${st > 0.5 ? mixColor(C.lineStrong, YOU, st) : C.lineStrong}`,
					borderRadius: s.r,
					padding: '22px 26px',
					opacity: pageOn,
					overflow: 'hidden',
					background: C.bg,
				}}
			>
				<div style={{fontFamily: display, fontSize: 26, fontWeight: 800, color: s.ink, lineHeight: 1.15}}>{DRAFT_TITLE}</div>
				<div style={{height: 10, width: '86%', borderRadius: 2, background: C.bg4, marginTop: 12}} />
				<Block at={b0} h={142}>
					<MiniShot s={s} at={b0} />
				</Block>
				<Block at={b1} h={76}>
					<MiniTable s={s} />
				</Block>
				<Block at={b2} h={100}>
					<MiniDemo at={b2} s={s} />
				</Block>
				{/* the restyle sweeps across the page */}
				{flashX > 0 && flashX < 1 ? (
					<div style={{position: 'absolute', top: 0, bottom: 0, left: `${flashX * 130 - 20}%`, width: '14%', background: YOU, opacity: 0.18, rotate: '12deg', scale: '1 1.4'}} />
				) : null}
			</div>
			<StyleKit />
		</Panel>
	);
};

export const Stations: React.FC = () => (
	<>
		<See />
		<Find />
		<Write />
		<Create />
	</>
);
