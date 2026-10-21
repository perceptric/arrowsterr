import React from 'react';
import {Easing, interpolate, useVideoConfig} from 'remotion';
import {random} from 'remotion';
import {B, hit, INOUT, RAMP, useT} from './lib';
import {C} from './theme';
import {DASH, STAT, STATIONS, WIN_B} from './layout';
import {LOCKUP_CENTER} from './world/LogoReveal';

type Key = {t: number; x: number; y: number; z: number; ease?: (n: number) => number};

const WHIP = Easing.bezier(0.7, 0, 0.18, 1);

// One continuous shot. Each key is where the camera points and how close it is.
const station = (k: number, arrive: number, leave: number, z = 0.94): Key[] => {
	const c = STATIONS[k];
	return [
		{t: arrive, x: c.x, y: c.y + 130, z, ease: RAMP},
		{t: leave, x: c.x + 40, y: c.y + 120, z: z + 0.03},
	];
};

export const KEYS: Key[] = [
	{t: 0, x: STAT.x, y: STAT.y - 20, z: 1.08},
	{t: B.toChat, x: STAT.x + 40, y: STAT.y - 20, z: 1.14},
	{t: B.promptType[0] + 0.1, x: 60, y: 240, z: 1.8},
	{t: B.promptType[1] + 0.3, x: 60, y: 245, z: 1.9},
	{t: B.cards[0] - 0.1, x: 0, y: -20, z: 1.3},
	{t: B.ghost - 0.4, x: 0, y: 10, z: 1.33},
	{t: B.ghost + 0.4, x: 40, y: 60, z: 1.45},
	{t: B.clickCompetitor, x: 60, y: 10, z: 1.25},
	{t: B.demoBookedCompetitor, x: 440, y: 40, z: 0.98, ease: WHIP},
	{t: B.dim, x: 460, y: 40, z: 1.0},
	{t: B.arrowhead, x: 320, y: 20, z: 0.95},
	{t: B.arrowhead + 1.3, x: 700, y: -10, z: 0.95},
	{t: B.drop - 0.3, x: LOCKUP_CENTER.x, y: LOCKUP_CENTER.y + 120, z: 0.9},
	{t: B.stations[0] - 1.3, x: LOCKUP_CENTER.x + 20, y: LOCKUP_CENTER.y + 120, z: 0.95},
	...station(0, B.stations[0] + 0.2, B.stationEnds[0] - 0.6),
	...station(1, B.stations[1] + 0.2, B.stationEnds[1] - 0.6),
	...station(2, B.stations[2] + 0.2, B.stationEnds[2] - 0.6),
	...station(3, B.stations[3] + 0.2, B.ship, 1.1),
	{t: B.dashboard, x: DASH.x, y: DASH.y, z: 1.3, ease: WHIP},
	{t: B.finalDrop - 1.6, x: DASH.x + 40, y: DASH.y - 10, z: 1.36},
	{t: B.finalDrop - 0.6, x: WIN_B.x - 300, y: WIN_B.y - 80, z: 1.0},
	{t: B.finalDrop, x: WIN_B.x - 60, y: WIN_B.y - 20, z: 1.12},
	{t: B.finalDrop + 1.0, x: WIN_B.x + 40, y: WIN_B.y - 10, z: 1.12},
	{t: B.clickYou, x: WIN_B.x + 60, y: WIN_B.y - 10, z: 1.15},
	{t: B.demoBookedYou, x: WIN_B.x + 440, y: WIN_B.y + 40, z: 0.98, ease: WHIP},
	{t: B.deal + 0.4, x: WIN_B.x + 460, y: WIN_B.y + 40, z: 1.0},
	{t: B.end, x: WIN_B.x + 480, y: WIN_B.y + 40, z: 1.03},
];

export const cameraAt = (t: number) => {
	const i = Math.max(0, KEYS.findIndex((k) => k.t > t) - 1);
	const a = KEYS[Math.min(i, KEYS.length - 1)];
	const b = KEYS[Math.min(i + 1, KEYS.length - 1)];
	if (a === b || t <= a.t) return {x: a.x, y: a.y, z: a.z};
	const p = interpolate(t, [a.t, b.t], [0, 1], {
		easing: b.ease ?? INOUT,
		extrapolateLeft: 'clamp',
		extrapolateRight: 'clamp',
	});
	return {
		x: a.x + (b.x - a.x) * p,
		y: a.y + (b.y - a.y) * p,
		z: Math.exp(Math.log(a.z) + (Math.log(b.z) - Math.log(a.z)) * p),
	};
};

// While the arrow travels, the map tips back like a car's navigation view, then levels out to read.
const TRAVEL: [number, number, number][] = [
	[B.toChat, B.promptType[0] + 0.1, 16],
	[B.arrowhead, B.drop - 0.3, 22],
	[B.stations[0] - 1.3, B.stations[0] + 0.2, 30],
	...[0, 1, 2].map((k): [number, number, number] => [B.stationEnds[k] - 0.6, B.stations[k + 1] + 0.2, 28]),
	[B.ship, B.dashboard, 20],
	[B.finalDrop - 1.6, B.finalDrop - 0.6, 14],
];

// The camera punches in only on the story's big hits, never on every beat.
const HITS: [number, number][] = [
	[B.drop, 0.035],
	...B.stations.map((s): [number, number] => [s + 0.1, 0.02]),
	...B.slams.map((s): [number, number] => [s, 0.025]),
	[B.finalDrop, 0.04],
	[B.closedWon, 0.02],
	[B.dbSlam, 0.02],
];

export const punchAt = (t: number) => HITS.reduce((sum, [at, amp]) => sum + amp * hit(t, at, 7), 0);

export const tiltAt = (t: number) => {
	let rx = 0;
	for (const [a, b, amp] of TRAVEL) {
		if (t > a && t < b) rx += amp * Math.sin(Math.PI * ((t - a) / (b - a)));
	}
	return rx;
};

// Camera angles across the whole film: orbit (ry), tilt (rx: up is a crane looking down, below 0 a low angle)
// and roll (rz, the dutch angle). The camera never sits still; it eases from one angle to the next.
type Ang = [number, number, number, number]; // time, rx, ry, rz
const ANG: Ang[] = [
	[0, 14, -24, -4],
	[3.0, 6, 10, 2],
	[B.toChat, 18, 22, 5],
	[B.promptType[0] + 0.2, 22, -10, -3],
	[B.promptType[1], 8, 6, 2],
	[B.cards[0] + 0.2, 4, -14, -2],
	[B.ghost - 0.2, 10, 12, 4],
	[B.clickCompetitor, 6, 0, -6],
	[B.demoBookedCompetitor, 10, -18, 3],
	[15.5, 16, 14, -5],
	[B.slams[1], 4, -6, 8],
	[B.dim + 0.4, 40, 0, 0],
	[21.0, 28, 18, -6],
	[B.drop - 0.3, 10, -30, 0],
	[B.drop + 1.0, 6, 8, 0],
	[B.logoCorner - 0.5, 12, -12, 3],
	[B.stations[0], 20, 22, -4],
	[B.stations[0] + 2, 6, -8, 2],
	[B.topicPick, 10, 10, -3],
	[B.stationEnds[0] - 0.6, 24, -26, 6],
	[B.stations[1] + 0.2, 14, 24, -5],
	[B.keywordSort + 1.4, 6, -6, 2],
	[B.dbView, 12, 12, -3],
	[B.dbSlam - 1.5, 5, -10, 3],
	[B.domainTab - 1.2, 12, 8, -4],
	[B.stationEnds[1] - 0.6, 26, -28, 7],
	[B.stations[2] + 0.2, 14, 26, -6],
	[B.stations[2] + 3, 5, -8, 2],
	[B.stationEnds[2] - 0.6, 26, -24, 6],
	[B.stations[3] + 0.2, 14, 24, -5],
	[B.stations[3] + 3, 6, -10, 2],
	[B.restyle - 0.6, 10, 12, -3],
	[B.fold, 4, -4, 0],
	[B.ship, 30, -20, 10],
	[B.dashboard, 10, 18, -3],
	[B.climb[1], 6, -10, 2],
	[B.finalDrop - 0.6, -6, 20, -8],
	[B.finalDrop, 4, 0, 0],
	[B.finalDrop + 1.9, 10, -14, 3],
	[B.demoBookedYou, 8, 16, -4],
	[B.slams[3] + 0.2, 6, -12, 3],
	[B.closedWon, 4, 6, -2],
	[B.close, 10, -10, 0],
	[B.end, 10, -10, 0],
];

export const angleAt = (t: number) => {
	const i = Math.max(0, ANG.findIndex((k) => k[0] > t) - 1);
	const a = ANG[Math.min(i, ANG.length - 1)];
	const b = ANG[Math.min(i + 1, ANG.length - 1)];
	const p = a === b ? 0 : interpolate(t, [a[0], b[0]], [0, 1], {easing: INOUT, extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
	// handheld: a slow drift that never stops
	const hx = 2 * Math.sin(t * 0.8 + 1) + 0.8 * Math.sin(t * 2.1);
	const hy = 2.5 * Math.sin(t * 0.6) + 0.8 * Math.sin(t * 1.7 + 2);
	const hz = 1.2 * Math.sin(t * 1.1) + 0.6 * Math.sin(t * 2.3 + 1);
	return {rx: a[1] + (b[1] - a[1]) * p + hx, ry: a[2] + (b[2] - a[2]) * p + hy, rz: a[3] + (b[3] - a[3]) * p + hz};
};

// Marks floating above and below the map. They slide past at different speeds, so every move reads as depth.
const DEPTH = Array.from({length: 520}, (_, i) => ({
	x: -3800 + random(`px${i}`) * 21500,
	y: -2900 + random(`py${i}`) * 4200,
	z: random(`pz${i}`) < 0.55 ? -500 - random(`pd${i}`) * 500 : 220 + random(`pd${i}`) * 260,
	s: 8 + random(`ps${i}`) * 12,
	plus: random(`pk${i}`) < 0.5,
}));

// Each mark shifts against the camera by its depth: near ones slide past faster, far ones lag behind.
const Depth: React.FC<{cx: number; cy: number}> = ({cx, cy}) => (
	<>
		{DEPTH.map((d) => {
			const k = d.z > 0 ? d.z / 900 : d.z / 1400;
			return {x: d.x + (d.x - cx) * k, y: d.y + (d.y - cy) * k, size: d.s * (1 + k), near: d.z > 0, plus: d.plus};
		})
			.filter((d) => Math.abs(d.x - cx) < 2600 && Math.abs(d.y - cy) < 1700)
			.map((d, i) => (
				<div key={i} style={{position: 'absolute', left: d.x, top: d.y, width: d.size * 2, height: d.size * 2, opacity: d.near ? 0.28 : 0.4}}>
					{d.plus ? (
						<>
							<span style={{position: 'absolute', left: d.size - 1.5, top: 0, width: 3, height: d.size * 2, background: C.signal}} />
							<span style={{position: 'absolute', top: d.size - 1.5, left: 0, height: 3, width: d.size * 2, background: C.signal}} />
						</>
					) : (
						<span style={{position: 'absolute', inset: d.size * 0.5, background: C.sky}} />
					)}
				</div>
			))}
	</>
);

/** The world, seen through the camera. Children use world coordinates. */
export const World: React.FC<{children: React.ReactNode}> = ({children}) => {
	const t = useT();
	const {width, height} = useVideoConfig();
	const cam = cameraAt(t);
	const travel = tiltAt(t);
	const ang = angleAt(t);
	const rx = ang.rx + travel;
	// Pull back while the camera leans so the edges stay in frame, and punch in on the big hits.
	const lean = Math.abs(ang.ry) / 140 + Math.abs(rx) / 170 + Math.abs(ang.rz) / 120;
	const z = cam.z * (1 - lean) * (1 + punchAt(t));
	// A wider lens while the arrow travels: the map rushes past.
	const lens = 1700 - 550 * Math.min(1, travel / 30);
	return (
		<div style={{position: 'absolute', inset: 0, perspective: lens, perspectiveOrigin: '50% 45%'}}>
			<div
				style={{
					position: 'absolute',
					left: 0,
					top: 0,
					width: 0,
					height: 0,
					transformOrigin: '0 0',
					transform: `translate(${width / 2}px, ${height / 2}px) rotateZ(${ang.rz}deg) rotateX(${rx}deg) rotateY(${ang.ry}deg) scale(${z}) translate(${-cam.x}px, ${-cam.y}px)`,
				}}
			>
				{children}
				<Depth cx={cam.x} cy={cam.y} />
			</div>
		</div>
	);
};
