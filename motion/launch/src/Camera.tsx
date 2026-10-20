import React from 'react';
import {Easing, interpolate, useVideoConfig} from 'remotion';
import {B, INOUT, useT} from './lib';
import {DASH, STAT, STATIONS, WIN_B} from './layout';
import {LOCKUP_CENTER} from './world/LogoReveal';

type Key = {t: number; x: number; y: number; z: number; ease?: (n: number) => number};

const WHIP = Easing.bezier(0.7, 0, 0.18, 1);

// One continuous shot. Each key is where the camera points and how close it is.
const station = (k: number, arrive: number, leave: number, z = 0.98): Key[] => {
	const c = STATIONS[k];
	return [
		{t: arrive, x: c.x, y: c.y + 90, z},
		{t: leave, x: c.x + 40, y: c.y + 80, z: z + 0.03},
	];
};

export const KEYS: Key[] = [
	{t: 0, x: STAT.x, y: STAT.y - 20, z: 1.08},
	{t: B.toChat, x: STAT.x + 40, y: STAT.y - 20, z: 1.14},
	{t: B.promptType[0] + 0.1, x: 0, y: -220, z: 1.8},
	{t: B.promptType[1] + 0.3, x: 0, y: -210, z: 1.9},
	{t: B.cards[0] - 0.1, x: 0, y: -20, z: 1.3},
	{t: B.ghost - 0.4, x: 0, y: 10, z: 1.33},
	{t: B.ghost + 0.4, x: 0, y: 120, z: 1.5},
	{t: B.clickCompetitor, x: 230, y: 40, z: 1.12},
	{t: B.dim, x: 260, y: 40, z: 1.16},
	{t: B.arrowhead, x: 320, y: 20, z: 0.95},
	{t: B.arrowhead + 1.3, x: 700, y: -10, z: 0.95},
	{t: B.drop - 0.3, x: LOCKUP_CENTER.x, y: LOCKUP_CENTER.y + 120, z: 0.9},
	{t: B.stations[0] - 0.9, x: LOCKUP_CENTER.x + 20, y: LOCKUP_CENTER.y + 120, z: 0.94},
	...station(0, B.stations[0] + 0.2, B.stationEnds[0] - 0.6),
	...station(1, B.stations[1] + 0.2, B.stationEnds[1] - 0.6),
	...station(2, B.stations[2] + 0.2, B.stationEnds[2] - 0.6),
	...station(3, B.stations[3] + 0.2, B.ship, 1.1),
	{t: B.dashboard, x: DASH.x, y: DASH.y, z: 1.3, ease: WHIP},
	{t: B.finalDrop - 1.6, x: DASH.x + 40, y: DASH.y - 10, z: 1.36},
	{t: B.finalDrop - 0.6, x: WIN_B.x - 150, y: WIN_B.y - 80, z: 1.08},
	{t: B.finalDrop, x: WIN_B.x - 60, y: WIN_B.y - 20, z: 1.12},
	{t: B.finalDrop + 1.0, x: WIN_B.x + 180, y: WIN_B.y + 20, z: 1.0},
	{t: B.end, x: WIN_B.x + 240, y: WIN_B.y + 20, z: 1.05},
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

/** The world, seen through the camera. Children use world coordinates. */
export const World: React.FC<{children: React.ReactNode}> = ({children}) => {
	const t = useT();
	const {width, height} = useVideoConfig();
	const cam = cameraAt(t);
	return (
		<div
			style={{
				position: 'absolute',
				left: 0,
				top: 0,
				width: 0,
				height: 0,
				transformOrigin: '0 0',
				transform: `translate(${width / 2}px, ${height / 2}px) scale(${cam.z}) translate(${-cam.x}px, ${-cam.y}px)`,
			}}
		>
			{children}
		</div>
	);
};
