import React from 'react';
import {Easing} from 'remotion';
import {B, IN, INOUT, OUT, prog, useT} from '../lib';
import {PERCH, ROW_Y, STATIONS, STATION_H, STATION_W, WIN_B, WIN_W} from '../layout';
import type {Pt} from '../layout';
import {C} from '../theme';
import {PAGE} from './Stations';

const s3 = STATIONS[3];
export const FORM: Pt = {
	x: s3.x - STATION_W / 2 + PAGE.left + PAGE.w / 2,
	y: s3.y - STATION_H / 2 + PAGE.top + PAGE.h / 2,
};
// The arrow lands just left of your row, so the Spark never covers your name.
export const IMPACT: Pt = {x: WIN_B.x - WIN_W / 2 - 90, y: WIN_B.y + ROW_Y[1]};

type Poly = [number, number][];
const hw = PAGE.w / 2;
const hh = PAGE.h / 2;

// A paper dart pointing right, seen from slightly above: a wide near wing, a narrow far wing
// and a blue keel underneath. The page's halves fold into the two wings.
const NOSE: [number, number] = [190, 0];
const TOP_FROM: Poly = [[-hw, -hh], [hw, -hh], [hw, 0], [-hw, 0]];
const TOP_TO: Poly = [[-150, -110], NOSE, NOSE, [-96, -6]];
const BOT_FROM: Poly = [[-hw, 0], [hw, 0], [hw, hh], [-hw, hh]];
const BOT_TO: Poly = [[-96, -6], NOSE, NOSE, [-140, 58]];
const KEEL = `${NOSE[0]},${NOSE[1]} -96,-6 -118,44`;

const mix = (a: Poly, b: Poly, p: number) => a.map(([x, y], i) => `${x + (b[i][0] - x) * p},${y + (b[i][1] - y) * p}`).join(' ');

const WHIP = Easing.bezier(0.7, 0, 0.2, 1);
const LAUNCH_CTRL: Pt = {x: 12200, y: -2300};

const bez = (a: Pt, c: Pt, b: Pt, p: number): Pt => ({
	x: (1 - p) * (1 - p) * a.x + 2 * (1 - p) * p * c.x + p * p * b.x,
	y: (1 - p) * (1 - p) * a.y + 2 * (1 - p) * p * c.y + p * p * b.y,
});

/** Where the paper arrow is, which way it points (degrees), how it banks and its size. */
const pose = (t: number) => {
	if (t < B.ship) {
		const p = prog(t, B.fold, B.fold + 0.9, INOUT);
		return {at: FORM, rot: -24 * p, bank: 1, scale: 1 - 0.1 * p, fold: p};
	}
	if (t < B.ship + 1.3) {
		const p = prog(t, B.ship, B.ship + 1.3, WHIP);
		const at = bez(FORM, LAUNCH_CTRL, PERCH, p);
		const ahead = bez(FORM, LAUNCH_CTRL, PERCH, Math.min(1, p + 0.02));
		const rot = (Math.atan2(ahead.y - at.y, ahead.x - at.x) * 180) / Math.PI;
		return {at, rot: p > 0.98 ? -18 : rot, bank: Math.cos(p * Math.PI * 2) * 0.25 + 0.75, scale: 0.9 - 0.15 * p, fold: 1};
	}
	if (t < B.finalDrop - 0.5) {
		const k = t - B.ship;
		return {at: {x: PERCH.x, y: PERCH.y + Math.sin(k * 3) * 10}, rot: -18 + Math.sin(k * 2.2) * 3, bank: 0.85 + Math.sin(k * 2.2) * 0.12, scale: 0.75, fold: 1};
	}
	const p = prog(t, B.finalDrop - 0.5, B.finalDrop, IN);
	const dir = (Math.atan2(IMPACT.y - PERCH.y, IMPACT.x - PERCH.x) * 180) / Math.PI;
	return {
		at: {x: PERCH.x + (IMPACT.x - PERCH.x) * p, y: PERCH.y + (IMPACT.y - PERCH.y) * p},
		rot: -18 + (dir + 18) * prog(t, B.finalDrop - 0.5, B.finalDrop - 0.3, OUT),
		bank: 1,
		scale: 0.75 - 0.15 * p,
		fold: 1,
	};
};

const Arrow: React.FC<{t: number; opacity?: number}> = ({t, opacity = 1}) => {
	const {at, rot, bank, scale, fold} = pose(t);
	const keel = Math.max(0, fold * 4 - 3);
	return (
		<g transform={`translate(${at.x} ${at.y}) rotate(${rot}) scale(${scale} ${scale * bank})`} opacity={opacity}>
			<polygon points={KEEL} fill={C.signal} opacity={keel} />
			<polygon points={mix(BOT_FROM, BOT_TO, fold)} fill="#E4EBFA" stroke={C.inkStrong} strokeWidth={3} strokeLinejoin="round" />
			<polygon points={mix(TOP_FROM, TOP_TO, fold)} fill={C.bg} stroke={C.inkStrong} strokeWidth={3} strokeLinejoin="round" />
			{/* the centre crease */}
			<line x1={-96 * fold - hw * (1 - fold)} y1={-6 * fold} x2={NOSE[0] * fold + hw * (1 - fold)} y2={0} stroke={C.signal} strokeWidth={4} opacity={fold} />
		</g>
	);
};

export const PaperArrow: React.FC = () => {
	const t = useT();
	if (t < B.fold || t > B.finalDrop + 0.15) return null;
	const gone = 1 - prog(t, B.finalDrop, B.finalDrop + 0.1);
	// A dashed contrail behind the arrow while it flies.
	const trail: Pt[] = [];
	if (t > B.ship && t < B.ship + 2.0) {
		for (let k = 1; k <= 24; k++) {
			const tt = t - k * 0.03;
			if (tt < B.ship) break;
			trail.push(pose(tt).at);
		}
	}
	const trailFade = 1 - prog(t, B.ship + 1.3, B.ship + 2.0);
	return (
		<svg style={{position: 'absolute', left: 8000, top: -3000, overflow: 'visible'}} width={10000} height={4000} viewBox="8000 -3000 10000 4000">
			{trail.length > 1 ? (
				<polyline points={trail.map((p) => `${p.x},${p.y}`).join(' ')} fill="none" stroke={C.signal} strokeWidth={6} strokeDasharray="18 16" strokeLinecap="round" opacity={0.5 * trailFade} />
			) : null}
			<Arrow t={t} opacity={gone} />
		</svg>
	);
};
