
import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
        proxy: {
          '/api/graphql': {
            target: 'https://shopify.com', // Default fallback
            changeOrigin: true, // Required for virtual hosted sites like Shopify
            secure: false, 
            rewrite: (path) => path.replace(/^\/api\/graphql/, '/admin/api/2024-04/graphql.json'),
            // Dynamic Router: Routes traffic to the specific shop entered in the UI
            router: (req) => {
                 const shopHeader = req.headers['x-shop-domain'];
                 if (shopHeader) {
                     let shop = String(shopHeader).trim();
                     // Remove protocol if user typed it
                     shop = shop.replace(/^https?:\/\//, '');
                     // Remove trailing slashes
                     shop = shop.replace(/\/+$/, '');
                     // Ensure it's a valid domain format (basic check)
                     if (shop.length > 3) {
                        return `https://${shop}`;
                     }
                 }
                 return undefined; // Fallback to 'target'
            },
            configure: (proxy, _options) => {
              proxy.on('error', (err, _req, _res) => {
                console.error('Proxy Connectivity Error:', err);
              });
              proxy.on('proxyReq', (proxyReq, req, _res) => {
                 // Optional: Log proxy requests for debugging
                 // console.log(`Proxying ${req.method} ${req.url} -> ${proxyReq.getHeader('host')}`);
              });
            }
          }
        }
      },
      plugins: [react()],
      define: {
        'process.env.API_KEY': JSON.stringify(env.API_KEY)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
