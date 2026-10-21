import React from 'react';
import {random} from 'remotion';
import {B, hit, OUT, prog, roll, useT} from '../lib';
import {CAL_A, CAL_B, CAL_SIZE, DEAL, MISSED, SF_SIZE, TOOL_SCALE} from '../layout';
import type {Pt} from '../layout';
import {C} from '../theme';
import {Face} from './People';
import {Calendly, I, Icon, Salesforce, SF, SfCard} from './Platforms';
import {At, Card, Num, SlamRing, slamStyle, Tag} from './ui';

// Tonight's scene fades back once the navigator arrives.
const dimAt = (t: number) => 1 - 0.7 * prog(t, B.dim, B.dim + 0.4);

/** A tool window drawn full size, then scaled down onto the map. */
const ToolWin: React.FC<{p: Pt; size: {w: number; h: number}; on: number; dim?: number; children: React.ReactNode}> = ({p, size, on, dim = 1, children}) => (
	<At p={p} w={size.w * TOOL_SCALE} h={size.h * TOOL_SCALE} style={{opacity: on * dim, translate: `${(1 - on) * 40}px 0`}}>
		<div style={{position: 'absolute', left: 0, top: 0, width: size.w, height: size.h, transform: `scale(${TOOL_SCALE})`, transformOrigin: '0 0'}}>
			<Card style={{borderColor: C.lineStrong, borderWidth: 3}}>{children}</Card>
		</div>
	</At>
);

/** "Demo booked" on Calendly: your competitor's tonight, yours a few weeks later. */
export const CalCard: React.FC<{v: 'A' | 'B'}> = ({v}) => {
	const t = useT();
	const isA = v === 'A';
	const at = isA ? B.demoBookedCompetitor : B.demoBookedYou;
	const on = prog(t, at - 0.45, at - 0.15, OUT);
	if (on <= 0) return null;
	return (
		<ToolWin p={isA ? CAL_A : CAL_B} size={CAL_SIZE} on={on} dim={isA ? dimAt(t) : 1}>
			<Calendly
				t={t}
				company={isA ? 'Acme' : 'Your Brand'}
				host={isA ? 'acme-ceo' : 'sales-2'}
				hostName={isA ? 'Jordan Lee' : 'Alex Rivera'}
				clicks={[-30, -20, -10]}
				done={at}
				url={isA ? 'calendly.com/acme/product-demo' : 'calendly.com/yourbrand/product-demo'}
			/>
		</ToolWin>
	);
};

/** Missed pipeline, in your Salesforce: every answer that leaves you out costs you deals. */
export const Missed: React.FC = () => {
	const t = useT();
	const [m0, m1] = B.missed;
	const on = prog(t, m0 - 0.1, m0 + 0.3, OUT);
	if (on <= 0) return null;
	return (
		<ToolWin p={MISSED} size={SF_SIZE} on={on} dim={dimAt(t)}>
			<Salesforce query="" caret={false} tab="Opportunities" me="sales-2" url="yourbrand.lightning.force.com/lightning/o/Opportunity">
				<SfCard icon="#FF5D2D" title="Opportunities (0)" style={{left: 20, top: 20, width: 400, height: 372}}>
					<div style={{padding: '18px 16px', fontSize: 17, color: SF.sub}}>No items to display.</div>
				</SfCard>
				<SfCard icon={C.neg} title="Pipeline lost to competitors" style={{left: 440, top: 20, width: 616, height: 372}}>
					<div style={{padding: '14px 20px', display: 'flex', flexDirection: 'column', gap: 16}}>
						<span style={{fontSize: 18, color: SF.sub}}>Buyers AI sent somewhere else</span>
						<span style={slamStyle(hit(t, m1, 8))}>
							<Num size={104} color={C.neg} weight={800}>
								-${roll(t, m0 + 0.2, m1, 0, 48000).toLocaleString('en-US')}
							</Num>
						</span>
						<span style={{display: 'flex', gap: 12}}>
							<Tag kind="neg" size={20}>
								Not mentioned
							</Tag>
							<Tag kind="neutral" size={20}>
								Lost to Acme
							</Tag>
						</span>
					</div>
				</SfCard>
			</Salesforce>
		</ToolWin>
	);
};

const STAGES = ['Qualification', 'Demo', 'Proposal', 'Negotiation', 'Closed Won'];

const Path: React.FC<{stage: number; won: number}> = ({stage, won}) => (
	<div style={{display: 'flex', gap: 4, height: 44}}>
		{STAGES.map((s, i) => {
			const done = i < stage || won > 0.5;
			const cur = i === stage && won <= 0.5;
			return (
				<div
					key={s}
					style={{
						flex: 1,
						background: done ? '#2E844A' : cur ? '#014486' : '#ECEBEA',
						color: done || cur ? '#fff' : SF.sub,
						fontSize: 17,
						fontWeight: 700,
						display: 'flex',
						alignItems: 'center',
						justifyContent: 'center',
						gap: 6,
						clipPath: i === 0 ? 'polygon(0 0, calc(100% - 16px) 0, 100% 50%, calc(100% - 16px) 100%, 0 100%)' : 'polygon(0 0, calc(100% - 16px) 0, 100% 50%, calc(100% - 16px) 100%, 0 100%, 16px 50%)',
						borderRadius: i === 0 ? '22px 0 0 22px' : 0,
					}}
				>
					{done && i < 4 ? <Icon d={I.check} size={17} color="#fff" sw={3} /> : null}
					{s}
				</div>
			);
		})}
	</div>
);

/** The opportunity is yours: a new deal in Salesforce, the sales team on it, then closed won. */
export const Deal: React.FC = () => {
	const t = useT();
	const on = prog(t, B.deal - 0.1, B.deal + 0.3, OUT);
	if (on <= 0) return null;
	const team = prog(t, B.sales, B.sales + 0.4, OUT);
	const stage = t < B.sales ? 1 : 3;
	const won = prog(t, B.closedWon, B.closedWon + 0.1);
	const k = hit(t, B.slams[3], 8);
	const kw = hit(t, B.closedWon, 8);
	return (
		<ToolWin p={DEAL} size={SF_SIZE} on={on}>
			<Salesforce query="" caret={false} tab="Opportunities" me="sales-2" url="yourbrand.lightning.force.com/lightning/r/Opportunity">
				<div style={{position: 'absolute', left: 16, right: 16, top: 14, height: 136, background: '#fff', border: `1px solid ${SF.line}`, borderRadius: 4, padding: '14px 20px', display: 'flex', flexDirection: 'column', gap: 12}}>
					<div style={{display: 'flex', alignItems: 'center', gap: 14}}>
						<span style={{width: 40, height: 40, borderRadius: 4, background: '#FF5D2D'}} />
						<div style={{display: 'flex', flexDirection: 'column', flex: 1}}>
							<span style={{fontSize: 15, color: SF.sub}}>Opportunity · New from AI search</span>
							<span style={{fontSize: 25, fontWeight: 700}}>Harbor Bistro · Reservations</span>
						</div>
						<span style={{display: 'flex', flexDirection: 'column', alignItems: 'flex-end'}}>
							<span style={{fontSize: 15, color: SF.sub}}>Amount</span>
							<span style={{...slamStyle(k), transformOrigin: 'right center'}}>
								<Num size={40} color={C.pos} weight={800}>
									+${roll(t, B.deal + 0.1, B.slams[3], 0, 48000).toLocaleString('en-US')}
								</Num>
							</span>
						</span>
					</div>
					<div style={{display: 'flex', gap: 34, fontSize: 16}}>
						{[
							['Account', 'Harbor Bistro'],
							['Source', 'ChatGPT'],
							['Close date', 'Nov 19, 2026'],
						].map(([l, v]) => (
							<span key={l} style={{display: 'flex', gap: 8}}>
								<span style={{color: SF.sub}}>{l}</span>
								<span style={{fontWeight: 600, color: l === 'Account' ? SF.blue : SF.ink}}>{v}</span>
							</span>
						))}
					</div>
				</div>
				<div style={{position: 'absolute', left: 16, right: 16, top: 164, padding: 12, background: '#fff', border: `1px solid ${SF.line}`, borderRadius: 4}}>
					<div style={{scale: `${1 + 0.04 * kw}`}}>
						<Path stage={stage} won={won} />
					</div>
				</div>
				<SfCard icon="#06A59A" title="Opportunity team" style={{left: 16, right: 16, top: 250, height: 146}}>
					<div style={{display: 'flex', alignItems: 'center', gap: 26, padding: '6px 18px', opacity: team, translate: `${(1 - team) * -30}px 0`}}>
						{[
							['sales-1', 'Maya Chen', 'Account Executive'],
							['sales-2', 'Alex Rivera', 'Sales Engineer'],
							['sales-3', 'Priya Nair', 'Customer Success'],
						].map(([f, n, r]) => (
							<span key={f} style={{display: 'flex', alignItems: 'center', gap: 12}}>
								<Face file={f} size={58} style={{borderWidth: 0}} />
								<span style={{display: 'flex', flexDirection: 'column'}}>
									<span style={{fontSize: 18, fontWeight: 700, color: SF.blue}}>{n}</span>
									<span style={{fontSize: 15, color: SF.sub}}>{r}</span>
								</span>
							</span>
						))}
					</div>
				</SfCard>
			</Salesforce>
			{/* confetti on closed won, the way Salesforce celebrates */}
			{won > 0
				? Array.from({length: 46}, (_, i) => {
						const p = Math.min(1, (t - B.closedWon) / 1.8);
						const x = random(`cx${i}`) * SF_SIZE.w;
						const y = -20 + p * (SF_SIZE.h * (0.6 + random(`cy${i}`) * 0.6)) - (1 - p) * random(`cz${i}`) * 80;
						const cols = ['#0176D3', '#2E844A', '#FE9339', '#9050E9', '#E3066A', '#1B96FF'];
						return <span key={i} style={{position: 'absolute', left: x, top: y, width: 12, height: 20, background: cols[i % cols.length], rotate: `${random(`cr${i}`) * 360 + p * 540}deg`, opacity: 1 - prog(p, 0.75, 1)}} />;
					})
				: null}
		</ToolWin>
	);
};

/** Shockwaves where the big numbers land. */
export const Slams: React.FC = () => {
	const t = useT();
	return (
		<>
			<SlamRing p={{x: MISSED.x, y: MISSED.y + 20}} t={t} at={B.slams[1]} color={C.neg} />
			<SlamRing p={{x: DEAL.x + 200, y: DEAL.y - 110}} t={t} at={B.slams[3]} color={C.pos} />
			<SlamRing p={{x: DEAL.x, y: DEAL.y - 60}} t={t} at={B.closedWon} color={C.pos} size={0.7} />
		</>
	);
};
