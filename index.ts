import app from './src/app'
import { Elysia } from 'elysia'
import swagger from '@elysiajs/swagger'
import routers from './Routers'
import { cors } from '@elysiajs/cors'

app.start(async () => {
  const http = new Elysia()

  http.use(swagger())
  http.use(cors({
    origin: '*'
  }))
  http.use(routers)
  http.listen({
    port: 3000,
    hostname: '0.0.0.0',
    idleTimeout: 80, // Đặt timeout thành 30 giây
  })
  app.on('stop', () => http.stop())
})