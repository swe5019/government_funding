/** Magic links per email allowed inside one link lifetime (MAGIC_LINK_MAX_AGE_S). */
export const MAX_ACTIVE_LINKS = 3;
export const MAGIC_LINK_MAX_AGE_S = 15 * 60;

/** Live tokens include the one just created, so the 4th request in the window is refused. */
export function tooManyLinks(liveTokenCount: number): boolean {
  return liveTokenCount > MAX_ACTIVE_LINKS;
}
