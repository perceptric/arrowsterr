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
			fontWeight: 500,
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
	weight = 500,
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
export const LogoTile: React.FC<{name: string; size: number; you?: boolean}> = ({name, size, you}) => (
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
			fontWeight: 600,
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
