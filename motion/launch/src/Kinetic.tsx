import React from 'react';
import {AbsoluteFill} from 'remotion';
import {IN, OUT, prog, useT} from './lib';
import {C, sans} from './theme';

type Word = {w: string; at: number; tone?: 'neg' | 'signal' | 'pos'; br?: boolean};
// Key lines hit the screen word by word, timed to the voice.
const LINES: {from: number; to: number; words: Word[]}[] = [
	{from: 16.2, to: 17.75, words: [{w: 'pipeline', at: 16.35, tone: 'neg'}, {w: 'and', at: 16.75}, {w: 'revenue', at: 16.95, tone: 'neg'}]},
	{
		from: 84.9,
		to: 87.1,
		words: [
			{w: 'That', at: 85.05, tone: 'signal'},
			{w: 'opportunity', at: 85.25, tone: 'signal'},
			{w: 'is', at: 85.9, tone: 'signal', br: true},
			{w: 'yours.', at: 86.1, tone: 'signal'},
		],
	},
];
const TONE = {neg: C.neg, signal: C.signalText, pos: C.pos};

export const Kinetic: React.FC = () => {
	const t = useT();
	const line = LINES.find((l) => t >= l.from && t < l.to);
	if (!line) return null;
	const veil = Math.min(prog(t, line.from, line.from + 0.2), 1 - prog(t, line.to - 0.3, line.to, IN));
	const out = prog(t, line.to - 0.3, line.to, IN);
	return (
		<AbsoluteFill style={{alignItems: 'center', justifyContent: 'center'}}>
			<AbsoluteFill style={{background: C.bg2, opacity: 0.86 * veil}} />
			<div style={{display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '0 40px', maxWidth: 1700, scale: `${1 + out * 0.12}`, opacity: 1 - out}}>
				{line.words.map((w) => {
					const p = prog(t, w.at, w.at + 0.18, OUT);
					return (
						<React.Fragment key={w.w}>
						{w.br ? <span style={{flexBasis: '100%', height: 0}} /> : null}
						<span
							key={w.w}
							style={{
								fontFamily: sans,
								fontWeight: 800,
								fontSize: 168,
								lineHeight: 1.05,
								letterSpacing: -6,
								color: w.tone ? TONE[w.tone] : C.inkStrong,
								opacity: p,
								scale: `${1.45 - 0.45 * p}`,
								filter: `blur(${(1 - p) * 10}px)`,
								translate: `0 ${(1 - p) * 30}px`,
							}}
						>
							{w.w}
						</span>
						</React.Fragment>
					);
				})}
			</div>
		</AbsoluteFill>
	);
};
