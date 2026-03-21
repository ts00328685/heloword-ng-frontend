import CryptoJS from 'crypto-js';

/**
 * Generate the encrypted CV header value using AES encryption on the current timestamp.
 * This is sent with every request as a security measure.
 */
export const generateCV = (key: string, iv: string): string => {
  if (!key || !iv) return '';
  const message = new Date().getTime().toString();
  return encryptAES(message, key, iv);
};

/**
 * AES encrypt content using the provided key and IV.
 */
export const encryptAES = (content: string, key: string, iv: string): string => {
  return CryptoJS.AES.encrypt(
    content,
    CryptoJS.enc.Utf8.parse(key),
    { iv: CryptoJS.enc.Utf8.parse(iv) }
  ).toString();
};

/**
 * AES decrypt content using the provided key and IV.
 */
export const decryptAES = (content: string, key: string, iv: string): string => {
  return CryptoJS.AES.decrypt(
    content,
    CryptoJS.enc.Utf8.parse(key),
    { iv: CryptoJS.enc.Utf8.parse(iv) }
  ).toString(CryptoJS.enc.Utf8);
};

/**
 * Generate a unique request ID using HMAC-MD5 on the current timestamp.
 */
export const generateUUID = (): string => {
  const ts = new Date().getTime().toString();
  return CryptoJS.HmacMD5(ts, ts).toString();
};
