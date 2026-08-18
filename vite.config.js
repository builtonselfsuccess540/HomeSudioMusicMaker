import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import https from 'node:https'

export default defineConfig({
  server: {
    port: 5174,
    strictPort: true,
  },
  plugins: [
    react(),
    {
      name: 'anthropic-proxy',
      configureServer(server) {
        server.middlewares.use('/api/claude', (req, res) => {
          let body = ''
          req.on('data', chunk => { body += chunk })
          req.on('end', () => {
            const bodyBuf = Buffer.from(body)
            const options = {
              hostname: 'api.anthropic.com',
              port: 443,
              path: req.url,
              method: req.method,
              headers: {
                'content-type': 'application/json',
                'content-length': bodyBuf.length,
                'x-api-key': req.headers['x-api-key'] || '',
                'anthropic-version': req.headers['anthropic-version'] || '2023-06-01',
              },
            }
            const upstream = https.request(options, upRes => {
              res.writeHead(upRes.statusCode, { 'content-type': 'application/json' })
              upRes.pipe(res)
            })
            upstream.on('error', e => {
              res.writeHead(502)
              res.end(JSON.stringify({ error: { message: e.message } }))
            })
            upstream.write(bodyBuf)
            upstream.end()
          })
        })
      },
    },
  ],
  // Use relative paths when building for Electron (file:// protocol)
  base: process.env.ELECTRON_BUILD ? './' : '/',
  define: {
    global: 'globalThis',
  },
})
