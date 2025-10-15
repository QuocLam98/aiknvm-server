import Elysia, { t } from 'elysia';
import BotModel from '../models/BotModel';
import app from '~/app'
import AuthMiddleware from '~/middlewares/AuthMiddleware'

const idMongodb = t.String({ format: 'regex', pattern: '[0-9a-f]{24}$' })

const controllerBot = new Elysia()
  .get('/list-bot', async ({ query }) => {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const keyword = query.keyword ?? '';

    const skip = (page - 1) * limit;

    const filter: Record<string, any> = {
      active: true
    };

    if (keyword) {
      filter.name = { $regex: keyword, $options: 'i' }; // thêm điều kiện search nếu có
    }

    const [bots, total] = await Promise.all([
      BotModel.find(filter).skip(skip).limit(limit).sort({ createdAt: -1 }),
      BotModel.countDocuments(filter)
    ]);

    return {
      message: 'success',
      status: 200,
      data: bots,
      total: total
    }
  }, {
    query: t.Object({
      page: t.Optional(t.Number({ minimum: 1 })),
      limit: t.Optional(t.Number({ minimum: 1, maximum: 50 })),
      keyword: t.Optional(t.String())
    })
  })
  .get('/list-bot-chat', async () => {

    const listBot = BotModel.find({ active: true }).sort({ createdAt: -1 })

    return listBot
  })
  .post('/registerBot', async ({ body, error }) => {

    let uploadImage = ''
    let desc = ''
    if (body.image) {
      const convertFileName = "Ava-Bot/" + Date.now() + body.image.name.replace(/\s+/g, '')
      const file = app.service.client.file(convertFileName)
      const fileBuffer = await body.image.arrayBuffer()

      await file.write(Buffer.from(fileBuffer), {
        acl: "public-read",
        type: body.image.type
      });

      uploadImage = app.service.getUrl + convertFileName;
    }

    if (body.description)
      {
        desc = body.description
      }

    const createBot = await BotModel.create({
      name: body.name,
      templateMessage: body.templateMessage,
      active: true,
      image: uploadImage,
      description: desc,
      status: Number(body.status),
      priority: body.priority,
      models: body.models
    })

    return createBot.toObject()
  }, {
    body: t.Object({
      name: t.String({ maxLength: 50 }),
      templateMessage: t.String(),
      image: t.Optional(t.File({ format: 'image/*' })),
      description: t.Optional(t.String()),
      status: t.Optional(t.String()),
      priority: t.Optional(t.String()),
      models: t.Optional(t.String())
    })
  })
  .put('/update-bot/:id', async ({ params, body, set, error }) => {
    const bot = await BotModel.findById(params.id);
    if (!bot) return error(404, 'fail');

    let imageUrl = bot.image; // giữ nguyên ảnh cũ nếu không có file mới
    let desc = bot.description
    let name = bot.name
    let templateMessage = bot.templateMessage
    let priority = bot.priority
    let models = bot.models

    if (body.image) 
     {
      const convertFileName = "Ava-Bot/" + Date.now() + body.image.name.replace(/\s+/g, '')
      const file = app.service.client.file(convertFileName)
      const fileBuffer = await body.image.arrayBuffer()

      await file.write(Buffer.from(fileBuffer), {
        acl: "public-read",
        type: body.image.type
      });

      imageUrl = app.service.getUrl + convertFileName;
    }

    if (body.description)
    {
      desc = body.description
    }

    if(body.name)
    {
      name = body.name
    }

    if (body.templateMessage)
    {
      templateMessage = body.templateMessage
    }

    if (body.priority)
    {
      priority = body.priority
    }

    if (body.models)
    {
      models = body.models
    }

    await bot.updateOne({
      name: name,
      templateMessage: templateMessage,
      image: imageUrl,
      description: desc,
      status: Number(body.status),
      priority: priority,
      models: models
    });

    const botUpdate = await BotModel.findById(params.id);

    set.status = 200;
    return botUpdate?.toObject();
  }, {
    params: t.Object({ id: idMongodb }),
    body: t.Object({
      name: t.Optional(t.String({ maxLength: 50 })),
      templateMessage: t.Optional(t.String()),
      image: t.Optional(t.File({ format: 'image/*' })),
      description: t.Optional(t.String()),
      status: t.Optional(t.String()),
      priority: t.Optional(t.String()),
      models: t.Optional(t.String())
    })
  })
  .put('/delete-bot/:id', async ({ params, error }) => {
    const bot = BotModel.findById(params.id)

    if (!bot) return error(404, 'false')

   await bot.updateOne({
      active: false
    })
  }, {
    params: t.Object({ id: idMongodb }),
  })
  .get('/get-bot/:id', async ({ params, error }) => {
    const bot = await BotModel.findById(params.id )

    if (!bot) return error (404, 'fail')

    return bot.toObject()

  }, {
    params: t.Object({ id: idMongodb })
  })
  .put('/update-bot-test/:id', async ({ params, body, set, error }) => {

    const bot = await BotModel.findById(params.id);
    if (!bot) return error(404, 'fail');

    let imageUrl = bot.image; // giữ nguyên ảnh cũ nếu không có file mới
    let desc = bot.description
    let name = bot.name
    let templateMessage = bot.templateMessage

    if (body.description)
    {
      desc = body.description
    }

    if(body.name)
    {
      name = body.name
    }

    if (body.templateMessage)
    {
      templateMessage = body.templateMessage
    }

    await bot.updateOne({
      name: name,
      templateMessage: templateMessage,
      image: body.image,
      description: desc
    });

    const botUpdate = await BotModel.findById(params.id);

    set.status = 200;
    return botUpdate?.toObject();
  }, {
    params: t.Object({ id: idMongodb }),
    body: t.Object({
      name: t.Optional(t.String({ maxLength: 50 })),
      templateMessage: t.Optional(t.String()),
      image: t.String(),
      description: t.Optional(t.String())
    })
  })
export default controllerBot