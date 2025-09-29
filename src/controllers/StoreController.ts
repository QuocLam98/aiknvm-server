import Elysia, { t } from 'elysia';
import app from '~/app'

const idMongodb = t.String({ format: 'regex', pattern: '[0-9a-f]{24}$' })

const controllerStore = new Elysia()

export default controllerStore