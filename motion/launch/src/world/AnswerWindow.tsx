import React from 'react';
import {random} from 'remotion';
import {B, decode, flicker, IN, life, OUT, prog, useT} from '../lib';
import {PROMPT_Y, ROW_H, ROW_Y, WIN_A, WIN_B, WIN_H, WIN_W} from '../layout';
import {C, mono, sans} from '../theme';
import {At, Card, LogoTile, Num, Sparkle, Tag} from './ui';

const PROMPT = "What's the best reservation software for my restaurant?";

type Row = {name: string; you?: boolean; deal: number};

// A slot that drops in like a dealt card: from up-right, a small tilt, settling on the beat.
const dealStyle = (t: number, at: number): React.CSSProperties => {
	const p = prog(t, at - 0.2, at, OUT);
	return {
		opacity: p,
		translate: `${(1 - p) * 120}px ${(1 - p) * -60}px`,
		rotate: `${(1 - p) * -7}deg`,
	};
};

const RowView: React.FC<{rank: number; row: Row; y: number; t: number; pressed?: number; lockAt?: number}> = ({
	rank,
	row,
	y,
	t,
	pressed = 0,
	lockAt,
}) => {
	const lock = lockAt === undefined ? 1 : prog(t, lockAt, lockAt + 0.35);
	return (
		<div
			style={{
				position: 'absolute',
				left: 40,
				right: 40,
				top: WIN_H / 2 + y - ROW_H / 2,
				height: ROW_H,
				display: 'flex',
				alignItems: 'center',
				gap: 20,
				padding: '0 20px',
				borderRadius: 8,
				border: `2px solid ${row.you ? C.signal : C.line}`,
				background: row.you ? C.signalTint : pressed > 0 ? C.bg3 : C.bg,
				...(lockAt === undefined ? dealStyle(t, row.deal) : {opacity: lock, translate: `${(1 - lock) * -80}px 0`}),
			}}
		>
			<span
				style={{
					width: 52,
					height: 36,
					display: 'inline-flex',
					alignItems: 'center',
					justifyContent: 'center',
					borderRadius: 4,
					background: row.you ? C.signal : C.bg3,
				}}
			>
				<Num size={20} color={row.you ? '#fff' : C.ink2}>#{rank}</Num>
			</span>
			<LogoTile name={row.name} size={40} you={row.you} />
			<span style={{fontFamily: sans, fontWeight: 600, fontSize: 25, color: C.inkStrong, flex: 1}}>{row.name}</span>
			<Tag kind={row.you ? 'signal' : 'neutral'} size={17}>
				Recommended
			</Tag>
		</div>
	);
};

const EmptySlot: React.FC<{y: number; t: number; from: number; ghost?: boolean; dissolveAt?: number}> = ({y, t, from, ghost, dissolveAt}) => {
	const show = prog(t, from, from + 0.15);
	const f = ghost ? flicker(t, 'ghost') : 1;
	const gone = dissolveAt ? prog(t, dissolveAt, dissolveAt + 0.6, IN) : 0;
	const jitter = ghost && random(`j-${Math.floor(t * 24)}`) < 0.2 ? (random(`k-${Math.floor(t * 24)}`) - 0.5) * 18 : 0;
	return (
		<div
			style={{
				position: 'absolute',
				left: 40,
				right: 40,
				top: WIN_H / 2 + y - ROW_H / 2,
				height: ROW_H,
				borderRadius: 8,
				border: `2px dashed ${C.lineStrong}`,
				opacity: show,
				display: 'flex',
				alignItems: 'center',
				gap: 20,
				padding: '0 20px',
			}}
		>
			<span style={{width: 52, height: 36, borderRadius: 4, border: `2px dashed ${C.lineStrong}`, display: 'inline-flex', alignItems: 'center', justifyContent: 'center'}}>
				<Num size={20} color={C.ink4}>
					#{ROW_Y.indexOf(y) + 1}
				</Num>
			</span>
			{ghost ? (
				<span
					style={{
						fontFamily: sans,
						fontWeight: 600,
						fontSize: 25,
						color: C.ink3,
						opacity: f * (1 - gone),
						translate: `${jitter}px 0`,
						filter: `blur(${gone * 6}px)`,
						letterSpacing: gone * 14,
					}}
				>
					tablely.com
				</span>
			) : null}
		</div>
	);
};

/** Particles: the ghost name breaking into the dot grid. */
const Dissolve: React.FC<{t: number; at: number; y: number}> = ({t, at, y}) => {
	if (t < at || t > at + 1.6) return null;
	const dots = Array.from({length: 46}, (_, i) => i);
	return (
		<>
			{dots.map((i) => {
				const p = prog(t, at + random(`dd${i}`) * 0.35, at + 1.4, OUT);
				const x0 = 150 + random(`dx${i}`) * 170;
				const y0 = WIN_H / 2 + y + (random(`dy${i}`) - 0.5) * 26;
				const x1 = x0 + (random(`ex${i}`) - 0.3) * 260;
				const y1 = y0 + 140 + random(`ey${i}`) * 260;
				return (
					<div
						key={i}
						style={{
							position: 'absolute',
							left: x0 + (x1 - x0) * p,
							top: y0 + (y1 - y0) * p,
							width: 6,
							height: 6,
							borderRadius: 999,
							background: C.ink3,
							opacity: (1 - p) * 0.9,
						}}
					/>
				);
			})}
		</>
	);
};

export const AnswerWindow: React.FC<{v: 'A' | 'B'}> = ({v}) => {
	const t = useT();
	const isA = v === 'A';
	const center = isA ? WIN_A : WIN_B;
	const typeStart = isA ? 2.0 : B.nextMorning + 0.1;
	const typeEnd = isA ? 4.6 : B.nextMorning + 1.15;
	const chars = decode(PROMPT, t, typeStart, (typeEnd - typeStart) / PROMPT.length, v);
	const typing = t >= typeStart && t < typeEnd + 0.5;
	const blinkOn = Math.floor(t * 2) % 2 === 0 || typing;
	const thinkA = isA ? 5.0 : B.nextMorning + 1.2;
	const listAt = isA ? 7.3 : B.nextMorning + 1.25;
	const dim = isA ? 1 - 0.7 * prog(t, B.silence[0], B.silence[0] + 0.25) : 1;

	const rowsA: Row[] = [
		{name: 'Revora', deal: B.cards[0]},
		{name: 'Guestly', deal: B.cards[1]},
		{name: 'Plateful', deal: B.cards[2]},
	];
	const deal2 = B.nextMorning + 1.35;
	const rowsB: (Row | null)[] = [{name: 'Revora', deal: deal2}, null, {name: 'Guestly', deal: deal2 + 0.15}, {name: 'Plateful', deal: deal2 + 0.3}];

	const pressedRowA = isA && t >= B.clickCompetitor - 0.05 && t < 16.5 ? 1 : 0;

	return (
		<At p={center} w={WIN_W} h={WIN_H} style={{opacity: dim}}>
			<Card>
				{/* header */}
				<div style={{height: 56, display: 'flex', alignItems: 'center', gap: 12, padding: '0 28px', borderBottom: `2px solid ${C.lineFaint}`}}>
					<Sparkle size={22} color={C.signal} />
					<span style={{fontSize: 19, fontWeight: 500, color: C.ink2}}>AI answer</span>
					<span style={{flex: 1}} />
					<Num size={18} color={C.ink3}>
						{isA ? '11:42 PM' : '9:04 AM'}
					</Num>
				</div>
				{/* prompt */}
				<div
					style={{
						position: 'absolute',
						left: 40,
						right: 40,
						top: WIN_H / 2 + PROMPT_Y - 34,
						height: 68,
						borderRadius: 8,
						border: `2px solid ${typing ? C.signal : C.lineStrong}`,
						display: 'flex',
						alignItems: 'center',
						padding: '0 22px',
						fontSize: 25,
						color: C.inkStrong,
						whiteSpace: 'pre',
					}}
				>
					{chars.map((c, i) =>
						c.state === 'hidden' ? null : (
							<span key={i} style={c.state === 'scramble' ? {fontFamily: mono, color: C.signal} : undefined}>
								{c.ch}
							</span>
						),
					)}
					<span style={{width: 3, height: 32, background: C.signal, marginLeft: 3, opacity: blinkOn && t < listAt ? 1 : 0}} />
				</div>
				{/* thinking */}
				<div
					style={{
						position: 'absolute',
						left: 44,
						top: WIN_H / 2 + PROMPT_Y + 58,
						display: 'flex',
						alignItems: 'center',
						gap: 10,
						fontSize: 19,
						color: C.ink3,
						opacity: life(t, thinkA, listAt + 0.6, 0.2, 0.3) * (t < listAt ? 1 : 0) + prog(t, listAt, listAt + 0.3),
					}}
				>
					<Sparkle size={20} color={C.signal} style={{opacity: t < listAt ? 0.4 + 0.6 * Math.abs(Math.sin(t * 6)) : 1}} />
					{t < listAt ? 'Thinking' : 'Top picks for you'}
				</div>
				{/* rows */}
				{isA ? (
					<>
						{rowsA.map((r, i) => (
							<RowView key={r.name} rank={i + 1} row={r} y={ROW_Y[i]} t={t} pressed={i === 0 ? pressedRowA : 0} />
						))}
						<EmptySlot y={ROW_Y[3]} t={t} from={B.ghost} ghost dissolveAt={B.zero} />
						<Dissolve t={t} at={B.zero} y={ROW_Y[3]} />
					</>
				) : (
					<>
						{rowsB.map((r, i) => (r ? <RowView key={r.name} rank={i + 1} row={r} y={ROW_Y[i]} t={t} /> : null))}
						{t < B.finalDrop + 0.1 ? <EmptySlot y={ROW_Y[1]} t={t} from={deal2 + 0.05} /> : null}
						<RowView rank={2} row={{name: 'tablely.com', you: true, deal: 0}} y={ROW_Y[1]} t={t} lockAt={B.finalDrop} />
					</>
				)}
			</Card>
		</At>
	);
};

/** The buyer's pointer: clicks your competitor tonight, you next morning. */
export const buyerCursor = (t: number) => {
	const {clickCompetitor: c1, clickYou: c2} = B;
	if (t > c1 - 0.9 && t < c1 + 1.4) {
		const p = prog(t, c1 - 0.8, c1 - 0.05);
		return {
			p: {x: WIN_A.x + 300 - 120 * p, y: WIN_A.y + 260 - (260 - ROW_Y[0]) * p},
			press: prog(t, c1 - 0.05, c1) * (1 - prog(t, c1 + 0.12, c1 + 0.25)),
			opacity: life(t, c1 - 0.9, c1 + 1.4),
		};
	}
	if (t > c2 - 0.9 && t < c2 + 1.4) {
		const p = prog(t, c2 - 0.8, c2 - 0.05);
		return {
			p: {x: WIN_B.x + 300 - 120 * p, y: WIN_B.y + 260 - (260 - ROW_Y[1]) * p},
			press: prog(t, c2 - 0.05, c2) * (1 - prog(t, c2 + 0.12, c2 + 0.25)),
			opacity: life(t, c2 - 0.9, c2 + 1.4),
		};
	}
	return null;
};
