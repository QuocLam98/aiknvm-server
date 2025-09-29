import Application, { createServiceAlias } from './providers/Application'
import LoggerProvider from './providers/LoggerProvider'
import MongoProvider from './providers/MongodbProvider'
import OpenaiProvider from './providers/OpenaiProvider'
import JWTProvider from './providers/JWTProvider'
import S3Provider from './providers/S3Provider'
import PayOSProvider from './providers/PayOSProvider'
import GeminiProvider from './providers/GeminiProvider'

const app = new Application()
  // .use(LoggerProvider)
  .use(MongoProvider)
  .use(OpenaiProvider)
  .use(JWTProvider)
  .use(S3Provider)
  .use(PayOSProvider)
  .use(LoggerProvider)
  .use(GeminiProvider)

export default createServiceAlias(app)