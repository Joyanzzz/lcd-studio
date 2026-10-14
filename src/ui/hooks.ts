import { useMemo } from 'react';
import type { FrameCellAnalysis } from '../core/charlcd.ts';
import { cachedAnalysis, overLimitFrames } from '../core/constraints.ts';
import { getProfile, type DisplayProfile } from '../device-profiles/index.ts';
import { useEditor } from './app-context.tsx';

export function useProfile(): DisplayProfile {
  const profileId = useEditor((s) => s.project.profileId);
  return useMemo(() => getProfile(profileId)!, [profileId]);
}

/** Análisis CGRAM del fotograma actual (solo LCD de caracteres). */
export function useCharAnalysis(): FrameCellAnalysis | null {
  const profile = useProfile();
  const pixels = useEditor((s) => s.project.frames[s.current]!.pixels);
  const rom = useEditor((s) => s.project.romCharset);
  return useMemo(
    () => (profile.kind === 'character' ? cachedAnalysis(pixels, profile, rom) : null),
    [profile, pixels, rom],
  );
}

/** Fotogramas que exceden el límite de caracteres propios (proyecto en reparación). */
export function useOverLimitFrames(): readonly number[] {
  const project = useEditor((s) => s.project);
  return useMemo(() => overLimitFrames(project), [project]);
}
