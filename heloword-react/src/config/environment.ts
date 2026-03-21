export interface CipherConfig {
  aesKey: string;
  aesIv: string;
}

export interface Environment {
  appVersion: string;
  backendBaseUrl: string;
  googleClientId: string;
  production: boolean;
  loggerSettings: {
    loggerLevel: number;
    enableClientLog: boolean;
  };
  cipher: CipherConfig;
  retrieveIpUrl: string;
  userIp: string;
}

// Mutable environment config (cipher & userIp are populated at runtime)
export const environment: Environment = {
  appVersion: '2026.03.21.a',
  backendBaseUrl: import.meta.env.VITE_BACKEND_BASE_URL || (import.meta.env.PROD ? '/k8s/micro-infra-gateway/v1' : '/k8s'),
  googleClientId: '268421074885-cn4qtlas4hep25tt7f0gaak8qh557fbu.apps.googleusercontent.com',
  production: import.meta.env.PROD,
  loggerSettings: {
    loggerLevel: 0,
    enableClientLog: true,
  },
  cipher: { aesKey: '', aesIv: '' },
  retrieveIpUrl: 'https://jsonip.com',
  userIp: '0.0.0.0',
};
