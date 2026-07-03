const UA = navigator.userAgent;

export const isLineWebview      = /Line\//i.test(UA);
export const isInstagramWebview = /Instagram/i.test(UA);
export const isFacebookWebview  = /FBAN|FBAV/i.test(UA);
export const isWeChatWebview    = /MicroMessenger/i.test(UA);
export const isTwitterWebview   = /Twitter/i.test(UA);
export const isTikTokWebview    = /ByteLocale|BytedanceWebview|TikTok/i.test(UA);

export const isAndroid = /Android/i.test(UA);
export const isIOS     = /iPhone|iPad|iPod/i.test(UA);

export const isInAppBrowser =
  isLineWebview ||
  isInstagramWebview ||
  isFacebookWebview ||
  isWeChatWebview ||
  isTwitterWebview ||
  isTikTokWebview;

/** Query param we append so the receiving browser knows the handoff already happened. */
const EXTERNAL_MARKER = 'openExternalBrowser';

/** True when we've already tried to hand off to the system browser (prevents redirect loops). */
export const externalRedirectAlreadySent = (): boolean =>
  new URLSearchParams(window.location.search).get(EXTERNAL_MARKER) === '1';

/** @deprecated use externalRedirectAlreadySent — kept for callers still importing the old name. */
export const lineRedirectAlreadySent = externalRedirectAlreadySent;

/** Returns the current URL with LINE's openExternalBrowser param appended. */
export const getLineExternalUrl = (): string => {
  const url = new URL(window.location.href);
  url.searchParams.set(EXTERNAL_MARKER, '1');
  return url.toString();
};

/**
 * Android `intent://` URL that hands the current page off from an in-app webview
 * (e.g. Instagram) to the system default browser. iOS has no equivalent escape.
 */
export const getAndroidIntentUrl = (): string => {
  const url = new URL(window.location.href);
  url.searchParams.set(EXTERNAL_MARKER, '1');
  const scheme = url.protocol.replace(':', '');
  const rest = `${url.host}${url.pathname}${url.search}`;
  // browser_fallback_url keeps things sane if no browser resolves the intent.
  return `intent://${rest}#Intent;scheme=${scheme};S.browser_fallback_url=${encodeURIComponent(url.toString())};end`;
};

/** True when we can auto-hand-off this in-app browser to the system browser. */
export const canAutoRedirectExternal =
  isLineWebview || (isInstagramWebview && isAndroid);
