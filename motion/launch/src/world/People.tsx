import React from 'react';
import {Img, staticFile} from 'remotion';
import {C} from '../theme';

/** A person's photo: round, with a thin white ring. Photos live in public/people/. */
export const Face: React.FC<{file: string; size: number; ring?: string; style?: React.CSSProperties}> = ({file, size, ring, style}) => (
	<Img
		src={staticFile(`people/${file}.jpg`)}
		style={{width: size, height: size, borderRadius: 999, objectFit: 'cover', border: `${Math.max(2, size / 28)}px solid ${ring ?? '#fff'}`, background: C.bg3, flexShrink: 0, ...style}}
	/>
);
