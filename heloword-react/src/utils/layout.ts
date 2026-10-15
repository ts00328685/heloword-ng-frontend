/** Routes that render without the bottom tab bar. Single source for the tab bar and the chat bot. */
const NO_TABS_PREFIXES = ['/vocabulary/quiz', '/login', '/board/', '/live'];

export function hasBottomTabs(pathname: string): boolean {
  return !NO_TABS_PREFIXES.some((p) => pathname.startsWith(p));
}
