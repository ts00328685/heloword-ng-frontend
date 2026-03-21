import axios, { AxiosInstance } from 'axios';
import { environment } from '../config/environment';
import { generateCV, generateUUID } from './utils.service';
import { CommonResponse } from '../models';

let _axiosInstance: AxiosInstance | null = null;
let _ipFetchPromise: Promise<void> | null = null;

/**
 * Build common headers that must be sent with every API request.
 * cv: AES-encrypted timestamp (security token)
 * X-REQUEST-ID: unique request identifier
 * Authorization: Bearer token placeholder
 * ChannelCode: identifies the frontend channel
 * ClientIp: user's detected IP
 */
const getCommonHeaders = (): Record<string, string> => ({
  cv: generateCV(environment.cipher.aesKey, environment.cipher.aesIv),
  'X-REQUEST-ID': generateUUID(),
  Authorization: 'Bearer /',
  ChannelCode: 'NG-FRONTEND',
  ClientIp: environment.userIp,
});

const getAxiosInstance = (): AxiosInstance => {
  if (_axiosInstance) return _axiosInstance;

  _axiosInstance = axios.create({
    withCredentials: true, // Required for session cookies
  });

  // Inject common headers on every request
  _axiosInstance.interceptors.request.use((config) => {
    const headers = getCommonHeaders();
    Object.entries(headers).forEach(([k, v]) => {
      config.headers.set(k, v);
    });
    return config;
  });

  // Handle 9403 auth errors and network errors
  _axiosInstance.interceptors.response.use(
    (response) => {
      const body: CommonResponse = response.data;
      if (body?.code === '9403') {
        window.dispatchEvent(new CustomEvent('hw:auth-error'));
      }
      return response;
    },
    (error) => {
      window.dispatchEvent(new CustomEvent('hw:http-error', { detail: error }));
      // Return a safe error response instead of throwing
      return Promise.resolve({
        data: { code: '1999', message: String(error), timestamp: new Date(), data: null },
      });
    }
  );

  return _axiosInstance;
};

/**
 * Ensure the client IP is resolved before making API calls.
 * The IP is sent in the ClientIp header.
 */
const ensureIp = async (): Promise<void> => {
  if (environment.userIp && environment.userIp !== '0.0.0.0') return;
  if (_ipFetchPromise) return _ipFetchPromise;

  _ipFetchPromise = fetch(environment.retrieveIpUrl)
    .then((r) => r.json())
    .then((data: { ip?: string }) => {
      environment.userIp = data.ip || environment.userIp;
    })
    .catch(() => {
      // Silently ignore IP fetch failures
    })
    .finally(() => {
      _ipFetchPromise = null;
    });

  return _ipFetchPromise;
};

/**
 * POST request to the backend.
 * withCredentials is always true for session cookie support.
 */
export const doPost = async <T = any>(
  url: string,
  params: unknown = {},
  baseUrl: string = environment.backendBaseUrl
): Promise<CommonResponse<T>> => {
  await ensureIp();
  const instance = getAxiosInstance();
  const response = await instance.post<CommonResponse<T>>(baseUrl + url, params);
  return response.data;
};

/**
 * GET request to the backend.
 */
export const doGet = async <T = any>(
  url: string,
  params: Record<string, unknown> = {}
): Promise<CommonResponse<T>> => {
  await ensureIp();
  const instance = getAxiosInstance();
  const response = await instance.get<CommonResponse<T>>(environment.backendBaseUrl + url, { params });
  return response.data;
};

/**
 * Reset the axios instance (used after logout to clear state).
 */
export const resetApiInstance = (): void => {
  _axiosInstance = null;
};
