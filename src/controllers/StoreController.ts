import Elysia, { t } from 'elysia';
import { levels } from 'pino';
import app from '~/app'
import StoreModel from '~/models/StoreModel';

const idMongodb = t.String({ format: 'regex', pattern: '[0-9a-f]{24}$' })

const controllerStore = new Elysia()
  .get('/list-store', async ({ query }) => {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;

    const skip = (page - 1) * limit;

    // Nếu có keyword thì thêm $or vào filter
    const filter: Record<string, any> = {
      active: true
    };

    const [stores, total] = await Promise.all([
      StoreModel.find(filter).skip(skip).limit(limit).sort({ createdAt: -1 }),
      StoreModel.countDocuments(filter)
    ]);

    return {
      message: 'success',
      status: 200,
      data: stores,
      total: total
    }
  }, {
    query: t.Object({
      page: t.Optional(t.Number({ minimum: 1 })),
      limit: t.Optional(t.Number({ minimum: 1, maximum: 50 })),
    })
  })
  .post('create-store', async ({ body }) => {
        const createStore = await StoreModel.create({
          name: body.name,
          description: body.description,
          active: true,
          url: body.url,
          price: body.price,
          fileType: body.fileType,
          type: body.type,
          level: body.level || 'basic'
        })

        return createStore.toObject()
  }, {
    body: t.Object({
      name: t.String({ minLength: 2, maxLength: 100 }),
      description: t.String({ minLength: 2, maxLength: 500 }),
      url: t.String({ format: 'uri' }),
      price: t.Number({ minimum: 0 }),
      fileType: t.String(),
      type: t.String(),
      level: t.Optional(t.String())
    })
  })
    .post('/upload-file-store', async ({ body }) => {
      const fileName = body.file.name.replace(/\s+/g, '')
      const convertFileName = "File-Store/" + Date.now() + fileName
      const file = app.service.client.file(convertFileName)
      const fileBuffer = await body.file.arrayBuffer()
  
      await file.write(Buffer.from(fileBuffer), {
        acl: "public-read",
        type: body.file.type
      })
  
      const uploadFile = app.service.getUrl + convertFileName
  
      return uploadFile;
    }, {
      body: t.Object({
        file: t.File(),
      })
    })
  .put('update-store', async ({ body, error }) => {
    const getStore = await StoreModel.findById(body.id)
    if(!getStore) return error(404, 'Store not found')

        await getStore.updateOne({
          name: body.name,
          description: body.description,
          price: body.price,
          type: body.type,
          level: body.level,
        })
        const getStoreNew = await StoreModel.findById(body.id)

        return getStoreNew
  }, {
    body: t.Object({
        id: t.String({ id: idMongodb}),
      name: t.String({ minLength: 2, maxLength: 100 }),
      description: t.String({ minLength: 2, maxLength: 500 }),
      price: t.Number({ minimum: 0 }),
      type: t.String(),
      level: t.Optional(t.String())
    })
  })
    .put('remove-store', async ({ body, error }) => {
    const getStore = await StoreModel.findById(body.id)
    if(!getStore) return error(404, 'Store not found')

        await getStore.updateOne({
          active: false
        })

        return { status: 200, message: 'success'}
  }, {
    body: t.Object({
        id: t.String({ id: idMongodb}),
    })
  })
export default controllerStore