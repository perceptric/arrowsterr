import React from 'react';
import {Easing} from 'remotion';
import {B, IN, INOUT, OUT, prog, useT} from '../lib';
import {PERCH, STATIONS, STATION_H, STATION_W, WIN_B} from '../layout';
import {itemAt} from './AnswerWindow';
import type {Pt} from '../layout';
import {C} from '../theme';
import {PAGE} from './Stations';

const s3 = STATIONS[3];
export const FORM: Pt = {
	x: s3.x - STATION_W / 2 + PAGE.left + PAGE.w / 2,
	y: s3.y - STATION_H / 2 + PAGE.top + PAGE.h / 2,
};
// The arrow lands just left of your row, so the Spark never covers your name.
export const IMPACT: Pt = itemAt(WIN_B, 1, -40);

type Poly = [number, number][];
const hw = PAGE.w / 2;
const hh = PAGE.h / 2;

// A real paper plane, nose to the right: the classic folded plane seen from slightly above.
// Built from the familiar "send" shape (nose, top wing tip, fold point, lower wing tip), turned so it flies right.
const ICON: Record<'nose' | 'top' | 'fold' | 'low', [number, number]> = {nose: [22, 2], top: [2, 9], fold: [11, 13], low: [15, 22]};
const turn = ([x, y]: [number, number]): [number, number] => {
	const a = Math.PI / 4; // the icon flies up-right at 45 degrees
	const dx = x - 12;
	const dy = y - 12;
	return [(dx * Math.cos(a) - dy * Math.sin(a)) * 15, (dx * Math.sin(a) + dy * Math.cos(a)) * 15];
};
const NOSE = turn(ICON.nose);
const TOP = turn(ICON.top);
const FOLD = turn(ICON.fold);
const LOW = turn(ICON.low);
// The page's top half folds into the upper wing, the bottom half into the lower wing.
const TOP_FROM: Poly = [[-hw, -hh], [hw, -hh], [hw, 0], [-hw, 0]];
const TOP_TO: Poly = [TOP, NOSE, NOSE, FOLD];
const BOT_FROM: Poly = [[-hw, 0], [hw, 0], [hw, hh], [-hw, hh]];
const BOT_TO: Poly = [FOLD, NOSE, NOSE, LOW];
const lerp = (a: [number, number], b: [number, number], p: number): [number, number] => [a[0] + (b[0] - a[0]) * p, a[1] + (b[1] - a[1]) * p];
// The keel: the folded body under the wings, in shadow.
const KEEL = [FOLD, lerp(FOLD, LOW, 0.62), lerp(FOLD, NOSE, 0.42)].map(([x, y]) => `${x},${y}`).join(' ');

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
	const flying = t > B.ship ? 1 : prog(t, B.fold + 0.6, B.fold + 0.9);
	return (
		<g opacity={opacity}>
			{/* its shadow on the map while it flies */}
			<ellipse cx={at.x + 40} cy={at.y + 150} rx={150 * scale} ry={26 * scale} fill={C.inkStrong} opacity={0.08 * flying} />
			<g transform={`translate(${at.x} ${at.y}) rotate(${rot}) scale(${scale} ${scale * bank})`}>
				{/* lower wing: the shaded underside */}
				<polygon points={mix(BOT_FROM, BOT_TO, fold)} fill={fold > 0.5 ? '#C9D6EE' : '#EEF2FA'} stroke={C.inkStrong} strokeWidth={3.5} strokeLinejoin="round" />
				{/* the keel, folded under */}
				<polygon points={KEEL} fill="#7F95BF" stroke={C.inkStrong} strokeWidth={3} strokeLinejoin="round" opacity={Math.max(0, fold * 3 - 2)} />
				{/* upper wing: the lit top sheet */}
				<polygon points={mix(TOP_FROM, TOP_TO, fold)} fill={C.bg} stroke={C.inkStrong} strokeWidth={3.5} strokeLinejoin="round" />
				{/* the crease from the nose to the fold */}
				<line x1={NOSE[0]} y1={NOSE[1]} x2={FOLD[0]} y2={FOLD[1]} stroke={C.signal} strokeWidth={4} strokeLinecap="round" opacity={Math.max(0, fold * 3 - 2)} />
				{/* a lighter fold line across the top wing */}
				<line x1={NOSE[0]} y1={NOSE[1]} x2={(TOP[0] + FOLD[0]) / 2} y2={(TOP[1] + FOLD[1]) / 2} stroke="#9AA8C0" strokeWidth={2} strokeLinecap="round" opacity={Math.max(0, fold * 3 - 2)} />
			</g>
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
