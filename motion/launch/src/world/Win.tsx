import React from 'react';
import {B, IN, OUT, prog, useT} from '../lib';
import {C, MARK} from '../theme';
import {IMPACT} from './PaperArrow';

/** The one gold moment: the Spark bursts where you land in the answer. */
export const SparkBurst: React.FC = () => {
	const t = useT();
	const a = B.finalDrop;
	if (t < a || t > B.demoBookedYou + 0.2) return null;
	const grow = prog(t, a, a + 0.35, OUT);
	const rays = prog(t, a, a + 0.7, OUT);
	const ring = prog(t, a, a + 0.9, OUT);
	// Hand the gold to the "New" tag on the calendar card.
	const fade = 1 - prog(t, B.demoBookedYou - 0.5, B.demoBookedYou, IN);
	const x = IMPACT.x;
	const y = IMPACT.y;
	const S = 150;
	return (
		<svg style={{position: 'absolute', left: x - 600, top: y - 600, overflow: 'visible'}} width={1200} height={1200} viewBox={`${x - 600} ${y - 600} 1200 1200`}>
			<g opacity={fade}>
				<circle cx={x} cy={y} r={40 + ring * 420} fill="none" stroke={C.spark} strokeWidth={10 * (1 - ring) + 1} opacity={1 - ring} />
				{Array.from({length: 12}, (_, i) => {
					const ang = (i / 12) * Math.PI * 2 + 0.2;
					const r0 = 70 + rays * 90;
					const r1 = 90 + rays * (i % 2 ? 230 : 320);
					return (
						<line
							key={i}
							x1={x + Math.cos(ang) * r0}
							y1={y + Math.sin(ang) * r0}
							x2={x + Math.cos(ang) * r1}
							y2={y + Math.sin(ang) * r1}
							stroke={C.spark}
							strokeWidth={i % 2 ? 5 : 8}
							strokeLinecap="round"
							opacity={1 - rays}
						/>
					);
				})}
				<g transform={`translate(${x} ${y}) scale(${(grow * S) / 17}) translate(-32 -11.6)`}>
					<path d={MARK.sparkle} fill={C.spark} />
				</g>
			</g>
		</svg>
	);
};
