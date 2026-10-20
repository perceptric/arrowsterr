import {loadFont} from '@remotion/fonts';
import {staticFile} from 'remotion';

// Tokens from docs/brand.md (light theme).
export const C = {
	signal: '#0943B0',
	signalText: '#0943B0',
	signalTint: '#EEF3FF',
	signalOnDark: '#8FB0FF',
	sky: '#4F7FE0',
	night: '#0B1B3F',
	onNight2: '#B3C7F2',
	spark: '#F5A70A',
	sparkText: '#8A4B00',
	sparkTint: '#FFF4DC',
	inkStrong: '#0B1B3F',
	ink: '#333333',
	ink2: '#666666',
	ink3: '#707070',
	ink4: '#B3B3B3',
	bg: '#FFFFFF',
	bg2: '#FCFCFC',
	bg3: '#F1F1F1',
	bg4: '#EBEBEB',
	line: '#EBEBEB',
	lineFaint: '#F1F1F1',
	lineStrong: '#D6D6D6',
	pos: '#0B7A54',
	posTint: '#E6F4EE',
	neg: '#C02A35',
	negTint: '#FBEBEC',
} as const;

// Inter's variable font from Google Fonts (latin), shipped with the project so renders never fetch.
const font = (family: string, file: string) => {
	loadFont({family, url: staticFile(`fonts/${file}`), weight: '100 900', format: 'woff2'});
	return `'${family}'`;
};
// Inter only: headings, text and numbers (numbers use tabular figures).
export const sans = font('Inter', 'Inter.woff2');
export const display = sans;
export const mono = sans;

// The mark's three paths, in the 64-unit box the logo files use.
export const MARK = {
	outer:
		'M5.244 61.182 L29.322 26.159 A3.250 3.250 0 0 1 34.678 26.159 L58.756 61.182 Q59.663 62.500 58.063 62.500 L53.375 62.500 Q51.775 62.500 50.868 61.182 L32.000 33.737 L13.132 61.182 Q12.225 62.500 10.625 62.500 L5.937 62.500 Q4.337 62.500 5.244 61.182 Z',
	inner:
		'M18.593 61.182 L29.322 45.575 A3.250 3.250 0 0 1 34.678 45.575 L45.407 61.182 Q46.314 62.500 44.714 62.500 L40.026 62.500 Q38.426 62.500 37.519 61.182 L32.000 53.153 L26.481 61.182 Q25.574 62.500 23.974 62.500 L19.286 62.500 Q17.686 62.500 18.593 61.182 Z',
	sparkle:
		'M32 3.000 C33.760 9.555 33.760 9.555 39.331 11.625 C33.760 13.695 33.760 13.695 32 20.250 C30.241 13.695 30.241 13.695 24.669 11.625 C30.241 9.555 30.241 9.555 32 3.000 Z',
};
