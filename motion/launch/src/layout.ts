// Where everything sits on the one big map. World pixels; the camera flies over them.

export type Pt = {x: number; y: number};

// The opening stat, then the buyer's AI answer: tonight and a few weeks later.
export const STAT: Pt = {x: -2300, y: -160};
export const WIN_A: Pt = {x: 0, y: 0};
export const WIN_B: Pt = {x: 14200, y: -1650};
// The Arrowsterr dashboard, between the last station and the answer.
export const DASH: Pt = {x: 12100, y: -1250};
export const DASH_W = 1120;
export const DASH_H = 640;
export const WIN_W = 980;
export const WIN_H = 640;
// Row centers inside a window, relative to its center.
export const ROW_Y = [-78, 4, 86, 168];
export const ROW_H = 68;
export const PROMPT_Y = -232;

// The five engines, in an arc above tonight's answer.
export const ENGINES = [
	{name: 'ChatGPT', file: 'engines/chatgpt.jpg', at: {x: -1180, y: -300}},
	{name: 'Claude', file: 'engines/claude.webp', at: {x: -700, y: -640}},
	{name: 'Gemini', file: 'engines/gemini.webp', at: {x: 0, y: -740}},
	{name: 'Perplexity', file: 'engines/perplexity.png', at: {x: 700, y: -640}},
	{name: 'Google AI', file: 'engines/google.png', at: {x: 1180, y: -300}},
];
export const BEAM_FROM: Pt = {x: 0, y: -320};
export const COUNTER_A: Pt = {x: 0, y: 470};

// The logo moment.
export const LOGO: Pt = {x: 2500, y: -120}; // bottom center of the mark
export const MARK_H = 260;

// The four stations, climbing up and to the right.
export const STATION_W = 1040;
export const STATION_H = 620;
export const STATIONS: Pt[] = [0, 1, 2, 3].map((k) => ({x: 4300 + 1800 * k, y: -150 - 230 * k}));
export const pinOf = (c: Pt): Pt => ({x: c.x - STATION_W / 2 - 40, y: c.y + STATION_H / 2 + 90});

// The route: tonight's answer → logo → each station → past the last one.
export const ROUTE_START: Pt = {x: WIN_A.x + WIN_W / 2 + 60, y: 40};
export const ROUTE_END: Pt = {x: STATIONS[3].x + STATION_W / 2 + 120, y: pinOf(STATIONS[3]).y};

// Where the paper arrow waits before it dives into slot #2.
export const PERCH: Pt = {x: WIN_B.x - 760, y: WIN_B.y - 420};
export const CAL_A: Pt = {x: WIN_A.x + WIN_W / 2 + 240, y: -60};
export const CAL_B: Pt = {x: WIN_B.x + WIN_W / 2 + 240, y: WIN_B.y - 40};
