import React from 'react';
import {AbsoluteFill, Solid, staticFile, useVideoConfig} from 'remotion';
import {Audio} from '@remotion/media';
import {CameraMotionBlur} from '@remotion/motion-blur';
import {lightLeak} from '@remotion/effects/light-leak';
import {World} from './Camera';
import {Close} from './Close';
import {B, prog, useT} from './lib';
import {C} from './theme';
import {AnswerWindow, buyerCursor} from './world/AnswerWindow';
import {CalCard, Deal, Missed} from './world/Check';
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
const DotGrid: React.FC = () => (
	<svg style={{position: 'absolute', left: -4000, top: -4000}} width={22000} height={7000}>
		<defs>
			<pattern id="dots" width={GRID} height={GRID} patternUnits="userSpaceOnUse">
				<circle cx={GRID / 2} cy={GRID / 2} r={1.8} fill={C.lineStrong} />
			</pattern>
		</defs>
		<rect width={22000} height={7000} fill="url(#dots)" />
	</svg>
);

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

export const Film: React.FC = () => {
	const t = useT();
	const whip = t > B.ship + 0.05 && t < B.ship + 1.35;
	return (
		<AbsoluteFill style={{background: C.bg2}}>
			{whip ? (
				<CameraMotionBlur shutterAngle={220} samples={14}>
					<Scene />
				</CameraMotionBlur>
			) : (
				<Scene />
			)}
			<Leak />
			<Close />
			<Audio src={staticFile('audio/mix.m4a')} />
		</AbsoluteFill>
	);
};
