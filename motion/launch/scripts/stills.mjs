// Render a few frames as PNGs to check the picture: node scripts/stills.mjs 3.5 20 54.5
import {bundle} from '@remotion/bundler';
import {renderStill, selectComposition} from '@remotion/renderer';
import path from 'node:path';

const times = process.argv.slice(2).map(Number);
const serveUrl = await bundle({entryPoint: path.resolve('src/index.ts')});
const browserExecutable = process.env.REMOTION_CHROME ?? null;
const composition = await selectComposition({serveUrl, id: 'ArrowsterrLaunch', browserExecutable, chromiumOptions: {gl: 'angle'}});
for (const t of times) {
	const frame = Math.round(t * composition.fps);
	await renderStill({composition, serveUrl, frame, output: `out/stills/t${t.toFixed(1)}.png`, browserExecutable, chromiumOptions: {gl: 'angle'}, scale: 0.5});
	console.log('still', t);
}
