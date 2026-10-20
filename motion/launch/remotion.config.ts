import {Config} from '@remotion/cli/config';

Config.setVideoImageFormat('jpeg');
Config.setJpegQuality(92);
// WebGL for the light leak.
Config.setChromiumOpenGlRenderer('angle');
// Point at a local Chrome when Remotion can't download its own (sandboxes, CI).
if (process.env.REMOTION_CHROME) {
	Config.setBrowserExecutable(process.env.REMOTION_CHROME);
}
