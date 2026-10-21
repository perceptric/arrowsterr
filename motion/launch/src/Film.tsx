import React from 'react';
import {AbsoluteFill, Img, Solid, staticFile, useVideoConfig} from 'remotion';
import {Audio} from '@remotion/media';
import {CameraMotionBlur} from '@remotion/motion-blur';
import {lightLeak} from '@remotion/effects/light-leak';
import {World} from './Camera';
import {Close} from './Close';
import {B, focusAt, glitchAt, INOUT, prog, useT} from './lib';
import {Kinetic} from './Kinetic';
import {random} from 'remotion';
import {C} from './theme';
import {AnswerWindow, buyerCursor} from './world/AnswerWindow';
import {CalCard, Deal, Missed, Slams} from './world/Check';
import {Dashboard} from './world/Dashboard';
import {LogoReveal} from './world/LogoReveal';
import {PaperArrow} from './world/PaperArrow';
import {Route} from './world/Route';
import {Stat} from './world/Stat';
import {Stations} from './world/Stations';
import {Cursor} from './world/ui';
import {SparkBurst} from './world/Win';

const GRID = 22;

/** The flight grid: dots on bg-2, laid across the whole map. */
// When the camera focuses on a panel, the dots swell and fade like an out-of-focus background.
const DotGrid: React.FC = () => {
	const f = focusAt(useT());
	return (
		<svg style={{position: 'absolute', left: -4000, top: -4000}} width={23000} height={7000}>
			<defs>
				<pattern id="dots" width={GRID} height={GRID} patternUnits="userSpaceOnUse">
					<circle cx={GRID / 2} cy={GRID / 2} r={1.8 + f * 3.2} fill={C.lineStrong} opacity={1 - f * 0.65} />
				</pattern>
			</defs>
			<rect width={23000} height={7000} fill="url(#dots)" />
		</svg>
	);
};

const Scene: React.FC = () => {
	const t = useT();
	const cursor = buyerCursor(t);
	return (
		<AbsoluteFill style={{background: C.bg2}}>
			<World>
				<DotGrid />
				<Stat />
				<AnswerWindow v="A" />
				<CalCard v="A" />
				<Missed />
				<Stations />
				<LogoReveal />
				<Route />
				<Dashboard />
				<AnswerWindow v="B" />
				<CalCard v="B" />
				<Deal />
				<Slams />
				<SparkBurst />
				<PaperArrow />
				{cursor ? <Cursor {...cursor} /> : null}
			</World>
		</AbsoluteFill>
	);
};

/** Warm light leak over the win, the only gold wash in the film. */
const Leak: React.FC = () => {
	const t = useT();
	const {width, height} = useVideoConfig();
	const a = B.finalDrop;
	if (t < a || t > a + 1.8) return null;
	return (
		<AbsoluteFill style={{mixBlendMode: 'screen', opacity: 0.45}}>
			<Solid width={width} height={height} color="transparent" effects={[lightLeak({seed: 3, hueShift: 0, progress: prog(t, a, a + 1.8, (n) => n)})]} />
		</AbsoluteFill>
	);
};

// After the logo moment the lockup flies to the top-left corner and hovers there through the features.
const LOGO_RATIO = 623.62 / 114.67;
const LogoBadge: React.FC = () => {
	const t = useT();
	if (t < B.logoCorner || t > B.close + 0.1) return null;
	const p = prog(t, B.logoCorner, B.logoCorner + 0.8, INOUT);
	const h = 236 + (46 - 236) * p;
	const w = h * LOGO_RATIO;
	const cx = 960 + (60 + 46 * LOGO_RATIO * 0.5 - 960) * p;
	const cy = 470 + (48 + 23 - 470) * p;
	const hover = p >= 1 ? Math.sin((t - B.logoCorner) * 2.2) * 3 : 0;
	return (
		<Img
			src={staticFile('brand/arrowsterr-logo-color.svg')}
			style={{position: 'absolute', left: cx - w / 2, top: cy - h / 2 + hover, width: w, height: h, opacity: 1 - prog(t, B.close - 0.1, B.close + 0.1)}}
		/>
	);
};

// The fast middle of each speed ramp gets motion blur.
const BLUR: [number, number][] = [
	[B.ship + 0.05, B.ship + 1.35],
	[B.stations[0] - 0.9, B.stations[0] - 0.2],
	...[0, 1, 2].map((k): [number, number] => [B.stationEnds[k] - 0.6, B.stations[k + 1] - 0.3]),
];

/** A bad-signal tear: colour edges split and a few bands of the frame slip sideways. */
const Glitch: React.FC<{g: number}> = ({g}) => {
	const t = useT();
	const step = Math.floor(t * 30);
	return (
		<>
			<AbsoluteFill style={{filter: `drop-shadow(${10 * g}px 0 0 rgba(192, 42, 53, 0.55)) drop-shadow(${-10 * g}px 0 0 rgba(9, 67, 176, 0.55))`}}>
				<Scene />
			</AbsoluteFill>
			{[0, 1, 2].map((i) => {
				const y0 = random(`gy${step}-${i}`) * 85;
				const h = 3 + random(`gh${step}-${i}`) * 9;
				const dx = (random(`gx${step}-${i}`) - 0.5) * 140 * g;
				return (
					<AbsoluteFill key={i} style={{clipPath: `inset(${y0}% 0 ${100 - y0 - h}% 0)`, translate: `${dx}px 0`}}>
						<Scene />
					</AbsoluteFill>
				);
			})}
		</>
	);
};

export const Film: React.FC = () => {
	const t = useT();
	const blur = BLUR.some(([a, b]) => t > a && t < b);
	const g = glitchAt(t);
	return (
		<AbsoluteFill style={{background: C.bg2}}>
			{g > 0 ? (
				<Glitch g={g} />
			) : blur ? (
				<CameraMotionBlur shutterAngle={220} samples={10}>
					<Scene />
				</CameraMotionBlur>
			) : (
				<Scene />
			)}
			<LogoBadge />
			<Kinetic />
			<Leak />
			<Close />
			<Audio src={staticFile('audio/mix.m4a')} />
		</AbsoluteFill>
	);
};
