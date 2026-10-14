import { useMemo } from 'react';
import { analyzeCharacterFrame, type FrameCellAnalysis } from '../core/charlcd.ts';
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
    () => (profile.kind === 'character' ? analyzeCharacterFrame(pixels, profile, rom) : null),
    [profile, pixels, rom],
  );
}
