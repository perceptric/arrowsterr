import React from 'react';
import {B, prog, roll, typed, useT} from '../lib';
import {STAT} from '../layout';
import {C, display, mono} from '../theme';

// The opening claim. The number and the line live here so they're easy to swap.
export const STAT_VALUE = 92;
const LINE = 'of buyers now begin their buying journey\nby asking AI for product recommendations.';
const PAYOFF = 'asking AI';

/** The opening stat: the number counts up, the line types under it. */
export const Stat: React.FC = () => {
	const t = useT();
	const [c0, c1] = B.statCount;
	const [l0, l1] = B.statType;
	const shown = typed(LINE, t, l0, l1);
	const cut = LINE.indexOf(PAYOFF);
	const before = shown.slice(0, cut);
	const payoff = shown.slice(cut, cut + PAYOFF.length);
	const after = shown.slice(cut + PAYOFF.length);
	const caret = t < l1 + 0.6 && (t < l1 || Math.floor(t * 2) % 2 === 0);
	const appear = prog(t, 0, 0.4);
	return (
		<div style={{position: 'absolute', left: STAT.x - 780, top: STAT.y - 330, width: 1560, opacity: appear, textAlign: 'center'}}>
			<div style={{fontFamily: mono, fontWeight: 500, fontSize: 300, lineHeight: 1, color: C.inkStrong, letterSpacing: -12, fontVariantNumeric: 'tabular-nums'}}>
				{roll(t, c0, c1, 0, STAT_VALUE)}
				<span style={{color: C.signalText}}>%</span>
			</div>
			<div style={{marginTop: 36, fontFamily: display, fontWeight: 500, fontSize: 64, lineHeight: 1.18, color: C.inkStrong, letterSpacing: -1, minHeight: 160, whiteSpace: 'pre-line'}}>
				{before}
				<span style={{color: C.signalText}}>{payoff}</span>
				{after}
				<span style={{display: 'inline-block', width: 4, height: 62, marginLeft: 3, translate: '0 10px', background: C.signal, opacity: caret ? 1 : 0}} />
			</div>
		</div>
	);
};
