import React from 'react';
import {Img, staticFile} from 'remotion';
import {hit, OUT, prog} from '../lib';
import {C, sans} from '../theme';
import {Face} from './People';
import {Cursor, LogoTile} from './ui';

// Look-alikes of the tools buyers and sellers use every day, built with Inter only.
// They sit inside a Perceptric frame (2px black line, hard blue shadow) with a plain browser bar on top.

export const EMOJI = `${sans}, 'Noto Color Emoji'`;

const Icon: React.FC<{d: string; size?: number; color?: string; fill?: boolean; sw?: number}> = ({d, size = 22, color = '#666', fill, sw = 1.8}) => (
	<svg width={size} height={size} viewBox="0 0 24 24" fill={fill ? color : 'none'} stroke={fill ? 'none' : color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" style={{flexShrink: 0}}>
		<path d={d} />
	</svg>
);
const I = {
	search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4',
	home: 'M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
	people: 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21c0-4 3-6 7-6s7 2 7 6M16 3.5a4 4 0 0 1 0 7.5M18 15c2.5.6 4 2.5 4 6',
	bag: 'M4 8h16v12H4zM9 8V5h6v3',
	chat: 'M4 5h16v11H8l-4 4z',
	bell: 'M6 16V11a6 6 0 1 1 12 0v5l2 2H4zM10 20a2 2 0 0 0 4 0',
	thumb: 'M7 10v10H4V10zM7 10l4-7c1.5 0 2.5 1 2 3l-1 4h6.5a2 2 0 0 1 2 2.4l-1.4 6A2 2 0 0 1 17.2 20H7',
	comment: 'M4 5h16v11H9l-5 4z',
	repost: 'M17 3l3 3-3 3M4 11V9a3 3 0 0 1 3-3h13M7 21l-3-3 3-3M20 13v2a3 3 0 0 1-3 3H4',
	send: 'M21 3L10 14M21 3l-7 18-4-7-7-4z',
	globe: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18',
	plus: 'M12 5v14M5 12h14',
	mic: 'M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM5 11a7 7 0 0 0 14 0M12 18v3',
	pen: 'M4 20l4-1 11-11-3-3L5 16zM14 6l3 3',
	clock: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7v5l3 2',
	video: 'M3 7h12v10H3zM15 10l6-3v10l-6-3',
	cal: 'M4 5h16v15H4zM4 10h16M9 3v4M15 3v4',
	check: 'M5 12.5l4.5 4.5L19 7',
	chevL: 'M15 5l-7 7 7 7',
	chevR: 'M9 5l7 7-7 7',
	chevD: 'M6 9l6 6 6-6',
	x: 'M6 6l12 12M18 6L6 18',
	grid: 'M5 5h2v2H5zM11 5h2v2h-2zM17 5h2v2h-2zM5 11h2v2H5zM11 11h2v2h-2zM17 11h2v2h-2zM5 17h2v2H5zM11 17h2v2h-2zM17 17h2v2h-2z',
	star: 'M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z',
	gear: 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM4 12h2M18 12h2M12 4v2M12 18v2M6.3 6.3l1.4 1.4M16.3 16.3l1.4 1.4M6.3 17.7l1.4-1.4M16.3 7.7l1.4-1.4',
	help: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .8-1 1.5V14M12 17h.01',
};

/** The browser around every tool: three dots and the address. */
export const Browser: React.FC<{url: string; children: React.ReactNode; bg?: string}> = ({url, children, bg = '#fff'}) => (
	<div style={{position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', background: bg, fontFamily: sans}}>
		<div style={{height: 46, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 16, padding: '0 18px', background: '#EEF0F3', borderBottom: `2px solid ${C.line}`}}>
			<div style={{display: 'flex', gap: 8}}>
				{['#FF5F57', '#FEBC2E', '#28C840'].map((c) => (
					<span key={c} style={{width: 13, height: 13, borderRadius: 99, background: c}} />
				))}
			</div>
			<div style={{flex: 1, height: 30, borderRadius: 8, background: '#fff', display: 'flex', alignItems: 'center', gap: 8, padding: '0 14px', fontSize: 15, color: '#5F6368'}}>
				<svg width={12} height={14} viewBox="0 0 12 14">
					<rect x={1} y={6} width={10} height={7} rx={1.5} fill="#5F6368" />
					<path d="M3 6V4a3 3 0 0 1 6 0v2" fill="none" stroke="#5F6368" strokeWidth={1.6} />
				</svg>
				{url}
			</div>
		</div>
		<div style={{flex: 1, position: 'relative', overflow: 'hidden'}}>{children}</div>
	</div>
);

// ---------- LinkedIn ----------

export const LI = {bg: '#F4F2EE', card: '#FFFFFF', line: '#E0DFDC', ink: '#191919', sub: '#666666', blue: '#0A66C2'};
export const REACTIONS = [
	{e: '👍', label: 'Like', color: '#0A66C2', bg: '#DCEBFA'},
	{e: '👏', label: 'Celebrate', color: '#44712E', bg: '#E1F0D8'},
	{e: '❤️', label: 'Love', color: '#CB112D', bg: '#FBE0E3'},
	{e: '💡', label: 'Insightful', color: '#915907', bg: '#FBEFD5'},
	{e: '😂', label: 'Funny', color: '#1A707E', bg: '#D9F1F5'},
];

export const LinkedInNav: React.FC<{me?: string}> = ({me}) => (
	<div style={{height: 60, display: 'flex', alignItems: 'center', gap: 14, padding: '0 22px', background: '#fff', borderBottom: `1px solid ${LI.line}`}}>
		<span style={{width: 36, height: 36, borderRadius: 5, background: LI.blue, color: '#fff', fontSize: 23, fontWeight: 800, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', letterSpacing: -1}}>in</span>
		<div style={{width: 210, height: 36, borderRadius: 4, background: '#EDF3F8', display: 'flex', alignItems: 'center', gap: 8, padding: '0 12px', fontSize: 16, color: LI.sub}}>
			<Icon d={I.search} size={18} color="#444" />
			Search
		</div>
		<span style={{flex: 1}} />
		{[
			['Home', I.home],
			['Network', I.people],
			['Jobs', I.bag],
			['Messaging', I.chat],
			['Alerts', I.bell],
		].map(([l, d], i) => (
			<div key={l} style={{display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, width: 64, color: i === 0 ? LI.ink : LI.sub, borderBottom: i === 0 ? `2px solid ${LI.ink}` : '2px solid transparent', paddingBottom: 2}}>
				<Icon d={d} size={22} color={i === 0 ? LI.ink : LI.sub} fill={i === 0} />
				<span style={{fontSize: 12}}>{l}</span>
			</div>
		))}
		{me ? <Face file={me} size={32} style={{borderWidth: 0}} /> : null}
	</div>
);

/** A cluster of reaction emoji, as LinkedIn shows them over the reaction count. */
const ReactionCluster: React.FC<{list: number[]; size?: number}> = ({list, size = 24}) => (
	<span style={{display: 'inline-flex'}}>
		{list.map((r, i) => (
			<span
				key={r}
				style={{
					width: size,
					height: size,
					marginLeft: i ? -6 : 0,
					borderRadius: 99,
					background: REACTIONS[r].bg,
					border: '2px solid #fff',
					display: 'inline-flex',
					alignItems: 'center',
					justifyContent: 'center',
					fontSize: size * 0.58,
					fontFamily: EMOJI,
					zIndex: 3 - i,
				}}
			>
				{REACTIONS[r].e}
			</span>
		))}
	</span>
);

export type LiAuthor = {face?: string; brand?: string; name: string; headline: string; degree?: string};

/** One LinkedIn post: header, text, a graphic, the reactions row and the action bar.
 *  `picker` (0–1) shows the reaction menu; `react` (0–1) applies Sarah's reaction `pick`. */
export const LinkedInPost: React.FC<{
	author: LiAuthor;
	text: string;
	graphic?: React.ReactNode;
	count: number;
	comments: number;
	cluster: number[];
	picker?: number;
	react?: number;
	pick?: number;
	reactor?: string;
	pop?: number;
	w: number;
	style?: React.CSSProperties;
}> = ({author, text, graphic, count, comments, cluster, picker = 0, react = 0, pick = 0, reactor, pop = 0, w, style}) => {
	const r = REACTIONS[pick];
	return (
		<div style={{width: w, background: LI.card, border: `1px solid ${LI.line}`, borderRadius: 10, fontFamily: sans, color: LI.ink, position: 'relative', ...style}}>
			<div style={{display: 'flex', alignItems: 'flex-start', gap: 12, padding: '14px 16px 8px'}}>
				{author.face ? <Face file={author.face} size={56} style={{borderWidth: 0}} /> : <LogoTile name={author.brand!} size={56} />}
				<div style={{display: 'flex', flexDirection: 'column', flex: 1, lineHeight: 1.3}}>
					<span style={{fontSize: 19, fontWeight: 700}}>
						{author.name} <span style={{fontWeight: 400, color: LI.sub}}>· {author.degree ?? '2nd'}</span>
					</span>
					<span style={{fontSize: 15, color: LI.sub}}>{author.headline}</span>
					<span style={{fontSize: 14, color: LI.sub, display: 'flex', alignItems: 'center', gap: 4}}>
						2h · <Icon d={I.globe} size={14} color={LI.sub} />
					</span>
				</div>
				<span style={{fontSize: 18, fontWeight: 700, color: LI.blue}}>+ Follow</span>
			</div>
			<div style={{padding: '2px 16px 12px', fontSize: 18, lineHeight: 1.4}}>
				{text} <span style={{color: LI.sub}}>…more</span>
			</div>
			{graphic ? <div style={{borderTop: `1px solid ${LI.line}`, borderBottom: `1px solid ${LI.line}`}}>{graphic}</div> : null}
			<div style={{display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', fontSize: 15, color: LI.sub}}>
				<ReactionCluster list={react > 0.5 && !cluster.includes(pick) ? [pick, ...cluster.slice(0, 2)] : cluster} />
				<span style={{flex: 1}}>
					{react > 0.5 && reactor ? (
						<>
							<span style={{color: LI.ink, fontWeight: 600}}>{reactor}</span> and {count.toLocaleString('en-US')} others
						</>
					) : (
						count.toLocaleString('en-US')
					)}
				</span>
				<span>
					{comments} comments · {Math.round(comments / 4)} reposts
				</span>
			</div>
			<div style={{margin: '0 16px', borderTop: `1px solid ${LI.line}`}} />
			<div style={{display: 'flex', justifyContent: 'space-around', padding: '6px 8px 8px'}}>
				{[
					['Like', I.thumb],
					['Comment', I.comment],
					['Repost', I.repost],
					['Send', I.send],
				].map(([l, d], i) => {
					const on = i === 0 && react > 0.5;
					return (
						<div key={l} style={{display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderRadius: 4, fontSize: 17, fontWeight: 600, color: on ? r.color : LI.sub, background: i === 0 && picker > 0 && react < 0.5 ? '#EBEBEB' : 'transparent'}}>
							{on ? <span style={{fontFamily: EMOJI, fontSize: 22, display: 'inline-block', scale: `${1 + 0.5 * pop}`}}>{r.e}</span> : <Icon d={d} size={22} color={LI.sub} />}
							{on ? r.label : l}
						</div>
					);
				})}
			</div>
			{/* the reaction menu over the Like button */}
			{picker > 0 ? (
				<div
					style={{
						position: 'absolute',
						left: 14,
						bottom: 62,
						display: 'flex',
						gap: 6,
						padding: '8px 12px',
						background: '#fff',
						borderRadius: 999,
						boxShadow: '0 4px 16px rgba(0,0,0,0.18), 0 0 0 1px rgba(0,0,0,0.08)',
						opacity: picker,
						translate: `0 ${(1 - picker) * 14}px`,
						zIndex: 5,
					}}
				>
					{REACTIONS.map((x, i) => {
						const hov = i === pick ? prog(picker, 0.6, 1) : 0;
						return (
							<span key={x.label} style={{position: 'relative', fontFamily: EMOJI, fontSize: 34, lineHeight: 1, display: 'inline-block', scale: `${1 + 0.45 * hov}`, translate: `0 ${-10 * hov}px`, transformOrigin: '50% 100%'}}>
								{x.e}
								{hov > 0.5 ? (
									<span style={{position: 'absolute', left: '50%', top: -34, translate: '-50% 0', background: '#333', color: '#fff', fontFamily: sans, fontSize: 13, fontWeight: 600, padding: '3px 8px', borderRadius: 4, whiteSpace: 'nowrap'}}>{x.label}</span>
								) : null}
							</span>
						);
					})}
				</div>
			) : null}
		</div>
	);
};

/** Sarah's cursor going for the Like button: returns the menu and reaction progress for a reaction at `at`. */
export const reactAt = (t: number, at: number) => ({
	picker: prog(t, at - 0.75, at - 0.5, OUT) * (1 - prog(t, at + 0.05, at + 0.2)),
	react: prog(t, at, at + 0.15),
	pop: hit(t, at, 8),
});

// ---------- ChatGPT ----------

export const GPT = {ink: '#0D0D0D', sub: '#5D5D5D', side: '#F9F9F9', bubble: '#F4F4F4', line: '#E5E5E5'};

/** A source chip as ChatGPT shows them after a sentence. */
export const SourceChip: React.FC<{brand: string; domain: string; on?: number}> = ({brand, domain, on = 0}) => (
	<span
		style={{
			display: 'inline-flex',
			alignItems: 'center',
			gap: 6,
			padding: '3px 10px 3px 4px',
			borderRadius: 999,
			background: on > 0.5 ? '#E3ECFF' : GPT.bubble,
			color: on > 0.5 ? '#1F4FD8' : GPT.sub,
			fontSize: 14,
			fontWeight: 500,
			verticalAlign: 'middle',
			marginLeft: 6,
			boxShadow: on > 0.5 ? `0 0 0 2px #1F4FD8` : 'none',
		}}
	>
		<LogoTile name={brand} size={18} />
		{domain}
	</span>
);

export type GptItem = {brand: string; domain: string; line: string};

/** ChatGPT: a sidebar, the user's question, and an answer that lists brands with sources. */
export const ChatGPT: React.FC<{
	t: number;
	prompt: string;
	typed: string;
	sent: number;
	intro: number;
	items: GptItem[];
	itemOn: number[];
	highlight?: number;
	cited?: number;
	hi?: number;
	slot?: number;
}> = ({t, prompt, typed, sent, intro, items, itemOn, highlight = 0, cited = 0, hi = 0, slot = -1}) => (
	<Browser url="chatgpt.com">
		<div style={{position: 'absolute', inset: 0, display: 'flex', fontFamily: sans, color: GPT.ink}}>
			<div style={{width: 210, background: GPT.side, borderRight: `1px solid ${GPT.line}`, padding: '16px 12px', display: 'flex', flexDirection: 'column', gap: 6, fontSize: 15}}>
				{[
					[I.pen, 'New chat'],
					[I.search, 'Search chats'],
				].map(([d, l]) => (
					<div key={l} style={{display: 'flex', alignItems: 'center', gap: 10, padding: '7px 8px'}}>
						<Icon d={d} size={18} color={GPT.ink} />
						{l}
					</div>
				))}
				<span style={{fontSize: 13, color: '#8F8F8F', padding: '14px 8px 4px'}}>Chats</span>
				{['Friday staffing plan', 'Spring menu pricing', 'No-show policy draft', 'Wine list ideas'].map((l, i) => (
					<div key={l} style={{padding: '7px 8px', borderRadius: 8, background: i === 0 && sent > 0 ? '#ECECEC' : 'transparent', whiteSpace: 'nowrap', overflow: 'hidden'}}>
						{i === 0 && sent > 0 ? 'Best reservation software' : l}
					</div>
				))}
			</div>
			<div style={{flex: 1, position: 'relative'}}>
				<div style={{height: 56, display: 'flex', alignItems: 'center', gap: 6, padding: '0 22px', fontSize: 20, fontWeight: 600}}>
					ChatGPT <span style={{color: '#8F8F8F', fontWeight: 500}}>5</span>
					<Icon d={I.chevD} size={16} color="#8F8F8F" />
				</div>
				{/* the question, sent */}
				<div style={{position: 'absolute', right: 40, top: 70, maxWidth: 560, padding: '12px 20px', borderRadius: 22, background: GPT.bubble, fontSize: 19, lineHeight: 1.45, opacity: sent, translate: `0 ${(1 - sent) * 30}px`}}>{prompt}</div>
				{/* the answer */}
				<div style={{position: 'absolute', left: 48, right: 48, top: 152, height: 260, fontSize: 19, lineHeight: 1.5}}>
					{intro > 0 && itemOn[0] <= 0 ? <span style={{display: 'inline-block', width: 14, height: 14, borderRadius: 99, background: GPT.ink, opacity: 0.4 + 0.6 * Math.abs(Math.sin(t * 6))}} /> : null}
					<div style={{opacity: itemOn[0] > 0 ? 1 : 0}}>Here are the top reservation platforms for restaurants right now:</div>
					{items.map((it, i) => {
						const on = itemOn[i];
						const hl = i === hi ? highlight : 0;
						const top = 40 + i * 48;
						if (i === slot && on < 1) {
							// the slot your brand will take: empty until it lands
							return itemOn[0] > 0 ? <div key={it.brand} style={{position: 'absolute', left: 0, right: 0, top: top - 6, height: 40, border: `2px dashed ${C.lineStrong}`, borderRadius: 8, opacity: itemOn[0]}} /> : null;
						}
						return (
							<div key={it.brand} style={{position: 'absolute', left: 0, right: 0, top, height: 30, display: 'flex', alignItems: 'center', gap: 10, whiteSpace: 'nowrap', opacity: on, translate: `${i === slot ? (1 - on) * -60 : 0}px ${i === slot ? 0 : (1 - on) * 12}px`}}>
								<span style={{width: 22, flexShrink: 0}}>{i + 1}.</span>
								<span>
									<b style={{fontWeight: 700}}>{it.brand}</b> — {it.line}
								</span>
								<SourceChip brand={it.brand} domain={it.domain} on={i === hi ? cited : 0} />
								{hl > 0 ? (
									<span style={{position: 'absolute', left: -14, right: -14, top: -9, bottom: -9, border: `3px solid ${C.signal}`, borderRadius: 8, background: 'rgba(9, 67, 176, 0.06)', opacity: hl, scale: `${1.04 - 0.04 * hl}`}} />
								) : null}
							</div>
						);
					})}
				</div>
				{/* the composer */}
				<div style={{position: 'absolute', left: 48, right: 48, bottom: 40, height: 64, borderRadius: 32, border: `1px solid ${GPT.line}`, boxShadow: '0 2px 10px rgba(0,0,0,0.06)', background: '#fff', display: 'flex', alignItems: 'center', gap: 14, padding: '0 14px 0 20px', fontSize: 19}}>
					<Icon d={I.plus} size={22} color={GPT.ink} />
					<span style={{flex: 1, color: typed ? GPT.ink : '#8F8F8F', whiteSpace: 'nowrap', overflow: 'hidden'}}>
						{typed || 'Ask anything'}
						{typed && sent <= 0 ? <span style={{display: 'inline-block', width: 2, height: 22, background: GPT.ink, marginLeft: 2, verticalAlign: 'middle'}} /> : null}
					</span>
					<Icon d={I.mic} size={22} color={GPT.ink} />
					<span style={{width: 40, height: 40, borderRadius: 99, background: typed && sent <= 0 ? GPT.ink : '#D7D7D7', display: 'inline-flex', alignItems: 'center', justifyContent: 'center'}}>
						<svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round">
							<path d="M12 19V5M5 12l7-7 7 7" />
						</svg>
					</span>
				</div>
				<div style={{position: 'absolute', left: 0, right: 0, bottom: 12, textAlign: 'center', fontSize: 13, color: '#8F8F8F'}}>ChatGPT can make mistakes. Check important info.</div>
			</div>
		</div>
	</Browser>
);

// ---------- Google ----------

export const GoogleWord: React.FC<{size: number}> = ({size}) => (
	<span style={{fontFamily: sans, fontSize: size, fontWeight: 600, letterSpacing: -size * 0.04}}>
		{[
			['G', '#4285F4'],
			['o', '#EA4335'],
			['o', '#FBBC05'],
			['g', '#4285F4'],
			['l', '#34A853'],
			['e', '#EA4335'],
		].map(([c, col], i) => (
			<span key={i} style={{color: col}}>
				{c}
			</span>
		))}
	</span>
);

export type Result = {brand: string; site: string; url: string; title: string; snippet: string};

export const ResultView: React.FC<{r: Result; visited?: boolean; style?: React.CSSProperties}> = ({r, visited, style}) => (
	<div style={{display: 'flex', flexDirection: 'column', gap: 4, fontFamily: sans, ...style}}>
		<div style={{display: 'flex', alignItems: 'center', gap: 12}}>
			<span style={{width: 34, height: 34, borderRadius: 99, background: '#F1F3F4', border: '1px solid #DADCE0', display: 'inline-flex', alignItems: 'center', justifyContent: 'center'}}>
				<LogoTile name={r.brand} size={22} />
			</span>
			<div style={{display: 'flex', flexDirection: 'column', lineHeight: 1.25}}>
				<span style={{fontSize: 16, color: '#202124'}}>{r.site}</span>
				<span style={{fontSize: 14, color: '#4D5156'}}>{r.url}</span>
			</div>
		</div>
		<span style={{fontSize: 24, color: visited ? '#681DA8' : '#1A0DAB', lineHeight: 1.3, textDecoration: visited ? 'underline' : 'none'}}>{r.title}</span>
		<span style={{fontSize: 16, color: '#4D5156', lineHeight: 1.5}}>{r.snippet}</span>
	</div>
);

/** Google: the search box, tabs, and organic results. `results` is drawn by the caller. */
export const Google: React.FC<{query: string; caret: boolean; me: string; children: React.ReactNode}> = ({query, caret, me, children}) => (
	<Browser url={`google.com/search?q=${query.replace(/ /g, '+')}`}>
		<div style={{position: 'absolute', inset: 0, fontFamily: sans}}>
			<div style={{display: 'flex', alignItems: 'center', gap: 26, padding: '18px 28px 10px'}}>
				<GoogleWord size={34} />
				<div style={{flex: 1, height: 52, borderRadius: 26, border: '1px solid #DFE1E5', boxShadow: '0 1px 6px rgba(32,33,36,0.18)', display: 'flex', alignItems: 'center', gap: 14, padding: '0 18px 0 22px', fontSize: 19, color: '#202124'}}>
					<span style={{flex: 1, whiteSpace: 'nowrap', overflow: 'hidden'}}>
						{query}
						{caret ? <span style={{display: 'inline-block', width: 2, height: 22, background: '#202124', marginLeft: 2, verticalAlign: 'middle'}} /> : null}
					</span>
					<Icon d={I.x} size={20} color="#70757A" />
					<span style={{width: 1, height: 26, background: '#DFE1E5'}} />
					<Icon d={I.mic} size={22} color="#4285F4" />
					<Icon d={I.search} size={22} color="#4285F4" sw={2.4} />
				</div>
				<Icon d={I.grid} size={24} color="#5F6368" fill />
				<Face file={me} size={38} style={{borderWidth: 0}} />
			</div>
			<div style={{display: 'flex', gap: 26, padding: '0 0 0 120px', fontSize: 16, color: '#5F6368', borderBottom: '1px solid #EBEBEB'}}>
				{['All', 'Images', 'Videos', 'News', 'Shopping', 'Web', 'More'].map((x, i) => (
					<span key={x} style={{padding: '10px 2px', color: i === 0 ? '#1A73E8' : '#5F6368', fontWeight: i === 0 ? 600 : 400, borderBottom: i === 0 ? '3px solid #1A73E8' : '3px solid transparent'}}>
						{x}
					</span>
				))}
			</div>
			<div style={{position: 'absolute', left: 120, right: 60, top: 150}}>
				<div style={{fontSize: 15, color: '#70757A', marginBottom: 18}}>About 48,200,000 results (0.38 seconds)</div>
				<div style={{position: 'relative'}}>{children}</div>
			</div>
		</div>
	</Browser>
);

// ---------- Calendly ----------

const CAL_BLUE = '#006BFF';

/** Calendly: pick a day, pick a time, then "You are scheduled". Clicks land at the three times in `clicks`; `done` flips to the confirmation. */
export const Calendly: React.FC<{t: number; company: string; host: string; hostName: string; clicks: [number, number, number]; done: number; url: string}> = ({
	t,
	company,
	host,
	hostName,
	clicks,
	done,
	url,
}) => {
	const [c0, c1, c2] = clicks;
	const dayOn = prog(t, c0, c0 + 0.1);
	const timeOn = prog(t, c1, c1 + 0.1);
	const conf = prog(t, done, done + 0.3, OUT);
	// the cursor travels: to the 6th, to 10:00am, to Next
	const pts = [
		{x: 700, y: 520},
		{x: 593, y: 178},
		{x: 879, y: 200},
		{x: 942, y: 200},
	];
	const leg = t < c0 ? 0 : t < c1 ? 1 : 2;
	const from = pts[leg];
	const to = pts[leg + 1];
	const a = [c0 - 0.6, c0, c1][leg];
	const b = [c0, c1, c2][leg];
	const m = prog(t, a + (b - a) * 0.2, b - 0.05);
	const cur = {x: from.x + (to.x - from.x) * m, y: from.y + (to.y - from.y) * m};
	const press = Math.max(hit(t, c0, 14), hit(t, c1, 14), hit(t, c2, 14));
	const days = Array.from({length: 30}, (_, i) => i + 1);
	const free = (d: number) => {
		const dow = (d - 1) % 7; // Nov 1 2026 is a Sunday
		return d >= 3 && dow !== 0 && dow !== 6;
	};
	return (
		<Browser url={url}>
			<div style={{position: 'absolute', inset: 0, display: 'flex', fontFamily: sans, color: '#1A1A1A'}}>
				<div style={{width: 330, borderRight: '1px solid #E7E7E7', padding: '30px 28px', display: 'flex', flexDirection: 'column', gap: 12}}>
					<Face file={host} size={64} style={{borderWidth: 0}} />
					<span style={{fontSize: 17, color: '#666', fontWeight: 600}}>
						{hostName} · {company}
					</span>
					<span style={{fontSize: 30, fontWeight: 700, letterSpacing: -0.5}}>Product Demo</span>
					<span style={{display: 'flex', alignItems: 'center', gap: 10, fontSize: 17, color: '#666', fontWeight: 600}}>
						<Icon d={I.clock} size={22} color="#666" /> 30 min
					</span>
					<span style={{display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: 17, color: '#666', fontWeight: 600, lineHeight: 1.35}}>
						<Icon d={I.video} size={22} color="#666" /> Web conferencing details provided upon confirmation.
					</span>
					<span style={{display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: 17, color: '#666', fontWeight: 600, lineHeight: 1.35, opacity: timeOn}}>
						<Icon d={I.cal} size={22} color="#666" /> 10:00am – 10:30am, Thursday, November 5, 2026
					</span>
					<span style={{display: 'flex', alignItems: 'center', gap: 10, fontSize: 17, color: '#666', fontWeight: 600, opacity: timeOn}}>
						<Icon d={I.globe} size={22} color="#666" /> Eastern Time
					</span>
				</div>
				<div style={{flex: 1, position: 'relative'}}>
					<div style={{position: 'absolute', inset: 0, padding: '30px 32px', opacity: 1 - conf}}>
						<div style={{fontSize: 24, fontWeight: 700, marginBottom: 20}}>Select a Date & Time</div>
						<div style={{display: 'flex', gap: 30}}>
							<div style={{width: 360}}>
								<div style={{display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 26, fontSize: 18, marginBottom: 16}}>
									<Icon d={I.chevL} size={20} color="#B2B2B2" />
									November 2026
									<span style={{width: 34, height: 34, borderRadius: 99, background: '#E6F0FF', display: 'inline-flex', alignItems: 'center', justifyContent: 'center'}}>
										<Icon d={I.chevR} size={18} color={CAL_BLUE} sw={2.4} />
									</span>
								</div>
								<div style={{display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', rowGap: 6, textAlign: 'center'}}>
									{['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'].map((d) => (
										<span key={d} style={{fontSize: 12, color: '#1A1A1A', paddingBottom: 6}}>
											{d}
										</span>
									))}
									{days.map((d) => {
										const sel = d === 5 && dayOn > 0.5;
										const f = free(d);
										return (
											<span key={d} style={{display: 'flex', justifyContent: 'center'}}>
												<span
													style={{
														width: 44,
														height: 44,
														borderRadius: 99,
														display: 'inline-flex',
														alignItems: 'center',
														justifyContent: 'center',
														fontSize: 17,
														fontWeight: f ? 700 : 400,
														color: sel ? '#fff' : f ? CAL_BLUE : '#B2B2B2',
														background: sel ? CAL_BLUE : f ? '#EEF4FF' : 'transparent',
													}}
												>
													{d}
												</span>
											</span>
										);
									})}
								</div>
							</div>
							<div style={{flex: 1, display: 'flex', flexDirection: 'column', gap: 10, opacity: dayOn, translate: `${(1 - dayOn) * 30}px 0`}}>
								<span style={{fontSize: 17, marginBottom: 6}}>Thursday, November 5</span>
								{['9:30am', '10:00am', '11:00am', '1:30pm', '3:00pm'].map((x, i) => {
									const split = i === 1 && timeOn > 0.5;
									return split ? (
										<div key={x} style={{display: 'flex', gap: 8, height: 52}}>
											<span style={{flex: 1, borderRadius: 6, background: '#666', color: '#fff', fontSize: 17, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center'}}>{x}</span>
											<span style={{flex: 1, borderRadius: 6, background: CAL_BLUE, color: '#fff', fontSize: 17, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center'}}>Next</span>
										</div>
									) : (
										<span key={x} style={{height: 52, borderRadius: 6, border: `1.5px solid ${CAL_BLUE}80`, color: CAL_BLUE, fontSize: 17, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
											{x}
										</span>
									);
								})}
							</div>
						</div>
					</div>
					{/* the confirmation */}
					{conf > 0 ? (
						<div style={{position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, opacity: conf, scale: `${0.96 + 0.04 * conf}`}}>
							<span style={{width: 64, height: 64, borderRadius: 99, background: '#00A2FF1A', display: 'inline-flex', alignItems: 'center', justifyContent: 'center'}}>
								<span style={{width: 44, height: 44, borderRadius: 99, background: '#00875A', display: 'inline-flex', alignItems: 'center', justifyContent: 'center'}}>
									<Icon d={I.check} size={28} color="#fff" sw={3} />
								</span>
							</span>
							<span style={{fontSize: 30, fontWeight: 700}}>You are scheduled</span>
							<span style={{fontSize: 17, color: '#666'}}>A calendar invitation has been sent to your email address.</span>
							<div style={{marginTop: 8, padding: '18px 24px', border: '1px solid #E7E7E7', borderRadius: 8, display: 'flex', flexDirection: 'column', gap: 10, fontSize: 17, color: '#666', fontWeight: 600}}>
								<span style={{fontSize: 20, color: '#1A1A1A', fontWeight: 700}}>Product Demo · {company}</span>
								<span style={{display: 'flex', alignItems: 'center', gap: 10}}>
									<Icon d={I.cal} size={20} color="#666" /> 10:00am – 10:30am, Thursday, November 5
								</span>
							</div>
						</div>
					) : null}
				</div>
				{c0 > 0 && t > c0 - 0.6 && t < done + 0.3 ? <Cursor p={cur} press={press} opacity={Math.min(prog(t, c0 - 0.6, c0 - 0.4), 1 - prog(t, done, done + 0.3))} /> : null}
			</div>
		</Browser>
	);
};

// ---------- Salesforce ----------

export const SF = {bg: '#F3F3F3', line: '#DDDBDA', ink: '#181818', sub: '#444444', blue: '#0176D3', nav: '#FFFFFF'};

/** Salesforce Lightning: the global header with search, the app's tab bar, and a grey page. */
export const Salesforce: React.FC<{query: string; caret: boolean; tab: string; me: string; children: React.ReactNode; url: string}> = ({query, caret, tab, me, children, url}) => (
	<Browser url={url} bg={SF.bg}>
		<div style={{position: 'absolute', inset: 0, fontFamily: sans, color: SF.ink}}>
			<div style={{height: 56, background: '#fff', borderBottom: `1px solid ${SF.line}`, display: 'flex', alignItems: 'center', gap: 16, padding: '0 20px'}}>
				<span style={{width: 40, height: 28, borderRadius: 14, background: '#00A1E0', display: 'inline-block'}} />
				<span style={{flex: 1}} />
				<div style={{width: 440, height: 36, borderRadius: 4, border: '1px solid #C9C9C9', background: '#fff', display: 'flex', alignItems: 'center', gap: 10, padding: '0 12px', fontSize: 16, color: query ? SF.ink : '#747474'}}>
					<Icon d={I.search} size={18} color="#747474" />
					{query || 'Search...'}
					{caret ? <span style={{display: 'inline-block', width: 2, height: 20, background: SF.ink, marginLeft: -8}} /> : null}
				</div>
				<span style={{flex: 1}} />
				{[I.star, I.plus, I.help, I.gear, I.bell].map((d) => (
					<Icon key={d} d={d} size={20} color="#747474" />
				))}
				<Face file={me} size={32} style={{borderWidth: 0}} />
			</div>
			<div style={{height: 46, background: SF.nav, borderBottom: `3px solid ${SF.blue}`, display: 'flex', alignItems: 'stretch', gap: 4, padding: '0 16px', fontSize: 16}}>
				<span style={{display: 'flex', alignItems: 'center', gap: 10, paddingRight: 18, fontSize: 19, fontWeight: 700}}>
					<Icon d={I.grid} size={20} color="#747474" fill />
					Sales
				</span>
				{['Home', 'Opportunities', 'Leads', 'Accounts', 'Contacts', 'Reports'].map((x) => (
					<span key={x} style={{display: 'flex', alignItems: 'center', gap: 4, padding: '0 12px', borderBottom: x === tab ? `3px solid ${SF.blue}` : '3px solid transparent', marginBottom: -3, fontWeight: x === tab ? 700 : 400}}>
						{x}
						{x !== 'Home' ? <Icon d={I.chevD} size={14} color="#747474" /> : null}
					</span>
				))}
			</div>
			<div style={{position: 'absolute', left: 0, right: 0, top: 102, bottom: 0}}>{children}</div>
		</div>
	</Browser>
);

/** A Lightning card: white, thin border, an icon tile and a title. */
export const SfCard: React.FC<{icon: string; title: string; style?: React.CSSProperties; children: React.ReactNode}> = ({icon, title, style, children}) => (
	<div style={{position: 'absolute', background: '#fff', border: `1px solid ${SF.line}`, borderRadius: 4, fontFamily: sans, ...style}}>
		<div style={{display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px'}}>
			<span style={{width: 28, height: 28, borderRadius: 4, background: icon, display: 'inline-block'}} />
			<span style={{fontSize: 18, fontWeight: 700, color: SF.ink}}>{title}</span>
		</div>
		{children}
	</div>
);

export {Icon, I};
export const Img2 = Img;
export const sf = staticFile;
