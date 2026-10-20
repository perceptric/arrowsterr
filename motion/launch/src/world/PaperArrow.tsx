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
export const IMPACT: Pt = {x: WIN_B.x - WIN_W / 2 + 120, y: WIN_B.y + ROW_Y[1]};

type Poly = [number, number][];
const hw = PAGE.w / 2;
const hh = PAGE.h / 2;
// The page's two halves fold into the two wings of a paper arrow pointing right.
const TOP_FROM: Poly = [[-hw, -hh], [hw, -hh], [hw, 0], [-hw, 0]];
const TOP_TO: Poly = [[-150, -92], [150, 0], [150, 0], [-100, 0]];
const BOT_FROM: Poly = [[-hw, 0], [hw, 0], [hw, hh], [-hw, hh]];
const BOT_TO: Poly = [[-100, 0], [150, 0], [150, 0], [-150, 92]];

const mix = (a: Poly, b: Poly, p: number) => a.map(([x, y], i) => `${x + (b[i][0] - x) * p},${y + (b[i][1] - y) * p}`).join(' ');

const WHIP = Easing.bezier(0.7, 0, 0.2, 1);
const LAUNCH_CTRL: Pt = {x: 11200, y: -2300};

const bez = (a: Pt, c: Pt, b: Pt, p: number): Pt => ({
	x: (1 - p) * (1 - p) * a.x + 2 * (1 - p) * p * c.x + p * p * b.x,
	y: (1 - p) * (1 - p) * a.y + 2 * (1 - p) * p * c.y + p * p * b.y,
});

/** Where the paper arrow is, which way it points (degrees) and its size. */
const pose = (t: number) => {
	const fold = B.fold;
	if (t < B.ship) {
		const p = prog(t, fold, fold + 0.9, INOUT);
		return {at: FORM, rot: -26 * p, scale: 1 - 0.15 * p, fold: p};
	}
	if (t < B.ship + 1.3) {
		const p = prog(t, B.ship, B.ship + 1.3, WHIP);
		const at = bez(FORM, LAUNCH_CTRL, PERCH, p);
		const ahead = bez(FORM, LAUNCH_CTRL, PERCH, Math.min(1, p + 0.02));
		const rot = (Math.atan2(ahead.y - at.y, ahead.x - at.x) * 180) / Math.PI;
		return {at, rot: p > 0.98 ? -20 : rot, scale: 0.85 - 0.15 * p, fold: 1};
	}
	if (t < B.finalDrop - 0.5) {
		const bob = Math.sin((t - B.ship) * 3) * 8;
		return {at: {x: PERCH.x, y: PERCH.y + bob}, rot: -20, scale: 0.7, fold: 1};
	}
	const p = prog(t, B.finalDrop - 0.5, B.finalDrop, IN);
	const dir = (Math.atan2(IMPACT.y - PERCH.y, IMPACT.x - PERCH.x) * 180) / Math.PI;
	return {
		at: {x: PERCH.x + (IMPACT.x - PERCH.x) * p, y: PERCH.y + (IMPACT.y - PERCH.y) * p},
		rot: -20 + (dir + 20) * prog(t, B.finalDrop - 0.5, B.finalDrop - 0.3, OUT),
		scale: 0.7 - 0.1 * p,
		fold: 1,
	};
};

const Arrow: React.FC<{t: number; opacity?: number}> = ({t, opacity = 1}) => {
	const {at, rot, scale, fold} = pose(t);
	return (
		<g transform={`translate(${at.x} ${at.y}) rotate(${rot}) scale(${scale})`} opacity={opacity}>
			<polygon points={mix(BOT_FROM, BOT_TO, fold)} fill={C.bg3} stroke={C.lineStrong} strokeWidth={4} strokeLinejoin="round" />
			<polygon points="-100,0 150,0 -118,30" fill={C.bg4} stroke={C.lineStrong} strokeWidth={4} strokeLinejoin="round" opacity={Math.max(0, fold * 5 - 4)} />
			<polygon points={mix(TOP_FROM, TOP_TO, fold)} fill={C.bg} stroke={C.lineStrong} strokeWidth={4} strokeLinejoin="round" />
			<line x1={-100 * fold - hw * (1 - fold)} y1={0} x2={150 * fold + hw * (1 - fold)} y2={0} stroke={C.signal} strokeWidth={5} opacity={fold} />
		</g>
	);
};

export const PaperArrow: React.FC = () => {
	const t = useT();
	const fold = B.fold;
	if (t < fold || t > B.finalDrop + 0.15) return null;
	const gone = 1 - prog(t, B.finalDrop, B.finalDrop + 0.1);
	const flying = t > B.ship && t < B.ship + 1.3;
	return (
		<svg style={{position: 'absolute', left: 8000, top: -3000, overflow: 'visible'}} width={8000} height={4000} viewBox="8000 -3000 8000 4000">
			{flying ? [5, 4, 3, 2, 1].map((k) => <Arrow key={k} t={t - k * 0.018} opacity={0.12 * (6 - k) * 0.4} />) : null}
			<Arrow t={t} opacity={gone} />
		</svg>
	);
};
