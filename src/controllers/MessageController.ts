import Elysia, { t } from 'elysia'
import UserModel from '../models/UserModel'
import BotModel from '../models/BotModel'
import MessageModel from '../models/MessageModel'
import app from '~/app'
import Decimal from 'decimal.js'
import UseBotModel from '~/models/UseBotModel'
import calculateCost from '~/services/CalcService'
import FileManageModel from '~/models/FileManageModel'
import imageUrlToBase64 from '~/services/Base64'
import mammoth from 'mammoth'
import FileUserManage from '~/models/FileUserManage'
import { parseBuffer } from 'music-metadata';
import HistoryChat from '~/models/HistoryChat'
import LoggerProvider from '~/providers/LoggerProvider'
import { prepareGeminiInput, computeGeminiPricing } from '~/services/GeminiHelper'

const idMongodb = t.String({ format: 'regex', pattern: '[0-9a-f]{24}$' })

const controllerMessage = new Elysia()
  .get('/list-message', async ({ query }) => {
    const page = query.page ?? 1
    const limit = query.limit ?? 10
    const search = query.search?.trim() || ''  // Lấy giá trị tìm kiếm
    const skip = (page - 1) * limit

    // Tạo biểu thức chính quy cho tìm kiếm
    const searchRegex = new RegExp(search, 'i')

    const filter: Record<string, any> = {
      active: true
    };

    if (search) {
      // Tìm kiếm user.name và bot.name thông qua populate
      filter.$or = [
        { 'user.name': searchRegex },  // Tìm kiếm theo user.name
        { 'bot.name': searchRegex }    // Tìm kiếm theo bot.name
      ]
    }

    const [messages, total] = await Promise.all([
      MessageModel.find(filter)  // Lọc dữ liệu theo filter
        .skip(skip)
        .limit(limit)
        .sort({ createdAt: -1 })
        .populate('user', ['name'])  // Populate thông tin user (chỉ lấy tên)
        .populate('bot', ['name']), // Populate thông tin bot (chỉ lấy tên)
      MessageModel.countDocuments(filter)  // Đếm số lượng tài liệu phù hợp với filter
    ])

    const response = {
      message: 'success',
      status: 200,
      data: messages,
      total
    }

    app.logger.info({ route: '/list-message', action: 'return', summary: { page, limit, total } })
    return response
  }, {
    query: t.Object({
      page: t.Optional(t.Number({ minimum: 1 })),
      limit: t.Optional(t.Number({ minimum: 1, maximum: 50 })),
      search: t.Optional(t.String())  // Chỉ cần một tham số search duy nhất
    })
  })
  .get('/list-message-mobile', async ({ query }) => {
    // Ép kiểu + giới hạn an toàn
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(50, Math.max(1, Number(query.limit) || 10));
    const skip = (page - 1) * limit;

    const [messages, total] = await Promise.all([
      MessageModel.find({history: query.id, active: true})
        .sort({ createdAt: -1 }) // mới nhất trước; đổi { createdAt: 1 } nếu muốn cũ -> mới
        .skip(skip)
        .limit(limit)
        .select('-__v')          // bỏ __v cho gọn (tuỳ chọn)
        .lean(),                 // trả về plain object cho nhanh
      MessageModel.countDocuments({}),
    ]);

    const response = {
      message: 'success',
      status: 200,
      data: messages,
      total,
      meta: {
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(total / limit)),
        hasNext: skip + messages.length < total,
        hasPrev: page > 1,
      },
    }

    app.logger.info({ route: '/list-message-mobile', action: 'return', summary: { page, limit, total } })
    return response;
  }, {
    query: t.Object({
      page: t.Optional(t.Number({ minimum: 1 })),
      limit: t.Optional(t.Number({ minimum: 1, maximum: 50 })),
      id: t.String()
    })
  })
  .get('/list-message-history/:id', async ({ params }) => {

    const messages = await MessageModel.find({ history: params.id, active: true }).limit(50).sort({ createdAt: -1 })

  app.logger.info({ route: '/list-message-history/:id', action: 'return', summary: { id: params.id, count: messages.length } })
  return messages
  }, {
    params: t.Object({ id: idMongodb })
  })
  .post('/upload-file-chat', async ({ body }) => {
    const fileName = body.file.name.replace(/\s+/g, '')
    const convertFileName = "File-Chat/" + Date.now() + fileName
    const file = app.service.client.file(convertFileName)
    const fileBuffer = await body.file.arrayBuffer()

    app.logger.info({ route: '/upload-file-chat', action: 'write-file-start', key: convertFileName })
    await file.write(Buffer.from(fileBuffer), {
      acl: "public-read",
      type: body.file.type
    })

    app.logger.info({ route: '/upload-file-chat', action: 'write-file-success', key: convertFileName })

    const uploadFile = app.service.getUrl + convertFileName
    app.logger.info({ route: '/upload-file-chat', action: 'return', url: uploadFile })
    return uploadFile;
  }, {
    body: t.Object({
      file: t.File(),
    })
  })
  .post('/create-message', async ({ body, error }) => {
    const existToken = app.service.swat.verify(body.token)

    if (!existToken) {
      app.logger.info({ route: '/create-message', action: 'invalid-token' })
      return {
        status: 400
      }
    }
    const getIdUser = app.service.swat.parse(body.token).subject

    const user = await UserModel.findById(getIdUser)

    if (!user) {
      app.logger.info({ route: '/create-message', action: 'user-not-found', userId: getIdUser })
      return error(404, 'fail')
    }

    const bot = await BotModel.findById(body.bot)

    if (!bot) {
      app.logger.info({ route: '/create-message', action: 'bot-not-found', botId: body.bot })
      return error(404, 'fail')
    }

    if (user.creditUsed >= user.credit) {
      let history

      if (!body.historyChat) {
        const historyCreate = await HistoryChat.create({
          user: user._id,
          bot: bot._id,
          active: true,
          name: body.content
        })
        if (historyCreate) {
          history = historyCreate._id.toString()
        }
      }
      else {
        history = body.historyChat
      }

      const messageCreated = await MessageModel.create({
        user: user._id,
        bot: body.bot,
        contentUser: body.content,
        contentBot: 'Bạn đã sử dụng hết số credit, hãy vui lòng mua thêm để sử dụng dịch vụ của chúng tôi',
        tookenRequest: 0,
        tookendResponse: 0,
        creditCost: 0,
        active: true,
        history: history
      })

      const messageData = {
        contentBot: messageCreated.contentBot,
        createdAt: messageCreated.createdAt,
        _id: messageCreated._id,
        status: messageCreated.status,
        history: history
      }
      app.logger.info({ route: '/create-message', action: 'credit-insufficient', details: messageData })
      return messageData
    }

    const messages: any[] = []

    const messageUsser = {
      role: 'user',
      content: body.content,
    }

    if (bot.templateMessage?.trim()) {
      if (!body.historyChat) {
        const messageDeveloper = {
          role: 'developer',
          content: bot.templateMessage,
        }
        messages.push(messageDeveloper)
      }
    }

    const getFile = await FileManageModel.find({ bot: bot._id, active: true })

    if (getFile.length > 0) {
      for (const e of getFile) {
        const response = await imageUrlToBase64(e.url)
        // Kiểm tra loại file và xử lý riêng
        if (response.type === 'application/pdf') {
          const dataString = Buffer.from(response.content).toString('base64');
          const mimeType = response.type; // ví dụ: application/pdf
          const dataUrl = `data:${mimeType};base64,${dataString}`;
          const pdf = {
            role: "user",
            content: [
              {
                type: "file",
                file: {
                  filename: response.file,
                  file_data: dataUrl
                }
              },
              {
                type: "text",
                text: body.content
              }
            ]
          }
          messages.push(pdf)
        } else if (response.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
          const result = await mammoth.extractRawText({ buffer: response.content });

          const wordMessage = {
            role: "developer",
            content: "Tham khảo nội dung để đưa ra câu trả lời phù hợp: " + result.value
          }
          messages.push(wordMessage)
        } else if (response.type === 'text/plain') {
          const textContent = response.content.toString('utf-8')
          const txtMessage = {
            role: "developer",
            content: "Tham khảo nội dung để đưa ra câu trả lời phù hợp:" + textContent
          };
          messages.push(txtMessage);
        }
      }
    }

    if (body.historyChat) {
      const listMessage = await MessageModel.find({
        history: body.historyChat, status: { $in: [0, 1] }, active: true
      }).limit(5).sort({ createdAt: -1 })

      if (listMessage.length > 0) {
        listMessage.reverse();
        for (const message of listMessage) {
          if (message.fileUser && message.fileUser.trim() !== '') {
            const response = await imageUrlToBase64(message.fileUser)

            if (response.type === 'application/pdf') {
              const dataString = Buffer.from(response.content).toString('base64')
              const mimeType = response.type;
              const dataUrl = `data:${mimeType};base64,${dataString}`
              messages.push({
                role: "user",
                content: [
                  {
                    type: "file",
                    file: {
                      filename: response.file,
                      file_data: dataUrl
                    }
                  },
                  {
                    type: "text",
                    text: message.contentUser
                  }]
              })
              messages.push({
                role: 'assistant',
                content: message.contentBot,
              })
            } else if (response.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
              const result = await mammoth.extractRawText({ buffer: response.content });

              messages.push({
                role: "user",
                content: message.contentUser + ": " + result.value
              })
              messages.push({
                role: 'assistant',
                content: message.contentBot,
              })
            } else if (response.type === 'text/plain') {
              const textContent = response.content.toString('utf-8')
              messages.push({
                role: "user",
                content: message.contentUser + ": " + textContent
              })
              messages.push({
                role: 'assistant',
                content: message.contentBot,
              })

            } else if (response.type.startsWith('image/')) {
              const base64Image = response.content.toString('base64');
              messages.push({
                role: "user",
                content: [
                  {
                    type: "text",
                    text: message.contentUser
                  },
                  {
                    type: "image_url",
                    image_url: {
                      url: `data:${response.type};base64,${base64Image}`
                    }
                  }
                ]
              });
              messages.push({
                role: 'assistant',
                content: message.contentBot,
              });
            }
          } else {
            messages.push({
              role: 'user',
              content: message.contentUser,
            }, {
              role: 'assistant',
              content: message.contentBot,
            });
          }
        }
      }

    }

    if (body.file) {
      if (body.fileType?.startsWith('image/')) {
        const imageMessage = {
          role: "user",
          content: [
            {
              type: "text",
              text: body.content
            },
            {
              type: "image_url",
              image_url: {
                url: body.file
              }
            }
          ]
        };

        messages.push(imageMessage)
      }
      else {
        const response = await imageUrlToBase64(body.file)
        if (response.type === 'application/pdf') {
          const dataString = Buffer.from(response.content).toString('base64');
          const mimeType = body.fileType; // ví dụ: application/pdf
          const dataUrl = `data:${mimeType};base64,${dataString}`;
          const pdf = {
            role: "user",
            content: [
              {
                type: "file",
                file: {
                  filename: response.file,
                  file_data: dataUrl
                }
              },
              {
                type: "text",
                text: body.content
              }
            ]
          }
          messages.push(pdf)
        } else if (response.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
          const result = await mammoth.extractRawText({ buffer: response.content });

          const wordMessage = {
            role: "user",
            content: [
              {
                type: "text",
                text: result.value,  // Gửi văn bản thuần lên OpenAI
              },
              {
                type: "text",
                text: body.content,  // Gửi văn bản thuần lên OpenAI
              },
            ],
          };
          messages.push(wordMessage);
        } else if (response.type === 'text/plain') {
          const textContent = response.content.toString('utf-8')
          const txtMessage = {
            role: "user",
            content: [
              {
                type: "text",
                text: textContent,  // Gửi văn bản thuần lên OpenAI
              },
              {
                type: "text",
                text: body.content,  // Gửi văn bản thuần lên OpenAI
              },
            ],
          };
          messages.push(txtMessage);
        }
      }
    }
    else {
      messages.push(messageUsser)
    }
    let completions
    if (body.model === 'gpt-5')
    {
      app.logger.info({ route: '/create-message', action: 'call-openai-chat', model: 'gpt-5' })
      completions = await app.service.openai.chat.completions.create({
        model: 'gpt-5',
        store: true,
        messages: messages
      })
    }
    else {
      app.logger.info({ route: '/create-message', action: 'call-openai-chat', model: 'gpt-5-mini' })
      completions = await app.service.openai.chat.completions.create({
        model: 'gpt-5-mini',
        store: true,
        messages: messages
      })
    }

    app.logger.info({ route: '/create-message', action: 'openai-response', usage: completions.usage })

    let priceTokenRequest = new Decimal(0)
    let priceTokenResponse = new Decimal(0)
    let priceTokenInput
    let priceTokenOutput
    if (body.model === 'gpt-5') {
      priceTokenInput = new Decimal(0.00000125)
      priceTokenOutput = new Decimal(0.00001)
    }
    else {
      priceTokenInput = new Decimal(0.00000025)
      priceTokenOutput = new Decimal(0.000002)
    }


    if (completions.usage !== undefined && completions.usage !== null) {
      priceTokenRequest = new Decimal(completions.usage.prompt_tokens);
      priceTokenResponse = new Decimal(completions.usage.completion_tokens);
    }


    const totalCostInput = priceTokenRequest.mul(priceTokenInput)
    const totalCostOutput = priceTokenResponse.mul(priceTokenOutput)


    const totalCostRealInput = totalCostInput.mul(5)
    const totalCostRealOutput = totalCostOutput.mul(5)

    const messageCreated = await MessageModel.create({
      user: user._id,
      bot: body.bot,
      contentUser: body.content,
      contentBot: completions.choices[0].message.content,
      fileUser: body.file,
      tookenRequest: completions.usage?.prompt_tokens,
      tookendResponse: completions.usage?.completion_tokens,
      creditCost: totalCostRealInput.add(totalCostRealOutput),
      active: true,
      status: 0,
      history: body.historyChat,
      fileType: body.fileType,
      models: body.model
    })

    const creditUsed = new Decimal(user.creditUsed)
    const creditUsedUpdate = creditUsed.add(messageCreated.creditCost)

    await user.updateOne({
      creditUsed: creditUsedUpdate,
    })

    let history = ''

    if (!body.historyChat) {
      const historyCreate = await HistoryChat.create({
        user: user._id,
        bot: bot._id,
        active: true,
        name: body.content
      })
      if (historyCreate) {
        history = historyCreate._id.toString()
      }
    }
    else {
      history = body.historyChat
    }

    const messageData = {
      contentBot: completions.choices[0].message.content,
      createdAt: messageCreated.createdAt,
      file: body.file,
      status: messageCreated.status,
      _id: messageCreated._id,
      history: history
    }

    app.logger.info({ route: '/create-message', action: 'return', messageId: messageCreated._id, history })
    return messageData

  }, {
    body: t.Object({
      token: t.String(),
      bot: t.String({ bot: idMongodb }),
      content: t.String(),
      file: t.Optional(t.String()),
      fileType: t.Optional(t.String()),
      historyChat: t.Optional(t.String()),
      model: t.String(),
    })
  })
  .post('/create-message-image', async ({ body, error }) => {

    const existToken = app.service.swat.verify(body.token)

    if (!existToken) {
      app.logger.info({ route: '/create-message-image', action: 'invalid-token' })
      return {
        status: 400
      }
    }
    const getIdUser = app.service.swat.parse(body.token).subject
    const user = await UserModel.findById(getIdUser)
    if (!user) {
      app.logger.info({ route: '/create-message-image', action: 'user-not-found', userId: getIdUser })
      return error(404, 'fail')
    }

    const bot = await BotModel.findById(body.bot)
    if (!bot) {
      app.logger.info({ route: '/create-message-image', action: 'bot-not-found', botId: body.bot })
      return error(404, 'Bot not found')
    }

    if (user.creditUsed >= user.credit) {
      const messageCreated = await MessageModel.create({
        user: user._id,
        bot: body.bot,
        contentUser: body.content,
        contentBot: 'Bạn đã sử dụng hết số credit, hãy vui lòng mua thêm để sử dụng dịch vụ của chúng tôi',
        tookenRequest: 0,
        tookendResponse: 0,
        creditCost: 0,
        active: true,
        history: body.historyChat
      })
      let history
      if (!body.historyChat) {
        const historyCreate = await HistoryChat.create({
          user: user._id,
          bot: bot._id,
          active: true,
          name: body.content
        })
        if (historyCreate) {
          history = historyCreate._id.toString()
        }
      }
      else {
        history = body.historyChat
      }

      const messageData = {
        contentBot: messageCreated.contentBot,
        createdAt: messageCreated.createdAt,
        _id: messageCreated._id,
        status: messageCreated.status,
        history: history
      }

      app.logger.info({ route: '/create-message-image', action: 'credit-insufficient', messageId: messageCreated._id })
      return messageData
    }

    app.logger.info({ route: '/create-message-image', action: 'call-openai-image-generate', prompt: body.content })
    const completions = await app.service.openai.images.generate({
      model: "dall-e-3",
      prompt: body.content,
      size: "1024x1024",
      response_format: 'b64_json'
    })

    if (!completions.data) {
      app.logger.info({ route: '/create-message-image', action: 'openai-no-data' })
      return error(404, 'fail')
    }

    // Bước 1: Lấy base64
    const base64Data = completions.data[0].b64_json; // thay yourResponse bằng object bạn nhận từ API OpenAI
    if (!base64Data) {
      app.logger.info({ route: '/create-message-image', action: 'openai-empty-base64' })
      return error(404, 'fail')
    }
    // Bước 2: Convert base64 thành buffer
    const buffer = Buffer.from(base64Data, 'base64');

    // Bước 3: Đặt tên file (ví dụ .png vì OpenAI image thường là PNG)
    const convertFileName = "File-Chat/" + `${Date.now()}.png`;

    // Bước 4: Upload lên S3
    const file = app.service.client.file(convertFileName);

    app.logger.info({ route: '/create-message-image', action: 'write-generated-start', key: convertFileName })
    await file.write(buffer, {
      acl: "public-read",
      type: "image/png" // cố định vì OpenAI đang trả PNG
    });
    app.logger.info({ route: '/create-message-image', action: 'write-generated-success', key: convertFileName })
    // Bước 5: Lấy URL
    const uploadFile = app.service.getUrl + convertFileName;
    // Tính toán chi phí credit
    let costImage
    let creditCost
    costImage = new Decimal(0.04)
    creditCost = costImage.mul(5);

    // Chuyển creditCost thành Decimal nếu cần
    const creditCostDecimal = new Decimal(creditCost);

    // Tạo tin nhắn
    let messageCreated
    let uploadFileUser

    messageCreated = await MessageModel.create({
      user: user._id,
      bot: body.bot,
      contentUser: body.content,
      contentBot: uploadFile,
      tookenRequest: 0,
      tookendResponse: 0,
      creditCost: creditCostDecimal.toNumber(), // Lưu giá trị creditCost dưới dạng number
      active: true,
      history: body.historyChat
    })


    // Cập nhật creditUsed của người dùng
    const creditUsedDecimal = new Decimal(user.creditUsed);
    const updatedCreditUsed = creditUsedDecimal.add(creditCostDecimal);

    // Cập nhật số credit đã sử dụng của người dùng trong cơ sở dữ liệu
    await user.updateOne({
      creditUsed: updatedCreditUsed.toNumber(), // Cập nhật với giá trị dạng number
    })

    let history = ''

    if (!body.historyChat) {
      const historyCreate = await HistoryChat.create({
        user: user._id,
        bot: bot._id,
        active: true,
        name: body.content
      })
      if (historyCreate) {
        history = historyCreate._id.toString()
      }
    }
    else {
      history = body.historyChat
    }

    // Return message data
    const response = {
      contentBot: uploadFile,
      createdAt: messageCreated.createdAt,
      history: history,
      _id: messageCreated._id,
      file: uploadFileUser,
    }

    app.logger.info({ route: '/create-message-image', action: 'return', messageId: messageCreated._id })
    return response

  }, {
    body: t.Object({
      token: t.String(),
      bot: t.String({ bot: idMongodb }),
      content: t.String(),
      historyChat: t.Optional(t.String({ historyChat: idMongodb })),
    })
  })
  .post('/create-message-image-pre', async ({ body, error }) => {

    const existToken = app.service.swat.verify(body.token)

    if (!existToken) {
      app.logger.info({ route: '/create-message-image-pre', action: 'invalid-token' })
      return {
        status: 400
      }
    }
    const getIdUser = app.service.swat.parse(body.token).subject
    const user = await UserModel.findById(getIdUser)
    if (!user) {
      app.logger.info({ route: '/create-message-image-pre', action: 'user-not-found', userId: getIdUser })
      return error(404, 'fail')
    }

    const bot = await BotModel.findById(body.bot)
    if (!bot) {
      app.logger.info({ route: '/create-message-image-pre', action: 'bot-not-found', botId: body.bot })
      return error(404, 'Bot not found')
    }

    if (user.creditUsed >= user.credit) {
      const messageCreated = await MessageModel.create({
        user: user._id,
        bot: body.bot,
        contentUser: body.content,
        contentBot: 'Bạn đã sử dụng hết số credit, hãy vui lòng mua thêm để sử dụng dịch vụ của chúng tôi',
        tookenRequest: 0,
        tookendResponse: 0,
        creditCost: 0,
        active: true,
        history: body.historyChat
      })

      const messageData = {
        contentBot: messageCreated.contentBot,
        createdAt: messageCreated.createdAt,
        _id: messageCreated._id,
        history: body.historyChat
      }

      app.logger.info({ route: '/create-message-image-pre', action: 'credit-insufficient', messageId: messageCreated._id })
      return messageData
    }
    let isEdit = false
    let completions
    if (body.file) {
      isEdit = true
      app.logger.info({ route: '/create-message-image-pre', action: 'call-openai-image-edit', prompt: body.content })
      completions = await app.service.openai.images.edit({
        model: "gpt-image-1",
        image: body.file,
        prompt: body.content,
        size: "1024x1024",
        quality: 'high',
      })
    }
    else {
      app.logger.info({ route: '/create-message-image-pre', action: 'call-openai-image-generate', prompt: body.content })
      completions = await app.service.openai.images.generate({
        model: "gpt-image-1",
        prompt: body.content,
        size: "1024x1024",
        quality: "high",
      })
    }
    if (!completions.data) {
      app.logger.info({ route: '/create-message-image-pre', action: 'openai-no-data', isEdit })
      return error(404, 'fail')
    }

    // Bước 1: Lấy base64
    const base64Data = completions.data[0].b64_json; // thay yourResponse bằng object bạn nhận từ API OpenAI
    if (!base64Data) {
      app.logger.info({ route: '/create-message-image-pre', action: 'openai-empty-base64', isEdit })
      return error(404, 'fail')
    }
    // Bước 2: Convert base64 thành buffer
    const buffer = Buffer.from(base64Data, 'base64');

    // Bước 3: Đặt tên file (ví dụ .png vì OpenAI image thường là PNG)
    const convertFileName = "File-Chat/" + `${Date.now()}.png`;

    // Bước 4: Upload lên S3
    const file = app.service.client.file(convertFileName);

    app.logger.info({ route: '/create-message-image-pre', action: 'write-generated-start', key: convertFileName })
    await file.write(buffer, {
      acl: "public-read",
      type: "image/png" // cố định vì OpenAI đang trả PNG
    });
    app.logger.info({ route: '/create-message-image-pre', action: 'write-generated-success', key: convertFileName })
    // Bước 5: Lấy URL
    const uploadFile = app.service.getUrl + convertFileName;
    // Tính toán chi phí credit
    let costImage
    let creditCost
    creditCost = calculateCost(completions.usage, isEdit);

    // Chuyển creditCost thành Decimal nếu cần
    const creditCostDecimal = new Decimal(creditCost);

    // Tạo tin nhắn
    let messageCreated
    let uploadFileUser
    if (body.file) {
      const fileName = await body.file.name.replace(/\s+/g, '')
      const convertFileName = "File-Chat/" + Date.now() + fileName
      const file = await app.service.client.file(convertFileName)
      const fileBuffer = await body.file.arrayBuffer()

      app.logger.info({ route: '/create-message-image-pre', action: 'write-reference-start', key: convertFileName })
      await file.write(Buffer.from(fileBuffer), {
        acl: "public-read",
        type: body.file.type
      })

      app.logger.info({ route: '/create-message-image-pre', action: 'write-reference-success', key: convertFileName })

      const uploadFileUser = app.service.getUrl + convertFileName

      await imageUrlToBase64(uploadFileUser)

  messageCreated = await MessageModel.create({
        user: user._id,
        bot: body.bot,
        contentUser: body.content,
        contentBot: uploadFile,
        tookenRequest: completions.usage?.input_tokens,
        tookendResponse: completions.usage?.output_tokens,
        creditCost: creditCostDecimal.toNumber(), // Lưu giá trị creditCost dưới dạng number
        active: true,
        history: body.historyChat,
        fileUser: uploadFileUser
      })
    }
    else {
      messageCreated = await MessageModel.create({
        user: user._id,
        bot: body.bot,
        contentUser: body.content,
        contentBot: uploadFile,
        tookenRequest: completions.usage?.input_tokens,
        tookendResponse: completions.usage?.output_tokens,
        creditCost: creditCostDecimal.toNumber(), // Lưu giá trị creditCost dưới dạng number
        active: true,
        history: body.historyChat
      })
    }


    // Cập nhật creditUsed của người dùng
    const creditUsedDecimal = new Decimal(user.creditUsed);
    const updatedCreditUsed = creditUsedDecimal.add(creditCostDecimal);

    // Cập nhật số credit đã sử dụng của người dùng trong cơ sở dữ liệu
    await user.updateOne({
      creditUsed: updatedCreditUsed.toNumber(), // Cập nhật với giá trị dạng number
    })

    let history

    if (!body.historyChat) {
      const historyCreate = await HistoryChat.create({
        user: user._id,
        bot: bot._id,
        active: true,
        name: body.content
      })
      if (historyCreate) {
        history = historyCreate._id.toString()
      }
    }
    else {
      history = body.historyChat
    }

    // Return message data
    const response = {
      contentBot: uploadFile,
      createdAt: messageCreated.createdAt,
      history: history,
      _id: messageCreated._id,
      file: uploadFileUser,
    }

    app.logger.info({ route: '/create-message-image-pre', action: 'return', messageId: messageCreated._id })
    return response;

  }, {
    body: t.Object({
      token: t.String(),
      bot: t.String({ bot: idMongodb }),
      content: t.String(),
      historyChat: t.Optional(t.String({ historyChat: idMongodb })),
      file: t.Optional(t.File()),
    })
  })
  .post('/create-message-image-pre-gemini', async ({ body, error }) => {

    const existToken = app.service.swat.verify(body.token)

    if (!existToken) {
      app.logger.info({ route: '/create-message-image-pre-gemini', action: 'invalid-token' })
      return {
        status: 400
      }
    }
    const getIdUser = app.service.swat.parse(body.token).subject
    const user = await UserModel.findById(getIdUser)
    if (!user) {
      app.logger.info({ route: '/create-message-image-pre-gemini', action: 'user-not-found', userId: getIdUser })
      return error(404, 'fail')
    }

    const bot = await BotModel.findById(body.bot)
    if (!bot) {
      app.logger.info({ route: '/create-message-image-pre-gemini', action: 'bot-not-found', botId: body.bot })
      return error(404, 'Bot not found')
    }

  if (user.creditUsed >= user.credit) {
      const messageCreated = await MessageModel.create({
        user: user._id,
        bot: body.bot,
        contentUser: body.content,
        contentBot: 'Bạn đã sử dụng hết số credit, hãy vui lòng mua thêm để sử dụng dịch vụ của chúng tôi',
        tookenRequest: 0,
        tookendResponse: 0,
        creditCost: 0,
        active: true,
        history: body.historyChat
      })

      const messageData = {
        contentBot: messageCreated.contentBot,
        createdAt: messageCreated.createdAt,
        _id: messageCreated._id,
        history: body.historyChat
      }

      app.logger.info({ route: '/create-message-image-pre-gemini', action: 'credit-insufficient', messageId: messageCreated._id })
      return messageData
    }

    let referenceImageUrl: string | undefined
    let inlineImagePart: any | undefined
    if (body.file) {
      if (!body.file.type.startsWith('image/')) {
        app.logger.info({ route: '/create-message-image-pre-gemini', action: 'invalid-file-type', mime: body.file.type })
        return error(400, 'File phải là định dạng ảnh')
      }
      const safeName = body.file.name.replace(/\s+/g, '')
      const refKey = `File-Chat/${Date.now()}-${safeName}`
      const refFile = app.service.client.file(refKey)
      const refBuffer = Buffer.from(await body.file.arrayBuffer())

      app.logger.info({ route: '/create-message-image-pre-gemini', action: 'write-reference-start', key: refKey })
      await refFile.write(refBuffer, {
        acl: 'public-read',
        type: body.file.type
      })

      app.logger.info({ route: '/create-message-image-pre-gemini', action: 'write-reference-success', key: refKey })
      referenceImageUrl = app.service.getUrl + refKey
      await imageUrlToBase64(referenceImageUrl)

      inlineImagePart = {
        inlineData: {
          mimeType: body.file.type,
          data: refBuffer.toString('base64')
        }
      }
    }

    let generatedImageBase64: string | undefined
    let generatedMime = 'image/png'
    let usageMeta: any
    try {
      const parts: any[] = [{ text: "bạn là 1 ai tạo ảnh chuyên nghiệp, nên hãy làm theo yêu cầu sau đây:" +body.content }]
      if (inlineImagePart) parts.push(inlineImagePart)

      app.logger.info({ route: '/create-message-image-pre-gemini', action: 'call-gemini-image', prompt: body.content, hasReference: !!inlineImagePart })
      const genResp = await app.service.gemini.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: [{ role: 'user', parts }]
      })
      usageMeta = (genResp as any)?.usageMetadata
      if (genResp?.candidates?.length) {
        outer: for (const cand of genResp.candidates) {
          const cparts = cand.content?.parts || []
          for (const p of cparts) {
            if (p.inlineData?.data && p.inlineData?.mimeType?.startsWith('image/')) {
              generatedImageBase64 = p.inlineData.data
              generatedMime = p.inlineData.mimeType
              break outer
            }
          }
        }
      }
      if (!generatedImageBase64) {
        const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='1024' height='1024'><rect width='100%' height='100%' fill='#222'/><text x='50%' y='45%' fill='#fff' font-size='38' dominant-baseline='middle' text-anchor='middle'>Gemini Image</text><text x='50%' y='55%' fill='#0f0' font-size='22' dominant-baseline='middle' text-anchor='middle'>${body.content.replace(/</g,'&lt;').substring(0,55)}</text></svg>`
        generatedImageBase64 = Buffer.from(svg).toString('base64')
        generatedMime = 'image/svg+xml'
      }
    } catch (e) {
  app.logger.error(e)
      const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='1024' height='1024'><rect width='100%' height='100%' fill='#440'/><text x='50%' y='50%' fill='#fff' font-size='38' dominant-baseline='middle' text-anchor='middle'>Gemini Error</text></svg>`
      generatedImageBase64 = Buffer.from(svg).toString('base64')
      generatedMime = 'image/svg+xml'
    }

    const ext = generatedMime.includes('svg') ? '.svg'
      : generatedMime.includes('jpeg') ? '.jpg'
      : generatedMime.includes('webp') ? '.webp'
      : '.png'
    const convertFileName = `File-Chat/${Date.now()}-gemini${ext}`
    const file = app.service.client.file(convertFileName)
    const buffer = Buffer.from(generatedImageBase64, 'base64')

    app.logger.info({ route: '/create-message-image-pre-gemini', action: 'write-generated-start', key: convertFileName })
    await file.write(buffer, {
      acl: 'public-read',
      type: generatedMime
    })
    const uploadFile = app.service.getUrl + convertFileName
    app.logger.info({ route: '/create-message-image-pre-gemini', action: 'write-generated-success', key: convertFileName })

    // Pricing per product sheet: input $0.30 / 1M tokens, output $0.039 per generated image (<=1024x1024 ~1290 tokens).
    const USD_PER_M_INPUT = new Decimal(0.30)
    const USD_PER_IMAGE_OUTPUT = new Decimal(0.039)
    const promptTokens = new Decimal(usageMeta?.promptTokenCount || 0)
    const rawOutputTokens = usageMeta?.candidatesTokenCount
    const outputTokens = new Decimal(
      typeof rawOutputTokens === 'number' && rawOutputTokens > 0 ? rawOutputTokens : (generatedImageBase64 ? 1290 : 0)
    )

    const usdInput = promptTokens.mul(USD_PER_M_INPUT).div(1_000_000)
    const usdOutput = generatedImageBase64 ? USD_PER_IMAGE_OUTPUT : new Decimal(0)
    const totalUsd = usdInput.add(usdOutput)
    const creditCost = totalUsd.mul(5)

    let messageCreated
    if (body.file) {
  messageCreated = await MessageModel.create({
        user: user._id,
        bot: body.bot,
        contentUser: body.content,
        contentBot: uploadFile,
        tookenRequest: promptTokens.toNumber(),
        tookendResponse: outputTokens.toNumber(),
        creditCost: creditCost.toNumber(),
        active: true,
        history: body.historyChat,
        fileUser: referenceImageUrl
      })
    } else {
      messageCreated = await MessageModel.create({
        user: user._id,
        bot: body.bot,
        contentUser: body.content,
        contentBot: uploadFile,
        tookenRequest: promptTokens.toNumber(),
        tookendResponse: outputTokens.toNumber(),
        creditCost: creditCost.toNumber(),
        active: true,
        history: body.historyChat
      })
    }

    const creditUsedDecimal = new Decimal(user.creditUsed)
    const updatedCreditUsed = creditUsedDecimal.add(creditCost)

    await user.updateOne({
      creditUsed: updatedCreditUsed.toNumber(),
    })

    let history

    if (!body.historyChat) {
      const historyCreate = await HistoryChat.create({
        user: user._id,
        bot: bot._id,
        active: true,
        name: body.content
      })
      if (historyCreate) {
        history = historyCreate._id.toString()
      }
    }
    else {
      history = body.historyChat
    }

    const response = {
      contentBot: uploadFile,
      createdAt: messageCreated.createdAt,
      history: history,
      _id: messageCreated._id,
      file: referenceImageUrl,
    }

    app.logger.info({ route: '/create-message-image-pre-gemini', action: 'return', messageId: messageCreated._id })
    return response;

  }, {
    body: t.Object({
      token: t.String(),
      bot: t.String({ bot: idMongodb }),
      content: t.String(),
      historyChat: t.Optional(t.String({ historyChat: idMongodb })),
      file: t.Optional(t.File()),
    })
  })
  .put('/update-message', async ({ body, error }) => {

    const getMessage = await MessageModel.findById(body.id)

    if (!getMessage) {
      app.logger.info({ route: '/update-message', action: 'message-not-found', messageId: body.id })
      return error(404, 'fail')
    }

    await getMessage.updateOne({
      status: body.status
    })

    const response = {
      status: 200,
      message: 'success'
    }

    app.logger.info({ route: '/update-message', action: 'return', messageId: body.id, status: body.status })
    return response

  }, {
    body: t.Object({
      id: t.String({ id: idMongodb }),
      status: t.Number()
    })
  })
  .put('/update-message-history', async ({ body, error }) => {

    const getMessage = await MessageModel.findById(body.id)

    if (!getMessage) {
      app.logger.info({ route: '/update-message-history', action: 'message-not-found', messageId: body.id })
      return error(404, 'fail')
    }

    await getMessage.updateOne({
      history: body.history
    })

    const messageUpdate = await MessageModel.findById(body.id)

  const response = messageUpdate?.toObject()
  app.logger.info({ route: '/update-message-history', action: 'return', messageId: body.id, history: body.history })
  return response

  }, {
    body: t.Object({
      id: t.String({ id: idMongodb }),
      history: t.String()
    })
  })
  .post('/create-voice', async ({ body, error }) => {

    const messageFind = await MessageModel.findById(body.id)

    if (!messageFind) {
      app.logger.info({ route: '/create-voice', action: 'message-not-found', messageId: body.id })
      return error(404)
    }

    const getUser = await UserModel.findById(messageFind.user)
    if (!getUser) {
      app.logger.info({ route: '/create-voice', action: 'user-not-found', userId: messageFind.user })
      return error(404)
    }

    if (getUser.creditUsed >= getUser.credit) {
      app.logger.info({ route: '/create-voice', action: 'credit-insufficient', userId: getUser._id })
      return {
        status: 404,
        message: 'Bạn đã sử dụng hết số credit, hãy vui lòng mua thêm để sử dụng dịch vụ của chúng tôi'
      }
    }

    app.logger.info({ route: '/create-voice', action: 'call-openai-tts', messageId: body.id })
    const mp3 = await app.service.openai.audio.speech.create({
      model: "gpt-4o-mini-tts",
      voice: 'alloy',
      input: body.content,
    })

    const convertFileName = `File-Audio/${getUser.email}/` + Date.now() + 'test'
    const file = app.service.client.file(convertFileName)
    const fileBuffer = Buffer.from(await mp3.arrayBuffer());

    app.logger.info({ route: '/create-voice', action: 'write-audio-start', key: convertFileName })
    await file.write(Buffer.from(fileBuffer), {
      acl: "public-read",
      type: 'audio/mpeg'
    })

    const uploadFileUser = app.service.getUrl + convertFileName
    app.logger.info({ route: '/create-voice', action: 'write-audio-success', key: convertFileName })

    await messageFind.updateOne({
      voice: uploadFileUser
    })

    const res = await fetch(uploadFileUser)
    const buffer = Buffer.from(await res.arrayBuffer())

    const metadata = await parseBuffer(buffer, 'audio/mpeg')
    if (!metadata.format.duration) {
      return;
    }

    const priceAudio = new Decimal(0.00025).mul(5)
    const secondAudio = metadata.format.duration
    const costAudio = priceAudio.mul(secondAudio)

    await getUser.updateOne({
      creditUsed: costAudio.add(new Decimal(getUser.creditUsed))
    })

    const response = {
      status: 200,
      url: uploadFileUser
    }

    app.logger.info({ route: '/create-voice', action: 'return', messageId: body.id, url: uploadFileUser })
    return response

  }, {
    body: t.Object({
      content: t.String(),
      id: t.String({ id: idMongodb })
    })
  })
  // Create voice using Google Gemini TTS
  .post('/create-voice-gemini', async ({ body, error }) => {
    // Helper: parse mime like "audio/l16;rate=24000;channels=1"
    const parseAudioMime = (mime?: string): { base?: string; sampleRate?: number; channels?: number } => {
      if (!mime) return {}
      const parts = mime.split(';').map(s => s.trim())
      const base = parts.shift()?.toLowerCase()
      const out: { base?: string; sampleRate?: number; channels?: number } = { base }
      for (const p of parts) {
        const [k, v] = p.split('=').map(s => s.trim().toLowerCase())
        if (!k || !v) continue
        if (k === 'rate' || k === 'samplerate') {
          const n = parseInt(v, 10); if (!Number.isNaN(n)) out.sampleRate = n
        } else if (k === 'channels' || k === 'channel') {
          const n = parseInt(v, 10); if (!Number.isNaN(n)) out.channels = n
        }
      }
      return out
    }

    // Helper: wrap PCM16LE into WAV header
    const pcm16leToWav = (pcm: Buffer, sampleRate: number, channels: number = 1): Buffer => {
      const byteRate = sampleRate * channels * 2 // 16-bit
      const blockAlign = channels * 2
      const dataSize = pcm.length
      const riffSize = 36 + dataSize
      const header = Buffer.alloc(44)
      header.write('RIFF', 0)
      header.writeUInt32LE(riffSize, 4)
      header.write('WAVE', 8)
      header.write('fmt ', 12)
      header.writeUInt32LE(16, 16) // PCM chunk size
      header.writeUInt16LE(1, 20) // Audio format = 1 (PCM)
      header.writeUInt16LE(channels, 22)
      header.writeUInt32LE(sampleRate, 24)
      header.writeUInt32LE(byteRate, 28)
      header.writeUInt16LE(blockAlign, 32)
      header.writeUInt16LE(16, 34) // bits per sample
      header.write('data', 36)
      header.writeUInt32LE(dataSize, 40)
      return Buffer.concat([header, pcm]) as unknown as Buffer
    }
    
    const messageFind = await MessageModel.findById(body.id)
    if (!messageFind) {
      app.logger.info({ route: '/create-voice-gemini', action: 'message-not-found', messageId: body.id })
      return error(404)
    }

    const getUser = await UserModel.findById(messageFind.user)
    if (!getUser) {
      app.logger.info({ route: '/create-voice-gemini', action: 'user-not-found', userId: messageFind.user })
      return error(404)
    }

    if (getUser.creditUsed >= getUser.credit) {
      app.logger.info({ route: '/create-voice-gemini', action: 'credit-insufficient', userId: getUser._id })
      return {
        status: 404,
        message: 'Bạn đã sử dụng hết số credit, hãy vui lòng mua thêm để sử dụng dịch vụ của chúng tôi'
      }
    }

    // Generate audio using Gemini TTS
    app.logger.info({ route: '/create-voice-gemini', action: 'call-gemini-tts', messageId: body.id })
    const audio = await app.service.gemini.models.generateContent({
      model: 'gemini-2.5-flash-preview-tts',
      contents: [{ role: 'user', parts: [{ text: body.content }]}],
      config: {
        responseModalities: ['AUDIO'],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } }
      }
    })
    // console.log(audio.data)
    // Extract audio data
    const parts = audio.candidates?.[0]?.content?.parts || []
    let audioData: string | undefined
    let mimeType = 'audio/wav' // Gemini TTS thường trả về WAV
    
    for (const part of parts) {
      if (part.inlineData?.data) {
        audioData = part.inlineData.data
        mimeType = part.inlineData.mimeType || 'audio/wav'
        break
      }
    }
    if (!audioData) {
      app.logger.info({ route: '/create-voice-gemini', action: 'no-audio-generated' })
      return error(500, 'No audio generated')
    }

    // Prepare buffer for upload, wrapping raw PCM (audio/l16|audio/pcm) into WAV
    const mimeInfo = parseAudioMime(mimeType)
  let uploadBuffer: Buffer = Buffer.from(audioData, 'base64') as unknown as Buffer
    let uploadMime = mimeType
    let ext = '.wav'

    const isRawPcm = (mimeInfo.base?.includes('audio/l16') || (mimeInfo.base?.includes('audio/pcm') && !mimeInfo.base.includes('wav')))
    if (isRawPcm) {
      const sampleRate = mimeInfo.sampleRate || 24000
      const channels = mimeInfo.channels || 1
      // Note: assuming PCM 16-bit little-endian for WAV compatibility
      // If upstream provides big-endian, swap bytes here before wrapping.
  uploadBuffer = pcm16leToWav(uploadBuffer as unknown as Buffer, sampleRate, channels)
      uploadMime = 'audio/wav'
      ext = '.wav'
    } else if (mimeType.includes('wav')) {
      uploadMime = 'audio/wav'
      ext = '.wav'
    } else if (mimeType.includes('mpeg') || mimeType.includes('mp3')) {
      uploadMime = 'audio/mpeg'
      ext = '.mp3'
    } else {
      // Fallback: treat as WAV to maximize playability
      uploadMime = 'audio/wav'
      ext = '.wav'
    }

    const convertFileName = `File-Audio/${getUser.email}/` + Date.now() + '-gemini' + ext
    const file = app.service.client.file(convertFileName)

    app.logger.info({ route: '/create-voice-gemini', action: 'write-audio-start', key: convertFileName })
    await file.write(uploadBuffer, {
      acl: "public-read",
      type: uploadMime
    })

    const uploadFileUser = app.service.getUrl + convertFileName
    app.logger.info({ route: '/create-voice-gemini', action: 'write-audio-success', key: convertFileName })

    await messageFind.updateOne({
      voice: uploadFileUser
    })

    // Calculate duration and cost
    const res = await fetch(uploadFileUser)
    const buffer = Buffer.from(await res.arrayBuffer())

    let duration = 0
    try {
      // Try parsing with the actual upload mime type first
      const metadata = await parseBuffer(buffer, uploadMime.includes('wav') ? 'audio/wav' : 'audio/mpeg')
      if (metadata?.format?.duration) {
        duration = metadata.format.duration
      }
    } catch {
      // Fallback to 0 if duration parsing fails
    }

    // If parsing failed and we wrapped from PCM, compute duration from PCM params
    if ((!duration || duration <= 0) && isRawPcm) {
      const sr = mimeInfo.sampleRate || 24000
      const ch = mimeInfo.channels || 1
      // Our uploaded buffer is WAV, so subtract header when estimating
      const dataLen = Math.max(0, uploadBuffer.length - 44)
      duration = dataLen / (sr * ch * 2)
    }

    // Pricing based on Gemini TTS token rates:
    // Input text: $0.50 per 1M tokens, Output audio: $10.00 per 1M tokens
    const um: any = (audio as any)?.usageMetadata
    const promptTokens = new Decimal(um?.promptTokenCount ?? 0)
    // Try to find AUDIO tokens specifically
    let audioTokens = new Decimal(0)
    try {
      const details = um?.candidatesTokensDetails || um?.candidatesTokensDetail || []
      if (Array.isArray(details) && details.length > 0) {
        const sum = details
          .filter((d: any) => (d?.modality === 'AUDIO' || d?.modality === 3))
          .reduce((acc: number, d: any) => acc + (d?.tokenCount || 0), 0)
        audioTokens = new Decimal(sum)
      } else if (um?.candidatesTokenCount != null) {
        // Fallback to overall candidates tokens if modality breakdown missing
        audioTokens = new Decimal(um.candidatesTokenCount)
      }
    } catch { /* noop */ }

    const costInputUSD = promptTokens.mul(0.50).div(1_000_000)
    const costAudioUSD = audioTokens.mul(10).div(1_000_000)
    const totalUSD = costInputUSD.add(costAudioUSD)
    // Apply 5x multiplier to map to your credit scheme (consistent with other routes)
    const totalCredit = totalUSD.mul(5)

    // As a very last resort (if both tokens are zero), fallback to duration-based minimal charge
    let finalCharge = totalCredit
    if (finalCharge.lte(0)) {
      const fallbackPerSecUSD = new Decimal(0.00025) // legacy per-second rate
      finalCharge = fallbackPerSecUSD.mul(duration || 0).mul(5)
    }

    await messageFind.updateOne({
      tookenRequest: promptTokens.toString(),
      tookendResponse: audioTokens.toString(),
    })

    await getUser.updateOne({
      creditUsed: new Decimal(getUser.creditUsed).add(finalCharge)
    })

    const response = {
      status: 200,
      url: uploadFileUser
    }

    app.logger.info({ route: '/create-voice-gemini', action: 'return', messageId: body.id, url: uploadFileUser })
    return response

  }, {
    body: t.Object({
      content: t.String(),
      id: t.String({ id: idMongodb })
    })
  })
  .post('/createmessage-test', async ({ body, error }) => {

    app.logger.info({ route: '/createmessage-test', action: 'call-openai-chat', prompt: body.content })
    const completions = await app.service.openai.chat.completions.create({
      model: 'chatgpt-4o-latest',
      store: true,
      messages: [{
        role: "user",
        content: body.content,
      }]
    })

    app.logger.info({ route: '/createmessage-test', action: 'return', usage: completions.usage })
    return completions

  }, {
    body: t.Object({
      content: t.String(),
    })
  })
  .post('/duration', async ({ body }) => {
    const res = await fetch(body.url);
    const buffer = Buffer.from(await res.arrayBuffer());
    const ct = res.headers.get('content-type') || undefined

    // Try with reported content-type first
    let duration: number | undefined
    try {
      const md = await parseBuffer(buffer, ct as any)
      if (md?.format?.duration && md.format.duration > 0) duration = md.format.duration
      else {
        const md2 = await parseBuffer(buffer)
        if (md2?.format?.duration && md2.format.duration > 0) duration = md2.format.duration
      }
    } catch { /* noop */ }

    // WAV manual fallback
    const computeWavDuration = (buf: Buffer): number | undefined => {
      try {
        if (buf.length < 44) return undefined
        const riff = buf.toString('ascii', 0, 4)
        const wave = buf.toString('ascii', 8, 12)
        if (riff !== 'RIFF' || wave !== 'WAVE') return undefined
        let off = 12
        let byteRate: number | undefined
        let dataSize: number | undefined
        while (off + 8 <= buf.length) {
          const id = buf.toString('ascii', off, off + 4)
          const size = buf.readUInt32LE(off + 4)
          if (id === 'fmt ') {
            if (off + 24 <= buf.length) byteRate = buf.readUInt32LE(off + 16)
          } else if (id === 'data') {
            dataSize = size
          }
          off += 8 + size + (size % 2)
        }
        if (byteRate && dataSize) return dataSize / byteRate
      } catch { /* noop */ }
      return undefined
    }

    if ((duration === undefined || duration <= 0) && (ct?.includes('wav'))) {
      duration = computeWavDuration(buffer)
    }

    // MP3 bitrate estimate fallback
    if ((duration === undefined || duration <= 0) && (ct?.includes('mpeg') || ct?.includes('mp3'))) {
      try {
        const md3 = await parseBuffer(buffer, 'audio/mpeg')
        const br = md3?.format?.bitrate
        if (br && br > 0) duration = (buffer.length * 8) / br
      } catch { /* noop */ }
    }

  const response = { duration: duration ?? 0 }
  app.logger.info({ route: '/duration', action: 'return', url: body.url, duration: response.duration })
  return response // duration tính bằng giây (số thực)
  }, {
    body: t.Object({
      url: t.String()
    })
  })
  .put('/delete-message/:id', async ({ params, error }) => {
    const getMessage = await MessageModel.findById(params.id)

    if (!getMessage) {
      app.logger.info({ route: '/delete-message/:id', action: 'message-not-found', messageId: params.id })
      return error(404)
    }

    await getMessage.updateOne({
      active: false
    })

  app.logger.info({ route: '/delete-message/:id', action: 'return', messageId: params.id })
  return getMessage
  }, {
    params: t.Object({ id: idMongodb })
  })
  .post('/create-message-mobile', async ({ body, error }) => {
    // Lấy user
    const user = await UserModel.findById(body.id)
    if (!user) {
      app.logger.info({ route: '/create-message-mobile', action: 'user-not-found', userId: body.id })
      return error(404, 'fail')
    }

    const bot = await BotModel.findById(body.bot)

    if (!bot) {
      app.logger.info({ route: '/create-message-mobile', action: 'bot-not-found', botId: body.bot })
      return error(404, 'fail')
    }

    if (user.creditUsed >= user.credit) {
      let history

      if (!body.historyChat) {
        const historyCreate = await HistoryChat.create({
          user: user._id,
          bot: bot._id,
          active: true,
          name: body.content
        })
        if (historyCreate) {
          history = historyCreate._id.toString()
        }
      }
      else {
        history = body.historyChat
      }

      const messageCreated = await MessageModel.create({
        user: user._id,
        bot: body.bot,
        contentUser: body.content,
        contentBot: 'Bạn đã sử dụng hết số credit, hãy vui lòng mua thêm để sử dụng dịch vụ của chúng tôi',
        tookenRequest: 0,
        tookendResponse: 0,
        creditCost: 0,
        active: true,
        history: history
      })

      const messageData = {
        contentBot: messageCreated.contentBot,
        createdAt: messageCreated.createdAt,
        _id: messageCreated._id,
        status: messageCreated.status,
        history: history
      }
      app.logger.info({ route: '/create-message-mobile', action: 'credit-insufficient', messageId: messageCreated._id })
      return messageData
    }

    const messages: any[] = []

    const messageUsser = {
      role: 'user',
      content: body.content,
    }

    if (bot.templateMessage?.trim()) {
      if (!body.historyChat) {
        const messageDeveloper = {
          role: 'developer',
          content: bot.templateMessage,
        }
        messages.push(messageDeveloper)
      }
    }

    const getFile = await FileManageModel.find({ bot: bot._id, active: true })

    if (getFile.length > 0) {
      for (const e of getFile) {
        const response = await imageUrlToBase64(e.url)
        // Kiểm tra loại file và xử lý riêng
        if (response.type === 'application/pdf') {
          const dataString = Buffer.from(response.content).toString('base64');
          const mimeType = response.type; // ví dụ: application/pdf
          const dataUrl = `data:${mimeType};base64,${dataString}`;
          const pdf = {
            role: "user",
            content: [
              {
                type: "file",
                file: {
                  filename: response.file,
                  file_data: dataUrl
                }
              },
              {
                type: "text",
                text: body.content
              }
            ]
          }
          messages.push(pdf)
        } else if (response.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
          const result = await mammoth.extractRawText({ buffer: response.content });

          const wordMessage = {
            role: "developer",
            content: "Tham khảo nội dung để đưa ra câu trả lời phù hợp: " + result.value
          }
          messages.push(wordMessage)
        } else if (response.type === 'text/plain') {
          const textContent = response.content.toString('utf-8')
          const txtMessage = {
            role: "developer",
            content: "Tham khảo nội dung để đưa ra câu trả lời phù hợp:" + textContent
          };
          messages.push(txtMessage);
        }
      }
    }

    if (body.historyChat) {
      const listMessage = await MessageModel.find({
        history: body.historyChat, status: { $in: [0, 1] }, active: true
      }).limit(5).sort({ createdAt: -1 })

      if (listMessage.length > 0) {
        listMessage.reverse();
        for (const message of listMessage) {
          if (message.fileUser && message.fileUser.trim() !== '') {
            const response = await imageUrlToBase64(message.fileUser)

            if (response.type === 'application/pdf') {
              const dataString = Buffer.from(response.content).toString('base64')
              const mimeType = response.type;
              const dataUrl = `data:${mimeType};base64,${dataString}`
              messages.push({
                role: "user",
                content: [
                  {
                    type: "file",
                    file: {
                      filename: response.file,
                      file_data: dataUrl
                    }
                  },
                  {
                    type: "text",
                    text: message.contentUser
                  }]
              })
              messages.push({
                role: 'assistant',
                content: message.contentBot,
              })
            } else if (response.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
              const result = await mammoth.extractRawText({ buffer: response.content });

              messages.push({
                role: "user",
                content: message.contentUser + ": " + result.value
              })
              messages.push({
                role: 'assistant',
                content: message.contentBot,
              })
            } else if (response.type === 'text/plain') {
              const textContent = response.content.toString('utf-8')
              messages.push({
                role: "user",
                content: message.contentUser + ": " + textContent
              })
              messages.push({
                role: 'assistant',
                content: message.contentBot,
              })

            } else if (response.type.startsWith('image/')) {
              const base64Image = response.content.toString('base64');
              messages.push({
                role: "user",
                content: [
                  {
                    type: "text",
                    text: message.contentUser
                  },
                  {
                    type: "image_url",
                    image_url: {
                      url: `data:${response.type};base64,${base64Image}`
                    }
                  }
                ]
              });
              messages.push({
                role: 'assistant',
                content: message.contentBot,
              });
            }
          } else {
            messages.push({
              role: 'user',
              content: message.contentUser,
            }, {
              role: 'assistant',
              content: message.contentBot,
            });
          }
        }
      }

    }

    if (body.file) {
      if (body.fileType?.startsWith('image/')) {
        const imageMessage = {
          role: "user",
          content: [
            {
              type: "text",
              text: body.content
            },
            {
              type: "image_url",
              image_url: {
                url: body.file
              }
            }
          ]
        };

        messages.push(imageMessage)
      }
      else {
        const response = await imageUrlToBase64(body.file)
        if (response.type === 'application/pdf') {
          const dataString = Buffer.from(response.content).toString('base64');
          const mimeType = body.fileType; // ví dụ: application/pdf
          const dataUrl = `data:${mimeType};base64,${dataString}`;
          const pdf = {
            role: "user",
            content: [
              {
                type: "file",
                file: {
                  filename: response.file,
                  file_data: dataUrl
                }
              },
              {
                type: "text",
                text: body.content
              }
            ]
          }
          messages.push(pdf)
        } else if (response.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
          const result = await mammoth.extractRawText({ buffer: response.content });

          const wordMessage = {
            role: "user",
            content: [
              {
                type: "text",
                text: result.value,  // Gửi văn bản thuần lên OpenAI
              },
              {
                type: "text",
                text: body.content,  // Gửi văn bản thuần lên OpenAI
              },
            ],
          };
          messages.push(wordMessage);
        } else if (response.type === 'text/plain') {
          const textContent = response.content.toString('utf-8')
          const txtMessage = {
            role: "user",
            content: [
              {
                type: "text",
                text: textContent,  // Gửi văn bản thuần lên OpenAI
              },
              {
                type: "text",
                text: body.content,  // Gửi văn bản thuần lên OpenAI
              },
            ],
          };
          messages.push(txtMessage);
        }
      }
    }
    else {
      messages.push(messageUsser)
    }
    let completions
    if (body.model === 'gpt-5')
    {
      app.logger.info({ route: '/create-message-mobile', action: 'call-openai-chat', model: 'gpt-5' })
      completions = await app.service.openai.chat.completions.create({
        model: 'gpt-5',
        store: true,
        messages: messages
      })
    }
    else {
      app.logger.info({ route: '/create-message-mobile', action: 'call-openai-chat', model: 'gpt-5-mini' })
      completions = await app.service.openai.chat.completions.create({
        model: 'gpt-5-mini',
        store: true,
        messages: messages
      })
    }

    app.logger.info({ route: '/create-message-mobile', action: 'openai-response', usage: completions.usage })

    let priceTokenRequest = new Decimal(0)
    let priceTokenResponse = new Decimal(0)
    let priceTokenInput
    let priceTokenOutput
    if (body.model === 'gpt-5') {
      priceTokenInput = new Decimal(0.00000125)
      priceTokenOutput = new Decimal(0.00001)
    }
    else {
      priceTokenInput = new Decimal(0.00000025)
      priceTokenOutput = new Decimal(0.000002)
    }


    if (completions.usage !== undefined && completions.usage !== null) {
      priceTokenRequest = new Decimal(completions.usage.prompt_tokens);
      priceTokenResponse = new Decimal(completions.usage.completion_tokens);
    }


    const totalCostInput = priceTokenRequest.mul(priceTokenInput)
    const totalCostOutput = priceTokenResponse.mul(priceTokenOutput)


    const totalCostRealInput = totalCostInput.mul(5)
    const totalCostRealOutput = totalCostOutput.mul(5)

    const messageCreated = await MessageModel.create({
      user: user._id,
      bot: body.bot,
      contentUser: body.content,
      contentBot: completions.choices[0].message.content,
      fileUser: body.file,
      tookenRequest: completions.usage?.prompt_tokens,
      tookendResponse: completions.usage?.completion_tokens,
      creditCost: totalCostRealInput.add(totalCostRealOutput),
      active: true,
      status: 0,
      history: body.historyChat,
      fileType: body.fileType,
      models: body.model
    })

    const creditUsed = new Decimal(user.creditUsed)
    const creditUsedUpdate = creditUsed.add(messageCreated.creditCost)

    await user.updateOne({
      creditUsed: creditUsedUpdate,
    })

    let history = ''

    if (!body.historyChat) {
      const historyCreate = await HistoryChat.create({
        user: user._id,
        bot: bot._id,
        active: true,
        name: body.content
      })
      if (historyCreate) {
        history = historyCreate._id.toString()
      }
    }
    else {
      history = body.historyChat
    }

    const messageData = {
      contentBot: completions.choices[0].message.content,
      createdAt: messageCreated.createdAt,
      file: body.file,
      status: messageCreated.status,
      _id: messageCreated._id,
      history: history
    }

  app.logger.info({ route: '/create-message-mobile', action: 'return', messageId: messageCreated._id, history })
    return messageData

  }, {
    body: t.Object({
      id: t.String({ id: idMongodb }),
      bot: t.String({ bot: idMongodb }),
      content: t.String(),
      file: t.Optional(t.String()),
      fileType: t.Optional(t.String()),
      historyChat: t.Optional(t.String()),
      model: t.String(),
    })
  })
  .post('/create-message-gemini', async ({ body, error }) => {

    const existToken = app.service.swat.verify(body.token)

    if (!existToken) {
      app.logger.info({ route: '/create-message-gemini', action: 'invalid-token' })
      return {
        status: 400
      }
    }
    const getIdUser = app.service.swat.parse(body.token).subject

    const user = await UserModel.findById(getIdUser)

    if (!user) {
      app.logger.info({ route: '/create-message-gemini', action: 'user-not-found', userId: getIdUser })
      return error(404, 'fail')
    }

    // Lấy bot
    const bot = await BotModel.findById(body.bot)
    if (!bot) {
      app.logger.info({ route: '/create-message-gemini', action: 'bot-not-found', botId: body.bot })
      return error(404, 'fail')
    }

    // Chuẩn hoá historyChat: coi chuỗi rỗng hoặc khoảng trắng như không truyền
    let historyId: string | undefined = (body.historyChat && body.historyChat.trim() !== '') ? body.historyChat.trim() : undefined

    // Nếu hết credit tạo history trước (nếu chưa có) và trả về thông báo hết credit
    if (user.creditUsed >= user.credit) {
      if (!historyId) {
        const historyCreate = await HistoryChat.create({
          user: user._id,
          bot: bot._id,
          active: true,
          name: body.content
        })
        if (historyCreate) historyId = historyCreate._id.toString()
      }

  const messageCreated = await MessageModel.create({
        user: user._id,
        bot: body.bot,
        contentUser: body.content,
        contentBot: 'Bạn đã sử dụng hết số credit, hãy vui lòng mua thêm để sử dụng dịch vụ của chúng tôi',
        tookenRequest: 0,
        tookendResponse: 0,
        creditCost: 0,
        active: true,
        history: historyId
      })

      const response = {
        contentBot: messageCreated.contentBot,
        createdAt: messageCreated.createdAt,
        _id: messageCreated._id,
        status: messageCreated.status,
        history: historyId
      }
      app.logger.info({ route: '/create-message-gemini', action: 'credit-insufficient', messageId: messageCreated._id })
      return response
    }

    // ==== Gemini (refactored) build input & generate =====
    const includeTemplate = !!(bot.templateMessage?.trim()) && !body.historyChat
    const prepared = await prepareGeminiInput({
      app,
      bot,
      historyId,
      userPrompt: body.content,
      fileUrl: body.file,
      includeTemplate,
      MessageModel
    })

    app.logger.info({ route: '/create-message-gemini', action: 'call-gemini', model: body.model, includeTemplate })
    const completions = await app.service.gemini.models.generateContent({
      model: body.model,
      contents: prepared.contents,
      config: includeTemplate ? { systemInstruction: bot.templateMessage } : undefined,
    })

    let contentBot = ''
    if (completions?.candidates?.length) {
      const parts = completions.candidates[0].content?.parts || []
      contentBot = parts.map((p: any) => p.text).join('\n')
    }

    // Pricing using helper
    const pricing = computeGeminiPricing(completions?.usageMetadata, body.model)

    // Tạo history trước nếu chưa có (tránh tạo message với history rỗng)
    if (!historyId) {
      const historyCreate = await HistoryChat.create({
        user: user._id,
        bot: bot._id,
        active: true,
        name: body.content
      })
      if (historyCreate) historyId = historyCreate._id.toString()
    }

    const messageCreated = await MessageModel.create({
      user: user._id,
      bot: body.bot,
      contentUser: body.content,
      contentBot: contentBot,
      fileUser: body.file,
      tookenRequest: pricing.promptTokens,
      tookendResponse: pricing.outputTokens,
      creditCost: pricing.creditCost.toNumber(),
      active: true,
      status: 0,
      history: historyId,
      fileType: body.fileType,
      models: body.model
    })

    const creditUsed = new Decimal(user.creditUsed)
  const creditUsedUpdate = creditUsed.add(new Decimal(messageCreated.creditCost))
    await user.updateOne({ creditUsed: creditUsedUpdate })

    const messageData = {
      contentBot: contentBot,
      createdAt: messageCreated.createdAt,
      file: body.file,
      status: messageCreated.status,
      _id: messageCreated._id,
      history: historyId
    }

    app.logger.info({ route: '/create-message-gemini', action: 'return', messageId: messageCreated._id, history: historyId })
    return messageData
  }, {
    body: t.Object({
      token: t.String(),
      model: t.String(),
      bot: t.String({ bot: idMongodb }),
      content: t.String(),
      file: t.Optional(t.String()),
      fileType: t.Optional(t.String()),
      historyChat: t.Optional(t.String())
    })
  })
  .post('/create-message-mobile-gemini', async ({ body, error }) => {

    // Lấy user
    const user = await UserModel.findById(body.id)
    if (!user) {
      app.logger.info({ route: '/create-message-mobile-gemini', action: 'user-not-found', userId: body.id })
      return error(404, 'fail')
    }

    // Lấy bot
    const bot = await BotModel.findById(body.bot)
    if (!bot) {
      app.logger.info({ route: '/create-message-mobile-gemini', action: 'bot-not-found', botId: body.bot })
      return error(404, 'fail')
    }

    // Chuẩn hoá historyChat: coi chuỗi rỗng hoặc khoảng trắng như không truyền
    let historyId: string | undefined = (body.historyChat && body.historyChat.trim() !== '') ? body.historyChat.trim() : undefined

    // Nếu hết credit tạo history trước (nếu chưa có) và trả về thông báo hết credit
    if (user.creditUsed >= user.credit) {
      if (!historyId) {
        const historyCreate = await HistoryChat.create({
          user: user._id,
          bot: bot._id,
          active: true,
          name: body.content
        })
        if (historyCreate) historyId = historyCreate._id.toString()
      }

  const messageCreated = await MessageModel.create({
        user: user._id,
        bot: body.bot,
        contentUser: body.content,
        contentBot: 'Bạn đã sử dụng hết số credit, hãy vui lòng mua thêm để sử dụng dịch vụ của chúng tôi',
        tookenRequest: 0,
        tookendResponse: 0,
        creditCost: 0,
        active: true,
        history: historyId
      })

      const response = {
        contentBot: messageCreated.contentBot,
        createdAt: messageCreated.createdAt,
        _id: messageCreated._id,
        status: messageCreated.status,
        history: historyId
      }
      app.logger.info({ route: '/create-message-mobile-gemini', action: 'credit-insufficient', messageId: messageCreated._id })
      return response
    }

    // ==== Gemini (refactored) build input & generate =====
    const includeTemplate = !!(bot.templateMessage?.trim()) && !body.historyChat
    app.logger.info({ route: '/create-message-mobile-gemini', action: 'prepare-input', includeTemplate, hasFile: !!body.file })
    const prepared = await prepareGeminiInput({
      app,
      bot,
      historyId,
      userPrompt: body.content,
      fileUrl: body.file,
      includeTemplate,
      MessageModel
    })

    app.logger.info({ route: '/create-message-mobile-gemini', action: 'call-gemini', model: body.model })
    const completions = await app.service.gemini.models.generateContent({
      model: body.model,
      contents: prepared.contents,
      config: includeTemplate ? { systemInstruction: bot.templateMessage } : undefined,
    })

    let contentBot = ''
    if (completions?.candidates?.length) {
      const parts = completions.candidates[0].content?.parts || []
      contentBot = parts.map((p: any) => p.text).join('\n')
    }

    // Pricing using helper
    const pricing = computeGeminiPricing(completions?.usageMetadata, body.model)

    // Tạo history trước nếu chưa có (tránh tạo message với history rỗng)
    if (!historyId) {
      const historyCreate = await HistoryChat.create({
        user: user._id,
        bot: bot._id,
        active: true,
        name: body.content
      })
      if (historyCreate) historyId = historyCreate._id.toString()
    }

    const messageCreated = await MessageModel.create({
      user: user._id,
      bot: body.bot,
      contentUser: body.content,
      contentBot: contentBot,
      fileUser: body.file,
      tookenRequest: pricing.promptTokens,
      tookendResponse: pricing.outputTokens,
      creditCost: pricing.creditCost.toNumber(),
      active: true,
      status: 0,
      history: historyId,
      fileType: body.fileType,
      models: body.model
    })

    const creditUsed = new Decimal(user.creditUsed)
  const creditUsedUpdate = creditUsed.add(new Decimal(messageCreated.creditCost))
    await user.updateOne({ creditUsed: creditUsedUpdate })

    const messageData = {
      contentBot: contentBot,
      createdAt: messageCreated.createdAt,
      file: body.file,
      status: messageCreated.status,
      _id: messageCreated._id,
      history: historyId
    }

  app.logger.info({ route: '/create-message-mobile-gemini', action: 'return', messageId: messageCreated._id, history: historyId })
    return messageData
  }, {
    body: t.Object({
      id: t.String({ id: idMongodb }),
      model: t.String(),
      bot: t.String({ bot: idMongodb }),
      content: t.String(),
      file: t.Optional(t.String()),
      fileType: t.Optional(t.String()),
      historyChat: t.Optional(t.String())
    })
  })
  .post('/create-message-image-mobile', async ({ body, error }) => {

    const user = await UserModel.findById(body.id)
    if (!user) {
      app.logger.info({ route: '/create-message-image-mobile', action: 'user-not-found', userId: body.id })
      return error(404, 'fail')
    }

    const bot = await BotModel.findById(body.bot)
    if (!bot) {
      app.logger.info({ route: '/create-message-image-mobile', action: 'bot-not-found', botId: body.bot })
      return error(404, 'Bot not found')
    }

    if (user.creditUsed >= user.credit) {
      const messageCreated = await MessageModel.create({
        user: user._id,
        bot: body.bot,
        contentUser: body.content,
        contentBot: 'Bạn đã sử dụng hết số credit, hãy vui lòng mua thêm để sử dụng dịch vụ của chúng tôi',
        tookenRequest: 0,
        tookendResponse: 0,
        creditCost: 0,
        active: true,
        history: body.historyChat
      })
      let history
      if (!body.historyChat) {
        const historyCreate = await HistoryChat.create({
          user: user._id,
          bot: bot._id,
          active: true,
          name: body.content
        })
        if (historyCreate) {
          history = historyCreate._id.toString()
        }
      }
      else {
        history = body.historyChat
      }

      const messageData = {
        contentBot: messageCreated.contentBot,
        createdAt: messageCreated.createdAt,
        _id: messageCreated._id,
        status: messageCreated.status,
        history: history
      }

      app.logger.info({ route: '/create-message-image-mobile', action: 'credit-insufficient', messageId: messageCreated._id })
      return messageData
    }

    app.logger.info({ route: '/create-message-image-mobile', action: 'call-openai-image-generate', prompt: body.content })
    const completions = await app.service.openai.images.generate({
      model: "dall-e-3",
      prompt: body.content,
      size: "1024x1024",
      response_format: 'b64_json'
    })

    if (!completions.data) {
      app.logger.info({ route: '/create-message-image-mobile', action: 'openai-no-data' })
      return error(404, 'fail')
    }

    // Bước 1: Lấy base64
    const base64Data = completions.data[0].b64_json; // thay yourResponse bằng object bạn nhận từ API OpenAI
    if (!base64Data) {
      app.logger.info({ route: '/create-message-image-mobile', action: 'openai-empty-base64' })
      return error(404, 'fail')
    }
    // Bước 2: Convert base64 thành buffer
    const buffer = Buffer.from(base64Data, 'base64');

    // Bước 3: Đặt tên file (ví dụ .png vì OpenAI image thường là PNG)
    const convertFileName = "File-Chat/" + `${Date.now()}.png`;

    // Bước 4: Upload lên S3
    const file = app.service.client.file(convertFileName);

    app.logger.info({ route: '/create-message-image-mobile', action: 'write-generated-start', key: convertFileName })
    await file.write(buffer, {
      acl: "public-read",
      type: "image/png" // cố định vì OpenAI đang trả PNG
    });
    app.logger.info({ route: '/create-message-image-mobile', action: 'write-generated-success', key: convertFileName })
    // Bước 5: Lấy URL
    const uploadFile = app.service.getUrl + convertFileName;
    // Tính toán chi phí credit
    let costImage
    let creditCost
    costImage = new Decimal(0.04)
    creditCost = costImage.mul(5);

    // Chuyển creditCost thành Decimal nếu cần
    const creditCostDecimal = new Decimal(creditCost);

    // Tạo tin nhắn
    let messageCreated
    let uploadFileUser

    messageCreated = await MessageModel.create({
      user: user._id,
      bot: body.bot,
      contentUser: body.content,
      contentBot: uploadFile,
      tookenRequest: 0,
      tookendResponse: 0,
      creditCost: creditCostDecimal.toNumber(), // Lưu giá trị creditCost dưới dạng number
      active: true,
      history: body.historyChat
    })


    // Cập nhật creditUsed của người dùng
    const creditUsedDecimal = new Decimal(user.creditUsed);
    const updatedCreditUsed = creditUsedDecimal.add(creditCostDecimal);

    // Cập nhật số credit đã sử dụng của người dùng trong cơ sở dữ liệu
    await user.updateOne({
      creditUsed: updatedCreditUsed.toNumber(), // Cập nhật với giá trị dạng number
    })

    let history = ''

    if (!body.historyChat) {
      const historyCreate = await HistoryChat.create({
        user: user._id,
        bot: bot._id,
        active: true,
        name: body.content
      })
      if (historyCreate) {
        history = historyCreate._id.toString()
      }
    }
    else {
      history = body.historyChat
    }

    // Return message data
    const response = {
      contentBot: uploadFile,
      createdAt: messageCreated.createdAt,
      history: history,
      _id: messageCreated._id,
      file: uploadFileUser,
    }

    app.logger.info({ route: '/create-message-image-mobile', action: 'return', messageId: messageCreated._id })
    return response

  }, {
    body: t.Object({
      id: t.String({ id: idMongodb }),
      bot: t.String({ bot: idMongodb }),
      content: t.String(),
      historyChat: t.Optional(t.String({ historyChat: idMongodb })),
    })
  })
  .post('/create-message-image-pre-mobile', async ({ body, error }) => {

    const user = await UserModel.findById(body.id)
    if (!user) {
      app.logger.info({ route: '/create-message-image-pre-mobile', action: 'user-not-found', userId: body.id })
      return error(404, 'fail')
    }

    const bot = await BotModel.findById(body.bot)
    if (!bot) {
      app.logger.info({ route: '/create-message-image-pre-mobile', action: 'bot-not-found', botId: body.bot })
      return error(404, 'Bot not found')
    }

    if (user.creditUsed >= user.credit) {
      const messageCreated = await MessageModel.create({
        user: user._id,
        bot: body.bot,
        contentUser: body.content,
        contentBot: 'Bạn đã sử dụng hết số credit, hãy vui lòng mua thêm để sử dụng dịch vụ của chúng tôi',
        tookenRequest: 0,
        tookendResponse: 0,
        creditCost: 0,
        active: true,
        history: body.historyChat
      })

      const messageData = {
        contentBot: messageCreated.contentBot,
        createdAt: messageCreated.createdAt,
        _id: messageCreated._id,
        history: body.historyChat
      }

      app.logger.info({ route: '/create-message-image-pre-mobile', action: 'credit-insufficient', messageId: messageCreated._id })
      return messageData
    }
    let isEdit = false
    let completions
    if (body.file) {
      isEdit = true
      app.logger.info({ route: '/create-message-image-pre-mobile', action: 'call-openai-image-edit', prompt: body.content })
      completions = await app.service.openai.images.edit({
        model: "gpt-image-1",
        image: body.file,
        prompt: body.content,
        size: "1024x1024",
        quality: 'high',
      })
    }
    else {
      app.logger.info({ route: '/create-message-image-pre-mobile', action: 'call-openai-image-generate', prompt: body.content })
      completions = await app.service.openai.images.generate({
        model: "gpt-image-1",
        prompt: body.content,
        size: "1024x1024",
        quality: "high",
      })
    }
    if (!completions.data) {
      app.logger.info({ route: '/create-message-image-pre-mobile', action: 'openai-no-data', isEdit })
      return error(404, 'fail')
    }

    // Bước 1: Lấy base64
    const base64Data = completions.data[0].b64_json; // thay yourResponse bằng object bạn nhận từ API OpenAI
    if (!base64Data) {
      app.logger.info({ route: '/create-message-image-pre-mobile', action: 'openai-empty-base64', isEdit })
      return error(404, 'fail')
    }
    // Bước 2: Convert base64 thành buffer
    const buffer = Buffer.from(base64Data, 'base64');

    // Bước 3: Đặt tên file (ví dụ .png vì OpenAI image thường là PNG)
    const convertFileName = "File-Chat/" + `${Date.now()}.png`;

    // Bước 4: Upload lên S3
    const file = app.service.client.file(convertFileName);

    app.logger.info({ route: '/create-message-image-pre-mobile', action: 'write-generated-start', key: convertFileName })
    await file.write(buffer, {
      acl: "public-read",
      type: "image/png" // cố định vì OpenAI đang trả PNG
    });
    app.logger.info({ route: '/create-message-image-pre-mobile', action: 'write-generated-success', key: convertFileName })
    // Bước 5: Lấy URL
    const uploadFile = app.service.getUrl + convertFileName;
    // Tính toán chi phí credit
    let costImage
    let creditCost
    creditCost = calculateCost(completions.usage, isEdit);

    // Chuyển creditCost thành Decimal nếu cần
    const creditCostDecimal = new Decimal(creditCost);

    // Tạo tin nhắn
    let messageCreated
    let uploadFileUser
    if (body.file) {
      const fileName = await body.file.name.replace(/\s+/g, '')
      const convertFileName = "File-Chat/" + Date.now() + fileName
      const file = await app.service.client.file(convertFileName)
      const fileBuffer = await body.file.arrayBuffer()

      app.logger.info({ route: '/create-message-image-pre-mobile', action: 'write-reference-start', key: convertFileName })
      await file.write(Buffer.from(fileBuffer), {
        acl: "public-read",
        type: body.file.type
      })

      app.logger.info({ route: '/create-message-image-pre-mobile', action: 'write-reference-success', key: convertFileName })

      const uploadFileUser = app.service.getUrl + convertFileName

      await imageUrlToBase64(uploadFileUser)

      messageCreated = await MessageModel.create({
        user: user._id,
        bot: body.bot,
        contentUser: body.content,
        contentBot: uploadFile,
        tookenRequest: completions.usage?.input_tokens,
        tookendResponse: completions.usage?.output_tokens,
        creditCost: creditCostDecimal.toNumber(), // Lưu giá trị creditCost dưới dạng number
        active: true,
        history: body.historyChat,
        fileUser: uploadFileUser
      })
    }
    else {
      messageCreated = await MessageModel.create({
        user: user._id,
        bot: body.bot,
        contentUser: body.content,
        contentBot: uploadFile,
        tookenRequest: completions.usage?.input_tokens,
        tookendResponse: completions.usage?.output_tokens,
        creditCost: creditCostDecimal.toNumber(), // Lưu giá trị creditCost dưới dạng number
        active: true,
        history: body.historyChat
      })
    }


    // Cập nhật creditUsed của người dùng
    const creditUsedDecimal = new Decimal(user.creditUsed);
    const updatedCreditUsed = creditUsedDecimal.add(creditCostDecimal);

    // Cập nhật số credit đã sử dụng của người dùng trong cơ sở dữ liệu
    await user.updateOne({
      creditUsed: updatedCreditUsed.toNumber(), // Cập nhật với giá trị dạng number
    })

    let history

    if (!body.historyChat) {
      const historyCreate = await HistoryChat.create({
        user: user._id,
        bot: bot._id,
        active: true,
        name: body.content
      })
      if (historyCreate) {
        history = historyCreate._id.toString()
      }
    }
    else {
      history = body.historyChat
    }

    // Return message data
    const response = {
      contentBot: uploadFile,
      createdAt: messageCreated.createdAt,
      history: history,
      _id: messageCreated._id,
      file: uploadFileUser,
    };

    app.logger.info({ route: '/create-message-image-pre-mobile', action: 'return', messageId: messageCreated._id })
    return response;

  }, {
    body: t.Object({
      id: t.String({ id: idMongodb }),
      bot: t.String({ bot: idMongodb }),
      content: t.String(),
      historyChat: t.Optional(t.String({ historyChat: idMongodb })),
      file: t.Optional(t.File()),
    })
  })
export default controllerMessage
