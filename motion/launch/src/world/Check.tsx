import React from 'react';
import {B, prog, roll, useT} from '../lib';
import {CAL_A, CAL_B, MISSED} from '../layout';
import {C} from '../theme';
import {At, CalIcon, Card, LogoTile, Num, Sparkle, Tag} from './ui';

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
					<span style={{fontSize: 24, fontWeight: 600, color: C.inkStrong, flex: 1}}>Missed pipeline</span>
					<Tag kind="neg" size={18}>
						Not mentioned
					</Tag>
				</div>
				<Num size={64} color={C.neg} weight={600}>
					-${value.toLocaleString('en-US')}
				</Num>
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
	const name = isA ? 'Acme' : 'tablely.com';
	return (
		<At p={isA ? CAL_A : CAL_B} w={420} h={190} style={{opacity: p * (isA ? dimAt(t) : 1), translate: `0 ${(1 - p) * 24}px`}}>
			<Card style={{padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: 18, borderColor: isA ? C.line : C.signal}}>
				<div style={{display: 'flex', alignItems: 'center', gap: 12}}>
					<CalIcon size={28} color={isA ? C.ink2 : C.signal} />
					<span style={{fontSize: 26, fontWeight: 600, color: C.inkStrong, flex: 1}}>Demo booked</span>
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
					<span style={{fontSize: 24, fontWeight: 500, color: C.ink, flex: 1}}>{name}</span>
					<Num size={20} color={C.ink2}>
						Thu 10:00 AM
					</Num>
				</div>
			</Card>
		</At>
	);
};
