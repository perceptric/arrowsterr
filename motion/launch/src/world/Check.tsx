import React from 'react';
import {B, hit, prog, roll, useT} from '../lib';
import {CAL_A, CAL_B, DEAL, MISSED} from '../layout';
import {C} from '../theme';
import {At, CalIcon, Card, ChevronUp, LogoTile, Num, SlamRing, slamStyle, Sparkle, Tag} from './ui';

// Tonight's scene fades back once the navigator arrives.
const dimAt = (t: number) => 1 - 0.7 * prog(t, B.dim, B.dim + 0.4);

/** Missed pipeline: every answer that leaves you out costs you deals. */
export const Missed: React.FC = () => {
	const t = useT();
	const [m0, m1] = B.missed;
	const p = prog(t, m0, m0 + 0.4);
	if (p <= 0) return null;
	const value = roll(t, m0 + 0.2, m1, 0, 48000);
	return (
		<At p={MISSED} w={420} h={190} style={{opacity: p * dimAt(t), translate: `0 ${(1 - p) * 24}px`}}>
			<Card style={{padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: 10, borderColor: C.neg}}>
				<div style={{display: 'flex', alignItems: 'center', gap: 12}}>
					<span style={{fontSize: 24, fontWeight: 700, color: C.inkStrong, flex: 1}}>Missed pipeline</span>
					<Tag kind="neg" size={18}>
						Not mentioned
					</Tag>
				</div>
				<span style={slamStyle(hit(t, B.slams[1], 8))}>
					<Num size={64} color={C.neg} weight={700}>
						-${value.toLocaleString('en-US')}
					</Num>
				</span>
			</Card>
		</At>
	);
};

/** "Demo booked": your competitor's tonight, yours next morning. */
export const CalCard: React.FC<{v: 'A' | 'B'}> = ({v}) => {
	const t = useT();
	const isA = v === 'A';
	const at = isA ? B.demoBookedCompetitor : B.demoBookedYou;
	const p = prog(t, at, at + 0.4);
	if (p <= 0) return null;
	const name = isA ? 'Acme' : 'Your Brand';
	return (
		<At p={isA ? CAL_A : CAL_B} w={420} h={190} style={{opacity: p * (isA ? dimAt(t) : 1), translate: `0 ${(1 - p) * 24}px`}}>
			<Card style={{padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: 18, borderColor: isA ? C.line : C.signal}}>
				<div style={{display: 'flex', alignItems: 'center', gap: 12}}>
					<CalIcon size={28} color={isA ? C.ink2 : C.signal} />
					<span style={{fontSize: 26, fontWeight: 700, color: C.inkStrong, flex: 1}}>Demo booked</span>
					{isA ? (
						<Tag kind="neutral" size={18}>
							Booked
						</Tag>
					) : (
						<Tag kind="spark" size={18} icon={<Sparkle size={18} color={C.spark} />}>
							New
						</Tag>
					)}
				</div>
				<div style={{display: 'flex', alignItems: 'center', gap: 14}}>
					<LogoTile name={name} size={40} you={!isA} />
					<span style={{fontSize: 24, fontWeight: 600, color: C.ink, flex: 1}}>{name}</span>
					<Num size={20} color={C.ink2}>
						Thu 10:00 AM
					</Num>
				</div>
			</Card>
		</At>
	);
};

/** The opportunity is yours: the deal lands in pipeline and sales takes it from here. */
export const Deal: React.FC = () => {
	const t = useT();
	const p = prog(t, B.deal, B.deal + 0.4);
	if (p <= 0) return null;
	const sales = prog(t, B.sales, B.sales + 0.4);
	return (
		<At p={DEAL} w={420} h={230} style={{opacity: p, translate: `0 ${(1 - p) * 24}px`}}>
			<Card style={{padding: '22px 28px', display: 'flex', flexDirection: 'column', gap: 12, borderColor: C.pos}}>
				<div style={{display: 'flex', alignItems: 'center', gap: 12}}>
					<span style={{fontSize: 24, fontWeight: 700, color: C.inkStrong, flex: 1}}>Pipeline</span>
					<Tag kind="pos" size={18} icon={<ChevronUp size={14} color={C.pos} />}>
						New deal
					</Tag>
				</div>
				<span style={slamStyle(hit(t, B.slams[3], 8))}>
					<Num size={60} color={C.pos} weight={700}>
						+${roll(t, B.deal + 0.1, B.slams[3], 0, 48000).toLocaleString('en-US')}
					</Num>
				</span>
				<div style={{display: 'flex', alignItems: 'center', gap: 10, opacity: sales, translate: `${(1 - sales) * -16}px 0`}}>
					{['JM', 'AK', 'RS'].map((n, i) => (
						<span
							key={n}
							style={{
								width: 38,
								height: 38,
								borderRadius: 999,
								marginLeft: i ? -12 : 0,
								border: '3px solid #fff',
								background: i === 0 ? C.signal : i === 1 ? C.night : C.sky,
								color: '#fff',
								fontSize: 14,
								fontWeight: 700,
								display: 'inline-flex',
								alignItems: 'center',
								justifyContent: 'center',
							}}
						>
							{n}
						</span>
					))}
					<span style={{fontSize: 20, fontWeight: 700, color: C.ink, flex: 1}}>Sales team</span>
					{/* the tag flips over: Closing, then Closed won */}
					<span style={{display: 'inline-block', transform: `perspective(400px) rotateX(${t < B.closedWon ? prog(t, B.closedWon - 0.15, B.closedWon) * 90 : (1 - prog(t, B.closedWon, B.closedWon + 0.15)) * -90}deg)`}}>
						{t < B.closedWon ? (
							<Tag kind="signal" size={17}>
								Closing
							</Tag>
						) : (
							<Tag kind="pos" size={17} icon={<ChevronUp size={14} color={C.pos} />}>
								Closed won
							</Tag>
						)}
					</span>
				</div>
			</Card>
		</At>
	);
};

/** Shockwaves where the big numbers land. */
export const Slams: React.FC = () => {
	const t = useT();
	return (
		<>
			<SlamRing p={{x: MISSED.x - 60, y: MISSED.y + 30}} t={t} at={B.slams[1]} color={C.neg} />
			<SlamRing p={{x: DEAL.x - 60, y: DEAL.y}} t={t} at={B.slams[3]} color={C.pos} />
			<SlamRing p={{x: DEAL.x, y: DEAL.y}} t={t} at={B.closedWon} color={C.pos} size={0.7} />
		</>
	);
};
