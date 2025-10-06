import app from './src/app'
import { Elysia } from 'elysia'
import swagger from '@elysiajs/swagger'
import routers from './Routers'
import { cors } from '@elysiajs/cors'

app.start(async () => {
  const http = new Elysia()

  http.use(swagger())
  http.use(cors({
    origin: app.service.config.URL_CLIENT
  }))
  // Simple health check for load balancer / reverse proxy
  http.get('/healthz', () => ({ status: 'ok' }))
  http.use(routers)
  http.listen({
    port: Number(app.service.config.PORT) || 3000,
    hostname: '0.0.0.0',
    idleTimeout: 80, // Đặt timeout thành 30 giây
  })
  app.on('stop', () => http.stop())
})