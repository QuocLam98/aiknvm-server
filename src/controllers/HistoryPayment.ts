import Elysia, { t } from 'elysia'
import UserModel from '~/models/UserModel'
import HistoryPayment from '~/models/HistoryPayment'
import app from '~/app'

const idMongodb = t.String({ format: 'regex', pattern: '[0-9a-f]{24}$' })

const ControllerHistoryPayment = new Elysia()
  .get('/list-payment', async ({ query }) => {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const keyword = query.keyword ?? '';

    const skip = (page - 1) * limit;

    const filter: Record<string, any> = {
      active: true, // luôn lọc theo active
    };

    if (keyword) {
      filter.email = { $regex: keyword, $options: 'i' }; // thêm điều kiện search nếu có
    }

    const [payment, total] = await Promise.all([
      HistoryPayment.find(filter).skip(skip).limit(limit).sort({ createdAt: -1 }),
      HistoryPayment.countDocuments(filter)
    ]);

    return {
      message: 'success',
      status: 200,
      data: payment,
      total: total
    }
  }, {
    query: t.Object({
      page: t.Optional(t.Number({ minimum: 1 })),
      limit: t.Optional(t.Number({ minimum: 1, maximum: 50 })),
      keyword: t.Optional(t.String())
    })
  })

export default ControllerHistoryPayment