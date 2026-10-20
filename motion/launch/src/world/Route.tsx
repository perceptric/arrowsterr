import React from 'react';
import {getLength, getPointAtLength, getTangentAtLength} from '@remotion/paths';
import {B, INOUT, OUT, life, prog, useT} from '../lib';
import {LOGO, ROUTE_END, ROUTE_START, STATIONS, STATION_W, pinOf} from '../layout';
import {C, mono, sans} from '../theme';

const p0 = pinOf(STATIONS[0]);

// Each leg of the route, with when the arrowhead leaves and arrives.
const LEGS: {d: string; from: number; to: number; len: number}[] = (
	[
	{d: `M ${ROUTE_START.x} ${ROUTE_START.y} C 1400 40, 2200 220, ${LOGO.x} ${LOGO.y}`, from: B.arrowhead + 0.6, to: B.drop - 0.15},
	{d: `M ${LOGO.x} ${LOGO.y} C ${LOGO.x + 500} ${LOGO.y + 60}, ${p0.x - 500} ${p0.y}, ${p0.x} ${p0.y}`, from: B.stations[0] - 0.8, to: B.stations[0]},
	...[0, 1, 2].map((k) => {
		const a = pinOf(STATIONS[k]);
		const b = pinOf(STATIONS[k + 1]);
		const under = a.x + STATION_W + 80;
		return {
			d: `M ${a.x} ${a.y} L ${under} ${a.y} C ${under + 260} ${a.y}, ${b.x - 260} ${b.y}, ${b.x} ${b.y}`,
			from: B.stations[k],
			to: B.stations[k + 1],
		};
	}),
	{
		d: `M ${pinOf(STATIONS[3]).x} ${pinOf(STATIONS[3]).y} L ${ROUTE_END.x} ${ROUTE_END.y}`,
		from: B.stations[3],
		to: B.stations[3] + 2.6,
	},
	] as {d: string; from: number; to: number}[]
).map((l) => ({...l, len: getLength(l.d)}));

const NAMES = ['See', 'Find', 'Plan', 'Create'];

/** Where the arrowhead is and which way it points. */
export const arrowheadAt = (t: number) => {
	let leg = LEGS[0];
	let p = 0;
	for (const l of LEGS) {
		if (t >= l.from) {
			leg = l;
			p = prog(t, l.from, l.to, INOUT);
		}
	}
	const pt = getPointAtLength(leg.d, leg.len * p);
	const tan = getTangentAtLength(leg.d, Math.max(0.5, leg.len * p));
	return {x: pt?.x ?? 0, y: pt?.y ?? 0, angle: Math.atan2(tan?.y ?? 0, tan?.x ?? 1)};
};

export const Route: React.FC = () => {
	const t = useT();
	if (t < B.arrowhead) return null;
	const head = arrowheadAt(t);
	const born = prog(t, B.arrowhead, B.arrowhead + 0.4);
	// The arrowhead hides inside the mark while the logo builds, then heads out again.
	const inLogo = prog(t, B.drop - 0.15, B.drop) * (1 - prog(t, B.stations[0] - 0.9, B.stations[0] - 0.7));
	const headOut = (1 - prog(t, B.stations[3] + 2.6, B.stations[3] + 3.1)) * (1 - inLogo);
	const glow = 0.5 + 0.5 * Math.sin(t * 6);
	return (
		<svg style={{position: 'absolute', left: -1000, top: -3000, overflow: 'visible'}} width={14000} height={6000} viewBox="-1000 -3000 14000 6000">
			{LEGS.map((l, i) => {
				const p = prog(t, l.from, l.to, INOUT);
				// The first leg has done its job once the logo lands; it clears the way for the tagline.
				const fade = i === 0 ? 1 - prog(t, B.drop + 0.6, B.drop + 1.0) : 1;
				if (p <= 0 || fade <= 0) return null;
				return (
					<g key={i} opacity={fade}>
						<path d={l.d} fill="none" stroke={C.signal} strokeOpacity={0.14} strokeWidth={30} strokeLinecap="round" strokeDasharray={l.len} strokeDashoffset={l.len * (1 - p)} />
						<path d={l.d} fill="none" stroke={C.signal} strokeWidth={9} strokeLinecap="round" strokeDasharray={l.len} strokeDashoffset={l.len * (1 - p)} />
					</g>
				);
			})}
			{/* waypoint pins drop as the arrowhead reaches them */}
			{STATIONS.map((s, k) => {
				const pin = pinOf(s);
				const drop = prog(t, B.stations[k] - 0.15, B.stations[k] + 0.25, OUT);
				if (drop <= 0) return null;
				return (
					<g key={k} transform={`translate(${pin.x} ${pin.y - (1 - drop) * 80})`} opacity={drop}>
						<circle r={16} fill={C.bg} stroke={C.signal} strokeWidth={8} />
						<line x1={0} y1={-16} x2={0} y2={-70} stroke={C.signal} strokeWidth={5} />
						<g transform="translate(-6 -134)">
							<rect width={190} height={64} rx={4} fill={C.signal} />
							<text x={20} y={42} fill="#fff" fontFamily={mono} fontSize={26} fontWeight={500}>
								{`0${k + 1}`}
							</text>
							<text x={72} y={43} fill="#fff" fontFamily={sans} fontSize={30} fontWeight={600}>
								{NAMES[k]}
							</text>
						</g>
					</g>
				);
			})}
			{/* the arrowhead */}
			<g transform={`translate(${head.x} ${head.y}) rotate(${(head.angle * 180) / Math.PI}) scale(${born})`} opacity={headOut * life(t, B.arrowhead, 99)}>
				<circle r={60 + glow * 16} fill={C.signal} opacity={0.1 + glow * 0.06} />
				<circle r={38} fill={C.signal} opacity={0.16} />
				<path d="M 34 0 L -22 -26 L -10 0 L -22 26 Z" fill={C.signal} stroke="#fff" strokeWidth={4} strokeLinejoin="round" />
			</g>
		</svg>
	);
};
