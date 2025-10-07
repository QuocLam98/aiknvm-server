import Elysia, { t } from 'elysia'
import BotModel from '~/models/BotModel'
import UserModel from '~/models/UserModel'
import HistoryChat from '~/models/HistoryChat'
import MessageModel from '~/models/MessageModel'
import app from '~/app'

const idMongodb = t.String({ format: 'regex', pattern: '[0-9a-f]{24}$' })

const controllerHistoryChat = new Elysia()
  .post('/history-chat', async ({ body, error }) => {
    const getIdUser = app.service.swat.parse(body.token).subject

    const user = await UserModel.findById(getIdUser)

    if (!user) return error(404, 'fail')

    const getList = await HistoryChat.find({ user: user._id, active: true }).limit(50).sort({ createdAt: -1 }).select('_id name bot')
    
    return getList
  }, {
    body: t.Object({
      token: t.String()
    })
  })
  .post('/history-chat-mobile', async ({ body, error }) => {

    const user = await UserModel.findById(body.id)

    if (!user) return error(404, 'fail')

    const getList = await HistoryChat.find({ user: user._id, active: true }).limit(50).sort({ createdAt: -1 }).select('_id name bot')
    
    return getList
  }, {
    body: t.Object({
      id: t.String()
    })
  })
  .put('/delete-chat', async ({ body, error }) => {
    const exist = await HistoryChat.findById(body.id)

    if (!exist) return error(404, 'fail')

    // Hard delete history and cascade delete messages with the same history id
    await Promise.all([
      HistoryChat.deleteOne({ _id: body.id }),
      MessageModel.deleteMany({ history: body.id })
    ])

    return {
      status: 200,
      message: 'success'
    }
  }, {
    body: t.Object({
      id: t.String({ id: idMongodb })
    })
  })
  .post('/create-history', async ({ body, error }) => {
    const getIdUser = app.service.swat.parse(body.token).subject

    const user = await UserModel.findById(getIdUser)

    if (!user) return error(404, 'fail')

    const bot = await BotModel.findById(body.bot)

    if (!bot) return error(404, 'fail')

    const response = await HistoryChat.create({
      user: user._id,
      bot: bot._id,
      active: true,
      name: body.name
    })

    return response.toObject()
  }, {
    body: t.Object({
      token: t.String(),
      bot: t.String({ bot: idMongodb }),
      name: t.String()
    })
  })
  .post('/history-chat-mobile-by-id', async ({ body, error }) => {

    const getHistory = await HistoryChat.findById(body.id).select('_id name bot').lean()
    
    return getHistory
  }, {
    body: t.Object({
      id: t.String()
    })
  })

export default controllerHistoryChat