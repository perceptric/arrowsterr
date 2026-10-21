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

/** How much of a line has been typed, one character at a time. */
export const typed = (text: string, t: number, start: number, end: number) =>
	text.slice(0, Math.floor(tw(t, [start, end], [0, text.length], (n) => n)));

/** A number that rolls toward its target. */
export const roll = (t: number, a: number, b: number, from: number, to: number) =>
	Math.round(tw(t, [a, b], [from, to], Easing.bezier(0.16, 1, 0.3, 1)));

/** A punch that hits at `at` and settles fast: 0 before, 1 on the hit, back to 0 after. */
export const hit = (t: number, at: number, decay = 9) => (t < at ? 0 : Math.exp(-(t - at) * decay));

/** Glitch strength right now: short bursts on the pain beats. */
export const glitchAt = (t: number) => {
	let g = 0;
	for (const at of B.glitches) if (t >= at && t < at + 0.14) g = Math.max(g, 1 - (t - at) / 0.14);
	return g;
};

/** How far the camera's focus sits on a panel (1) versus the open map (0). */
export const focusAt = (t: number) => {
	let f = 0;
	B.stations.forEach((s, k) => {
		f = Math.max(f, Math.min(prog(t, s + 0.3, s + 0.7), 1 - prog(t, B.stationEnds[k] - 0.9, B.stationEnds[k] - 0.5)));
	});
	return f;
};

// Arrive slow, leave fast: the arrow shoots off, then eases into the next pin in slow motion.
export const RAMP = Easing.bezier(0.45, 0, 0.0, 1);
