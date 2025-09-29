import Elysia, { t } from 'elysia'
import app from '~/app'
import FileManageModel from '~/models/FileManageModel'
import BotModel from '~/models/BotModel'

const idMongodb = t.String({ format: 'regex', pattern: '^[0-9a-f]{24}$' })

const controllerFile = new Elysia()
  .get('/get-bot-file/:id', async ({ params, error }) => {
    const getListFile = await FileManageModel.find({ bot: params.id, active: true }).sort({ createdAt: -1 })

    return getListFile
  }, {
    params: t.Object({ id: idMongodb })
  })
  .post('/create-file-bot', async ({ body, error }) => {

    const getBot = await BotModel.findById(body.bot)

    if (!getBot) return error(404, 'fail')


    if (!body.file) return error(404, 'fail')

    const convertFileName = "File-Bot/" + Date.now() + body.file.name.replace(/\s+/g, '')
    const file = app.service.client.file(convertFileName)
    const fileBuffer = await body.file.arrayBuffer()

    await file.write(Buffer.from(fileBuffer), {
      acl: "public-read",
      type: body.file.type
    })

    const uploadFile = app.service.getUrl + convertFileName;

    await FileManageModel.create({
      bot: body.bot,
      typeFile: body.file.type,
      url: uploadFile,
      active: true
    })

    return {
      status: 200,
      message: 'success'
    }

  }, {
    body: t.Object({
      bot: t.String({ id: idMongodb }),
      file: t.File()
    })
  })
  .put('/delete-bot-file/:id', async ({ params, error }) => {
    const getFile = await FileManageModel.findById(params.id)
    if (!getFile) return error(404, 'fail')

    await getFile.updateOne({
      active: false
    })

    return {
      status: 200,
      massage: 'success'
    }
  }, {
    params: t.Object({ id: idMongodb })
  })
  .post('/download-file', async ({ body }) => {
    const imageUrl = body.url;
  
    // Gọi tới URL ảnh bên ngoài
    const res = await fetch(imageUrl);
    
    if (!res.ok) {

      return new Response('Failed to fetch file', { status: 500 });
    }
  
    const contentType = res.headers.get('content-type') || 'application/octet-stream';
    const buffer = await res.arrayBuffer();
  
    const filename = imageUrl.split('/').pop() || 'download.jpg';
  
    return new Response(buffer, {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': buffer.byteLength.toString(),
        'Cache-Control': 'no-store', // Optional: ngăn cache lại
      },
    });
  }, {
    body: t.Object({
      url: t.String(), // Ví dụ: https://aiknvm.hn.ss.bfcplatform.vn/aiknvm/xxx.png
    }),
  });
  
  

export default controllerFile