import { usePlayer } from '../services/player';

export const MINI_PLAYER_HEIGHT = 56;

export function useMiniPlayerPadding(): number {
  const { track } = usePlayer();
  return track ? MINI_PLAYER_HEIGHT : 0;
}
