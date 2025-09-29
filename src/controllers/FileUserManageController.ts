import Elysia, { t } from 'elysia';
import BotModel from '~/models/BotModel';
import FileUserManage from '~/models/FileUserManage';
import UserModel from '~/models/UserModel';
import app from '~/app';

const idMongodb = t.String({ format: 'regex', pattern: '[0-9a-f]{24}$' })

const controllerFileUserManage = new Elysia()
  .post('/create-file-user', async ({ body, error }) => {

    const existToken = app.service.swat.verify(body.token)

    if (!existToken) return {
      status: 400
    }

    const getId = app.service.swat.parse(body.token).subject

    const existsUser = await UserModel.findById(getId)

    if (!existsUser) return error(404, 'fail')

    const existBot = await BotModel.findById(body.bot)

    if (!existBot) return error(404, 'fail')

    const convertFileName = `File-User/${existsUser.email}/` + Date.now() + body.file.name.replace(/\s+/g, '')

    const file = app.service.client.file(convertFileName)

    const fileBuffer = await body.file.arrayBuffer()

    await file.write(Buffer.from(fileBuffer), {
      acl: "public-read",
      type: body.file.type
    })

    const uploadFile = app.service.getUrl + convertFileName;

    await FileUserManage.create({
      user: existsUser._id,
      bot: existBot._id,
      url: uploadFile,
      typeFile: body.file.type,
      active: true,
      name: body.file.name
    })

    return {
      status: 201,
      message: 'sucess'
    }
  }, {
    body: t.Object({
      token: t.String(),
      bot: t.String({ bot: idMongodb }),
      file: t.File()
    })
  })
  .post('/get-file-user', async ({ body, error }) => {

    const existToken = app.service.swat.verify(body.token)

    if (!existToken) return {
      status: 400
    }

    const getId = app.service.swat.parse(body.token).subject

    const existsUser = await UserModel.findById(getId)

    if (!existsUser) return error(404, 'fail')

    const existBot = await BotModel.findById(body.bot)

    if (!existBot) return error(404, 'fail')

    const listFile = await FileUserManage.find({ bot: existBot._id, user: existsUser._id, active: true })

    return listFile
  }, {
    body: t.Object({
      token: t.String(),
      bot: t.String({ bot: idMongodb }),
    })
  })
  .put('/delete-file-user/:id', async ({ params, error }) => {
    const existFile = await FileUserManage.findById(params.id)

    if (!existFile) return error(404, 'fail')

    await existFile.updateOne({
      active: false
    })

    return {
      status: 200,
      message: 'sucess'
    }
  }, {
    params: t.Object({ id: idMongodb })
  })

export default controllerFileUserManage