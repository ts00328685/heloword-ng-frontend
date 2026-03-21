import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 4200,
    proxy: {
      // Production gateway: forward to heloword.com, keep full path (matches Angular proxy-config.json)
      // /k8s/micro-infra-gateway/v1/user/login → https://heloword.com/k8s/micro-infra-gateway/v1/user/login
      // cookieDomainRewrite strips the domain from Set-Cookie so the browser stores cookies for localhost
      '/k8s/micro-infra-gateway/v1': {
        target: 'https://heloword.com',
        changeOrigin: true,
        secure: true,
        cookieDomainRewrite: '',
      },
      // Local backend: matches Angular's proxy-config.json — strips /k8s prefix
      '/k8s': {
        target: 'http://localhost:9487',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/k8s/, ''),
      },
    }
  },
  build: {
    outDir: 'dist',
  }
})
