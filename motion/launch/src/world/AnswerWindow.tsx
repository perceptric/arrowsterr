import React from 'react';
import {random} from 'remotion';
import {B, flicker, IN, OUT, prog, typed, useT} from '../lib';
import {WIN_A, WIN_B, WIN_H, WIN_W} from '../layout';
import type {Pt} from '../layout';
import {C, sans} from '../theme';
import {ChatGPT, GptItem} from './Platforms';
import {At, Card, Tag} from './ui';

const PROMPT = "What's the best reservation software for my restaurant?";

// Where things sit inside a ChatGPT window, from its top-left corner.
const MAIN_X = 210 + 48;
const ITEM_TOP = 46 + 152 + 40;
const itemY = (i: number) => ITEM_TOP + i * 48 + 15;
/** World position of a list item's row, `dx` along it. */
export const itemAt = (win: Pt, i: number, dx: number): Pt => ({x: win.x - WIN_W / 2 + MAIN_X + dx, y: win.y - WIN_H / 2 + itemY(i)});

const ITEMS_A: GptItem[] = [
	{brand: 'Acme', domain: 'acme.com', line: 'best overall for busy dining rooms.'},
	{brand: 'Northwind', domain: 'northwind.io', line: 'strong waitlist and table tools.'},
	{brand: 'Globex', domain: 'globex.com', line: 'good value for small teams.'},
];
const ITEMS_B: GptItem[] = [
	{brand: 'Acme', domain: 'acme.com', line: 'best overall for busy dining rooms.'},
	{brand: 'Your Brand', domain: 'yourbrand.com', line: 'top pick for independent restaurants.'},
	{brand: 'Northwind', domain: 'northwind.io', line: 'strong waitlist and table tools.'},
	{brand: 'Globex', domain: 'globex.com', line: 'good value for small teams.'},
];

/** Particles: the missing name breaking apart into the grid. */
const Dissolve: React.FC<{t: number; at: number}> = ({t, at}) => {
	if (t < at || t > at + 1.6) return null;
	return (
		<>
			{Array.from({length: 46}, (_, i) => {
				const p = prog(t, at + random(`dd${i}`) * 0.35, at + 1.4, OUT);
				const x0 = MAIN_X + 20 + random(`dx${i}`) * 170;
				const y0 = itemY(3) + (random(`dy${i}`) - 0.5) * 26;
				const x1 = x0 + (random(`ex${i}`) - 0.3) * 260;
				const y1 = y0 + 120 + random(`ey${i}`) * 200;
				return <div key={i} style={{position: 'absolute', left: x0 + (x1 - x0) * p, top: y0 + (y1 - y0) * p, width: 6, height: 6, borderRadius: 999, background: C.ink3, opacity: (1 - p) * 0.9}} />;
			})}
		</>
	);
};

/** The slot where your brand should be: a dashed row that flickers, then breaks apart. */
const Missing: React.FC<{t: number}> = ({t}) => {
	const show = prog(t, B.ghost, B.ghost + 0.25, OUT);
	if (show <= 0) return null;
	const f = flicker(t, 'ghost');
	const gone = prog(t, B.zero, B.zero + 0.6, IN);
	const jitter = random(`j-${Math.floor(t * 24)}`) < 0.2 ? (random(`k-${Math.floor(t * 24)}`) - 0.5) * 18 : 0;
	return (
		<div
			style={{
				position: 'absolute',
				left: MAIN_X - 14,
				width: 470,
				top: itemY(3) - 22,
				height: 44,
				border: `2px dashed ${C.neg}`,
				borderRadius: 8,
				background: C.negTint,
				display: 'flex',
				alignItems: 'center',
				gap: 12,
				padding: '0 14px',
				fontFamily: sans,
				opacity: show * (1 - gone * 0.6),
				translate: `${(1 - show) * 30}px 0`,
			}}
		>
			<span style={{fontSize: 19, color: C.ink3}}>4.</span>
			<span style={{fontSize: 19, fontWeight: 700, color: C.ink3, flex: 1, opacity: f * (1 - gone), translate: `${jitter}px 0`, filter: `blur(${gone * 6}px)`, letterSpacing: gone * 14}}>Your Brand</span>
			<Tag kind="neg" size={15}>
				Not mentioned
			</Tag>
		</div>
	);
};

export const AnswerWindow: React.FC<{v: 'A' | 'B'}> = ({v}) => {
	const t = useT();
	const isA = v === 'A';
	const [ty0, ty1] = B.promptType;
	const dim = isA ? 1 - 0.7 * prog(t, B.dim, B.dim + 0.4) : 1;
	if (isA) {
		const sent = prog(t, ty1 + 0.05, ty1 + 0.3, OUT);
		return (
			<At p={WIN_A} w={WIN_W} h={WIN_H} style={{opacity: dim}}>
				<Card style={{borderColor: C.lineStrong}}>
					<ChatGPT
						t={t}
						prompt={PROMPT}
						typed={sent > 0 ? '' : typed(PROMPT, t, ty0, ty1)}
						sent={sent}
						intro={prog(t, ty1 + 0.3, ty1 + 0.35)}
						items={ITEMS_A}
						itemOn={B.cards.map((c) => prog(t, c, c + 0.3))}
						cited={prog(t, B.clickCompetitor - 0.05, B.clickCompetitor)}
					/>
					<Missing t={t} />
					<Dissolve t={t} at={B.zero} />
				</Card>
			</At>
		);
	}
	// A few weeks later: the same question, and the paper arrow lands your brand in slot #2.
	const deal = B.finalDrop - 1.6;
	const lock = prog(t, B.finalDrop, B.finalDrop + 0.35, OUT);
	return (
		<At p={WIN_B} w={WIN_W} h={WIN_H}>
			<Card style={{borderColor: C.lineStrong}}>
				<ChatGPT
					t={t}
					prompt={PROMPT}
					typed=""
					sent={1}
					intro={1}
					items={ITEMS_B}
					itemOn={[prog(t, deal, deal + 0.3), lock, prog(t, deal + 0.15, deal + 0.45), prog(t, deal + 0.3, deal + 0.6)]}
					hi={1}
					slot={1}
					highlight={prog(t, B.finalDrop + 0.2, B.finalDrop + 0.5, OUT)}
					cited={prog(t, B.clickYou - 0.05, B.clickYou)}
				/>
			</Card>
		</At>
	);
};

/** The buyer's pointer: clicks your competitor's source tonight, yours a few weeks later. */
export const buyerCursor = (t: number) => {
	const clicks = [
		{at: B.clickCompetitor, to: itemAt(WIN_A, 0, 512)},
		{at: B.clickYou, to: itemAt(WIN_B, 1, 562)},
	];
	for (const c of clicks) {
		if (t > c.at - 0.9 && t < c.at + 1.4) {
			const p = prog(t, c.at - 0.8, c.at - 0.05);
			return {
				p: {x: c.to.x + 160 * (1 - p), y: c.to.y + 220 * (1 - p)},
				press: prog(t, c.at - 0.05, c.at) * (1 - prog(t, c.at + 0.12, c.at + 0.25)),
				opacity: Math.min(prog(t, c.at - 0.9, c.at - 0.65), 1 - prog(t, c.at + 1.05, c.at + 1.4, IN)),
			};
		}
	}
	return null;
};
