import {Easing, interpolate, random, useCurrentFrame, useVideoConfig} from 'remotion';
import tl from './timeline.json';

export const TL = tl;
export const B = tl.beats;

// The brand ease: quick out, no overshoot.
export const OUT = Easing.bezier(0.22, 1, 0.36, 1);
export const INOUT = Easing.bezier(0.65, 0, 0.35, 1);
export const IN = Easing.bezier(0.55, 0, 1, 0.45);

/** Seconds since the film started. */
export const useT = () => {
	const frame = useCurrentFrame();
	const {fps} = useVideoConfig();
	return frame / fps;
};

/** Clamped interpolation over seconds. */
export const tw = (
	t: number,
	range: [number, number],
	out: [number, number],
	ease: (n: number) => number = OUT,
) =>
	interpolate(t, range, out, {
		easing: ease,
		extrapolateLeft: 'clamp',
		extrapolateRight: 'clamp',
	});

/** 0 → 1 between two times. */
export const prog = (t: number, a: number, b: number, ease: (n: number) => number = OUT) =>
	tw(t, [a, b], [0, 1], ease);

/** Fade in at `a`, out at `b`. */
export const life = (t: number, a: number, b: number, fadeIn = 0.25, fadeOut = 0.35) =>
	Math.min(prog(t, a, a + fadeIn), 1 - prog(t, b - fadeOut, b, IN));

/** Deterministic flicker for the "dropped signal" ghost. */
export const flicker = (t: number, seed: string) => {
	const step = Math.floor(t * 24);
	const r = random(`${seed}-${step}`);
	return r < 0.18 ? 0.08 : r < 0.3 ? 0.9 : 0.45 + r * 0.25;
};

const GLYPHS = '#%&*+=<>/\\|01{}[]$@';

/** Text that decodes from scrambled characters, left to right. */
export const decode = (text: string, t: number, start: number, perChar: number, seed = 'd') => {
	const chars = [...text];
	const head = (t - start) / perChar;
	return chars.map((ch, i) => {
		if (ch === ' ') return {ch, state: head >= i ? 'done' : 'hidden'} as const;
		if (head >= i + 4) return {ch, state: 'done'} as const;
		if (head >= i) {
			const g = GLYPHS[Math.floor(random(`${seed}-${i}-${Math.floor(t * 30)}`) * GLYPHS.length)];
			return {ch: g, state: 'scramble'} as const;
		}
		return {ch, state: 'hidden'} as const;
	});
};

/** A number that rolls toward its target. */
export const roll = (t: number, a: number, b: number, from: number, to: number) =>
	Math.round(tw(t, [a, b], [from, to], Easing.bezier(0.16, 1, 0.3, 1)));
