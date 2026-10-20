import {Composition} from 'remotion';
import {Film} from './Film';
import tl from './timeline.json';

export const Root: React.FC = () => (
	<Composition
		id="ArrowsterrLaunch"
		component={Film}
		durationInFrames={tl.durationSec * tl.fps}
		fps={tl.fps}
		width={1920}
		height={1080}
	/>
);
