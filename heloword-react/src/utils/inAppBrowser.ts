const UA = navigator.userAgent;

export const isLineWebview      = /Line\//i.test(UA);
export const isInstagramWebview = /Instagram/i.test(UA);
export const isFacebookWebview  = /FBAN|FBAV/i.test(UA);
export const isWeChatWebview    = /MicroMessenger/i.test(UA);
export const isTwitterWebview   = /Twitter/i.test(UA);
export const isTikTokWebview    = /ByteLocale|BytedanceWebview|TikTok/i.test(UA);

export const isInAppBrowser =
  isLineWebview ||
  isInstagramWebview ||
  isFacebookWebview ||
  isWeChatWebview ||
  isTwitterWebview ||
  isTikTokWebview;

/** Returns the current URL with LINE's openExternalBrowser param appended. */
export const getLineExternalUrl = (): string => {
  const url = new URL(window.location.href);
  url.searchParams.set('openExternalBrowser', '1');
  return url.toString();
};

/** True when LINE has already been told to hand off to the system browser. */
export const lineRedirectAlreadySent = (): boolean =>
  new URLSearchParams(window.location.search).get('openExternalBrowser') === '1';
