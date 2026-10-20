import React from 'react';
import {Easing, interpolate, useVideoConfig} from 'remotion';
import {INOUT, useT} from './lib';
import {STATIONS, WIN_B} from './layout';
import {LOCKUP_CENTER} from './world/LogoReveal';

type Key = {t: number; x: number; y: number; z: number; ease?: (n: number) => number};

const WHIP = Easing.bezier(0.7, 0, 0.18, 1);

// One continuous shot. Each key is where the camera points and how close it is.
const station = (k: number, arrive: number, leave: number): Key[] => {
	const c = STATIONS[k];
	return [
		{t: arrive, x: c.x, y: c.y + 90, z: 0.98},
		{t: leave, x: c.x + 40, y: c.y + 80, z: 1.01},
	];
};

export const KEYS: Key[] = [
	{t: 0, x: 0, y: -220, z: 1.8},
	{t: 1.9, x: 0, y: -220, z: 1.8},
	{t: 5.2, x: 0, y: -205, z: 1.95},
	{t: 7.2, x: 0, y: -20, z: 1.3},
	{t: 9.6, x: 0, y: 10, z: 1.33},
	{t: 10.9, x: 0, y: 120, z: 1.5},
	{t: 11.5, x: 0, y: 118, z: 1.5},
	{t: 12.3, x: 220, y: -30, z: 1.2},
	{t: 15.8, x: 240, y: -30, z: 1.25},
	{t: 17.7, x: 0, y: -130, z: 0.62},
	{t: 22.6, x: 0, y: -110, z: 0.66},
	{t: 24.0, x: 0, y: -40, z: 0.7},
	{t: 28.0, x: 0, y: -40, z: 0.72},
	{t: 29.3, x: 520, y: -10, z: 0.95},
	{t: 31.7, x: LOCKUP_CENTER.x, y: LOCKUP_CENTER.y + 40, z: 0.96},
	{t: 33.3, x: LOCKUP_CENTER.x + 20, y: LOCKUP_CENTER.y + 40, z: 1.0},
	...station(0, 34.2, 37.4),
	...station(1, 38.2, 41.4),
	...station(2, 42.2, 45.4),
	...station(3, 46.2, 49.9),
	{t: 51.4, x: WIN_B.x, y: WIN_B.y - 200, z: 1.6, ease: WHIP},
	{t: 52.6, x: WIN_B.x, y: WIN_B.y - 190, z: 1.66},
	{t: 53.4, x: WIN_B.x - 150, y: WIN_B.y - 80, z: 1.08},
	{t: 54.0, x: WIN_B.x - 60, y: WIN_B.y - 20, z: 1.12},
	{t: 55.0, x: WIN_B.x + 180, y: WIN_B.y + 20, z: 1.0},
	{t: 64, x: WIN_B.x + 240, y: WIN_B.y + 20, z: 1.05},
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
