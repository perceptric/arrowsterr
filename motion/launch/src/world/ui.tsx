import React from 'react';
import {C, MARK, mono, sans} from '../theme';
import type {Pt} from '../layout';

/** Places children so their center sits on a world point. */
export const At: React.FC<{
	p: Pt;
	w: number;
	h: number;
	style?: React.CSSProperties;
	children?: React.ReactNode;
}> = ({p, w, h, style, children}) => (
	<div style={{position: 'absolute', left: p.x - w / 2, top: p.y - h / 2, width: w, height: h, ...style}}>
		{children}
	</div>
);

/** A product card: white, hairline border, 8px corners, no shadow. */
export const Card: React.FC<{style?: React.CSSProperties; children?: React.ReactNode}> = ({style, children}) => (
	<div
		style={{
			position: 'absolute',
			inset: 0,
			background: C.bg,
			border: `2px solid ${C.line}`,
			borderRadius: 8,
			overflow: 'hidden',
			fontFamily: sans,
			color: C.ink,
			...style,
		}}
	>
		{children}
	</div>
);

type TagKind = 'neutral' | 'neg' | 'pos' | 'signal' | 'spark';
const TAG: Record<TagKind, {bg: string; fg: string}> = {
	neutral: {bg: C.bg3, fg: C.ink2},
	neg: {bg: C.negTint, fg: C.neg},
	pos: {bg: C.posTint, fg: C.pos},
	signal: {bg: C.signalTint, fg: C.signalText},
	spark: {bg: C.sparkTint, fg: C.sparkText},
};

/** A state tag: square corners, tint fill. */
export const Tag: React.FC<{kind?: TagKind; size?: number; children: React.ReactNode; icon?: React.ReactNode}> = ({
	kind = 'neutral',
	size = 18,
	children,
	icon,
}) => (
	<span
		style={{
			display: 'inline-flex',
			alignItems: 'center',
			gap: size * 0.35,
			padding: `${size * 0.22}px ${size * 0.5}px`,
			borderRadius: 4,
			background: TAG[kind].bg,
			color: TAG[kind].fg,
			fontFamily: sans,
			fontWeight: 600,
			fontSize: size,
			lineHeight: 1.2,
			whiteSpace: 'nowrap',
		}}
	>
		{icon}
		{children}
	</span>
);

export const Sparkle: React.FC<{size: number; color: string; style?: React.CSSProperties}> = ({size, color, style}) => (
	<svg width={size} height={size} viewBox="24 2.5 16 18.25" style={style}>
		<path d={MARK.sparkle} fill={color} />
	</svg>
);

/** The Climb: two stacked chevrons. */
export const Climb: React.FC<{size: number; color?: string; style?: React.CSSProperties}> = ({size, color, style}) => (
	<svg width={size} height={size * 0.6} viewBox="4 25 56 38" style={style}>
		<path d={MARK.outer} fill={color ?? C.signal} />
		<path d={MARK.inner} fill={color ?? C.sky} />
	</svg>
);

export const Num: React.FC<{size: number; color?: string; weight?: number; children: React.ReactNode}> = ({
	size,
	color,
	weight = 600,
	children,
}) => (
	<span style={{fontFamily: mono, fontSize: size, color: color ?? C.inkStrong, fontWeight: weight, fontVariantNumeric: 'tabular-nums'}}>
		{children}
	</span>
);

/** A plain pointer, for the buyer's clicks. */
export const Cursor: React.FC<{p: Pt; press: number; opacity: number}> = ({p, press, opacity}) => (
	<svg
		width={44}
		height={56}
		viewBox="0 0 22 28"
		style={{position: 'absolute', left: p.x, top: p.y, opacity, transform: `scale(${1 - press * 0.15})`, transformOrigin: '2px 2px'}}
	>
		<path d="M2 2 L2 22 L7.2 17.2 L10.6 25 L14 23.6 L10.7 15.9 L17.6 15.9 Z" fill={C.inkStrong} stroke="#fff" strokeWidth={1.6} strokeLinejoin="round" />
	</svg>
);

/** A brand tile for a sample company: first letter on a grey square. */
// Custom marks for the made-up brands in the film, each with its own colour and symbol.
export const BRAND_COLOR: Record<string, string> = {
	Acme: '#E8590C',
	Northwind: '#0C8599',
	Globex: '#7048E8',
	Initech: '#212529',
	'Your Brand': '#D6336C',
};

const MARKS: Record<string, React.ReactNode> = {
	// a peak cut like a capital A, with a base block
	Acme: (
		<>
			<path d="M12 4.5 L19.6 19 H15.4 L12 12.4 L8.6 19 H4.4 Z" fill="#fff" />
			<rect x={10.4} y={15.4} width={3.2} height={3.6} fill="#fff" opacity={0.55} />
		</>
	),
	// three gusts of wind
	Northwind: (
		<g fill="none" stroke="#fff" strokeWidth={2.2} strokeLinecap="round">
			<path d="M4.8 9.2 H13.6 A2.6 2.6 0 1 0 11 6.6" />
			<path d="M4.8 13 H16.4 A2.6 2.6 0 1 1 13.8 15.6" />
			<path d="M4.8 16.8 H9.6" opacity={0.55} />
		</g>
	),
	// a planet with a ring crossing in front
	Globex: (
		<>
			<circle cx={12} cy={12} r={5.4} fill="#fff" />
			<ellipse cx={12} cy={12} rx={9} ry={3.1} fill="none" stroke="#7048E8" strokeWidth={3.4} transform="rotate(-24 12 12)" />
			<ellipse cx={12} cy={12} rx={9} ry={3.1} fill="none" stroke="#fff" strokeWidth={1.5} transform="rotate(-24 12 12)" />
		</>
	),
	// a stack of three layers
	Initech: (
		<>
			<path d="M12 4.6 L19 8.4 L12 12.2 L5 8.4 Z" fill="#fff" />
			<path d="M5 12 L12 15.8 L19 12" fill="none" stroke="#fff" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" opacity={0.75} />
			<path d="M5 15.4 L12 19.2 L19 15.4" fill="none" stroke="#fff" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" opacity={0.5} />
		</>
	),
	// four shapes on a 2 × 2 grid
	'Your Brand': (
		<g fill="#fff">
			<path d="M11.4 5 A6.4 6.4 0 0 0 5 11.4 H11.4 Z" />
			<circle cx={15.8} cy={8.2} r={3.2} />
			<rect x={5} y={12.6} width={6.4} height={6.4} opacity={0.6} />
			<path d="M12.6 19 A6.4 6.4 0 0 0 19 12.6 H12.6 Z" />
		</g>
	),
};

/** A brand's logo mark. Falls back to its first letter. */
export const LogoTile: React.FC<{name: string; size: number; you?: boolean}> = ({name, size, you}) =>
	MARKS[name] ? (
		<svg width={size} height={size} viewBox="0 0 24 24" style={{flexShrink: 0}}>
			<rect width={24} height={24} rx={5} fill={BRAND_COLOR[name]} />
			{MARKS[name]}
		</svg>
	) : (
		<span
			style={{
				display: 'inline-flex',
				alignItems: 'center',
				justifyContent: 'center',
				width: size,
				height: size,
				borderRadius: 6,
				background: you ? C.signal : C.bg4,
				color: you ? '#fff' : C.ink2,
				fontFamily: sans,
				fontWeight: 700,
				fontSize: size * 0.48,
				flexShrink: 0,
			}}
		>
			{name[0].toUpperCase()}
		</span>
	);

/** A small calendar glyph. */
export const CalIcon: React.FC<{size: number; color: string}> = ({size, color}) => (
	<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2}>
		<rect x="3" y="5" width="18" height="16" rx="2" />
		<path d="M3 10h18M8 3v4M16 3v4" />
	</svg>
);

/** A single chevron pointing up, for gains. */
export const ChevronUp: React.FC<{size: number; color: string}> = ({size, color}) => (
	<svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke={color} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
		<path d="M3 10.5 8 5.5l5 5" />
	</svg>
);

/** How a number lands: a scale punch and a quick flash. Spread onto the number's style. */
export const slamStyle = (k: number): React.CSSProperties => ({
	display: 'inline-block',
	scale: `${1 + 0.28 * k}`,
	filter: `brightness(${1 + 0.9 * k})`,
	transformOrigin: 'left center',
});

/** The shockwave that goes out when a number lands. */
export const SlamRing: React.FC<{p: Pt; t: number; at: number; color: string; size?: number}> = ({p, t, at, color, size = 1}) => {
	const r = t < at ? 0 : Math.min(1, (t - at) / 0.7);
	if (r <= 0 || r >= 1) return null;
	const e = 1 - Math.pow(1 - r, 3);
	return (
		<svg style={{position: 'absolute', left: p.x - 700, top: p.y - 700, overflow: 'visible', pointerEvents: 'none'}} width={1400} height={1400}>
			{[0, 0.12].map((d, i) => (
				<circle key={i} cx={700} cy={700} r={(80 + Math.max(0, e - d) * 520) * size} fill="none" stroke={color} strokeWidth={12 * (1 - e) + 1} opacity={(1 - e) * (i ? 0.45 : 0.8)} />
			))}
		</svg>
	);
};
