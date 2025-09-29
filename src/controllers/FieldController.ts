import Elysia, { t } from 'elysia';
import FieldModel from "~/models/FieldModel";


const idMongodb = t.String({ format: 'regex', pattern: '[0-9a-f]{24}$' })

const controllerField = new Elysia()
  .get('/list-field', async ({ query }) => {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const keyword = query.keyword ?? '';

    const skip = (page - 1) * limit;

    const filter: Record<string, any> = {
      active: true, // luôn lọc theo active
    };

    if (keyword) {
      filter.name = { $regex: keyword, $options: 'i' }; // thêm điều kiện search nếu có
    }

    const [bots, total] = await Promise.all([
      FieldModel.find(filter).skip(skip).limit(limit).sort({ createdAt: -1 }),
      FieldModel.countDocuments(filter)
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
  .get('/listField', async () => {

    const listField = await FieldModel.find({ active: true }).sort({ createdAt: -1 })

    return listField
  })
  .post('/registerField', async ({ body, error }) => {

    const createField = await FieldModel.create({
      name: body.name,
      active: true,
    })

    return createField.toObject()
  }, {
    body: t.Object({
      name: t.String({ maxLength: 50 })
    })
  })
  .put('/update-field/:id', async ({ params, body, set, error }) => {

    const field = await FieldModel.findById(params.id);
    if (!field) return error(404, 'fail');

    let name = field.name

    if (body.name) {
      name = body.name
    }

    await field.updateOne({
      name: name,
    });

    const fieldUpdate = await FieldModel.findById(params.id);

    set.status = 200;
    return fieldUpdate?.toObject();
  }, {
    params: t.Object({ id: idMongodb }),
    body: t.Object({
      name: t.Optional(t.String({ maxLength: 50 })),
    })
  })
  .put('/delete-field/:id', async ({ params, error }) => {
    const bot = FieldModel.findById(params.id)

    if (!bot) return error(404, 'false')

    await bot.updateOne({
      active: false
    })
  }, {
    params: t.Object({ id: idMongodb }),
  })
export default controllerField