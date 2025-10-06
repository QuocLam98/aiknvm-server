import Elysia, { t } from 'elysia'
import User from '../models/UserModel'
import * as argon2 from "argon2"
import app from '~/app'
import { Resend } from 'resend';
import HistoryPayment from '~/models/HistoryPayment'
import UserModel from '../models/UserModel'
import { OAuth2Client } from 'google-auth-library'
import { adminAuth } from '../firebaseAdmin';

const idMongodb = t.String({ format: 'regex', pattern: '[0-9a-f]{24}$' })

const controllerAuthen = new Elysia()
  .post('/register', async ({ body, error }) => {
    const exists = await User.find({ email: body.email })

    if (exists.length = 0) return {
      status: 404,
      message: 'Email đã được đăng ký tài khoản, vui lòng đăng nhập'
    }

    let phoneCheck = ''

    if (body.phone) {
      const existsPhone = await User.findOne({ phone: body.phone })
      if (existsPhone) {
        return {
          status: 404,
          message: 'Số điện thoại đã đã được đăng ký'
        }
      }
      phoneCheck = body.phone
    }

    const getUser = await User.create({
      name: body.email,
      email: body.email,
      password: await argon2.hash(body.password),
      active: true,
      role: 'user',
      confirm: false,
      credit: 2,
      phone: phoneCheck
    })

    const resend = new Resend(app.service.config.API_KEY_SEND_MAIL);
    const url = app.service.config.URL_CLIENT
    const token = await app.service.swat.create(getUser.id, getUser.role, Math.floor(Date.now() / 1000) + 300)
    resend.emails.send({
      from: 'veryfimail@aiknvm.vn',
      to: getUser.email,
      subject: 'Xác thực tài khoản',
      html: `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #ddd; border-radius: 8px; background-color: #ffffff; color: #000000;">
      <p style="font-size: 18px;">Xin chào <strong>${getUser.name}</strong>,</p>
      <p style="font-size: 16px; line-height: 1.6;">
        Cảm ơn bạn đã đăng ký sử dụng <strong>AIknvm – Trợ lý ảo thông minh hỗ trợ bạn mọi lúc mọi nơi!</strong>
      </p>
      <p style="font-size: 16px; line-height: 1.6;">Từ giờ, bạn có thể:</p>
      <ul style="font-size: 16px; line-height: 1.6; padding-left: 20px;">
        <li>✅ Viết bài, dịch thuật, sáng tạo nội dung dễ dàng</li>
        <li>✅ Giải bài tập, học nhanh, ôn thi hiệu quả</li>
        <li>✅ Tăng tốc công việc – Giảm stress cuộc sống!</li>
      </ul>
      <div style="text-align: center; margin: 30px 0;">
        <a href="${url}/verify?token=${token}" style="display: inline-block; background-color:rgb(9, 241, 105); color: #ffffff; text-decoration: none; padding: 12px 24px; font-size: 16px; border-radius: 6px;">
          Xác minh email
        </a>
      </div>
      <p style="font-size: 15px; color: #d9534f;"><strong>🔥 Lưu ý:</strong> Bạn đang nằm trong 1000 người đầu tiên được trải nghiệm hoàn toàn miễn phí!</p>
      <p style="font-size: 15px;">Nếu cần hỗ trợ bất cứ điều gì, đừng ngại nhắn cho đội ngũ chăm sóc khách hàng nhé 🧡</p>
      <p style="font-size: 15px;">Chúc bạn có những trải nghiệm tuyệt vời cùng AIknvm!</p>
      <p style="font-size: 15px; margin-top: 30px;">Thân ái,<br /><strong>Đội ngũ AIknvm by AIknvm</strong></p>
      <hr style="margin: 30px 0;" />
      <p style="font-size: 12px; text-align: center; color: #888888;">
        Nếu bạn không muốn nhận email, hãy ấn 
        <a href="#" style="color: #007bff;">Unsubscribe</a> hoặc 
        <a href="#" style="color: #007bff;">Unsubscribe Preferences</a>
      </p>
    </div>
  `
    })

    return {
      message: 'created',
      status: 201
    }
  }, {
    body: t.Object({
      email: t.String({ format: 'email' }),
      password: t.String({ maxLength: 16, minLength: 8 }),
      phone: t.Optional(t.String())
    })
  })
  .post('/sendmail', async ({ body, error }) => {
    const getUser = await User.findOne({ email: body.email })
    if (!getUser) return error(404, 'fail')

    const resend = new Resend(app.service.config.API_KEY_SEND_MAIL);
    const url = app.service.config.URL_CLIENT
    const token = await app.service.swat.create(getUser.id, getUser.role, Math.floor(Date.now() / 1000) + 300)
    resend.emails.send({
      from: 'veryfimail@aiknvm.vn',
      to: getUser.email,
      subject: 'Xác thực tài khoản',
      html: `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #ddd; border-radius: 8px; background-color: #ffffff; color: #000000;">
      <p style="font-size: 18px;">Xin chào <strong>${getUser.name}</strong>,</p>
      <p style="font-size: 16px; line-height: 1.6;">
        Cảm ơn bạn đã đăng ký sử dụng <strong>AIknvm – Trợ lý ảo thông minh hỗ trợ bạn mọi lúc mọi nơi!</strong>
      </p>
      <p style="font-size: 16px; line-height: 1.6;">Từ giờ, bạn có thể:</p>
      <ul style="font-size: 16px; line-height: 1.6; padding-left: 20px;">
        <li>✅ Viết bài, dịch thuật, sáng tạo nội dung dễ dàng</li>
        <li>✅ Giải bài tập, học nhanh, ôn thi hiệu quả</li>
        <li>✅ Tăng tốc công việc – Giảm stress cuộc sống!</li>
      </ul>
      <div style="text-align: center; margin: 30px 0;">
        <a href="${url}/verify?token=${token}" style="display: inline-block; background-color:rgb(9, 241, 105); color: #ffffff; text-decoration: none; padding: 12px 24px; font-size: 16px; border-radius: 6px;">
          Xác minh email
        </a>
      </div>
      <p style="font-size: 15px; color: #d9534f;"><strong>🔥 Lưu ý:</strong> Bạn đang nằm trong 1000 người đầu tiên được trải nghiệm hoàn toàn miễn phí!</p>
      <p style="font-size: 15px;">Nếu cần hỗ trợ bất cứ điều gì, đừng ngại nhắn cho đội ngũ chăm sóc khách hàng nhé 🧡</p>
      <p style="font-size: 15px;">Chúc bạn có những trải nghiệm tuyệt vời cùng AIknvm!</p>
      <p style="font-size: 15px; margin-top: 30px;">Thân ái,<br /><strong>Đội ngũ AIknvm by AIknvm</strong></p>
      <hr style="margin: 30px 0;" />
      <p style="font-size: 12px; text-align: center; color: #888888;">
        Nếu bạn không muốn nhận email, hãy ấn 
        <a href="#" style="color: #007bff;">Unsubscribe</a> hoặc 
        <a href="#" style="color: #007bff;">Unsubscribe Preferences</a>
      </p>
    </div>
  `
    })
  }, {
    body: t.Object({
      email: t.String({ format: 'email' }),
    })

  })
  .get('/verify', async ({ query, error }) => {
    const token = query.token as string

    if (!token) return error(404, ' fail')

    const getId = app.service.swat.parse(token)

    if (!getId) return error(404, ' fail')

    const getUser = await User.findById(getId.subject)

    if (!getUser) return error(404, ' fail')

    await getUser.updateOne({
      confirm: true
    })

    return { status: 200, message: 'Bạn đã xác thực thành công, xin mời đăng nhập' }
  })
  .post('/login', async ({ body, error }) => {

    const getUser = await User.findOne({ email: body.email, active: true })

    if (!getUser) return {
      status: 404,
      message: 'Tài khoản chưa được đăng ký'
    }

    if (getUser.confirm === false) return {
      data: false,
      status: 401,
      message: 'Tài khoản chưa được xác thực'
    }

    const isMatch = await argon2.verify(getUser.password, body.password);
    if (!isMatch) return {
      status: 402,
      message: 'Sai mật khẩu'
    }

    const token = await app.service.swat.create(getUser.id, getUser.role, Math.floor(Date.now() / 1000) + 120)

    return { message: 'success', status: 200, token: token, email: body.email, data: true }
  }, {
    body: t.Object({
      email: t.String({ format: 'email' }),
      password: t.String({ maxLength: 16, minLength: 8 })
    })

  })
  .get('/user/:id', ({ params }) => {
    const userFind = User.findById(params.id)

    return userFind
  }, {
    params: t.Object({ id: idMongodb })
  })
  .post('/get-user', async ({ body }) => {
    const getUser = await User.findOne({ email: body.email })

    if (!getUser) return {
      message: 'fail',
      status: 404
    }
    return {
      credit: getUser?.credit,
      creditUsed: getUser?.creditUsed
    }
  }, {
    body: t.Object({
      email: t.String({ format: 'email' }),
    })
  })
  .post('/get-user-detail', async ({ body }) => {

    const getIdUser = app.service.swat.parse(body.token).subject

    const getUser = await UserModel.findById(getIdUser)

    return {
      email: getUser?.email,
      name: getUser?.name,
      image: getUser?.image,
      phone: getUser?.phone
    }
  }, {
    body: t.Object({
      token: t.String(),
    })
  })
  .post('/me', async ({ body }) => {

    const getUser = await UserModel.findById(body.id)

    return {
      id: getUser?._id?.toString() ?? getUser?.id,
      email: getUser?.email,
      name: getUser?.name,
      image: getUser?.image ?? null,
      phone: getUser?.phone
    }
  }, {
    body: t.Object({
      id: t.String(),
    })
  })
  .put('/update-user/:id', async ({ params, body, set, error }) => {
    const user = await User.findById(params.id)
    set.status = 404
    if (!user) return error(404, 'fail')

    const userUpdate = await user.updateOne({
      name: body.name,
      email: body.email,
      credit: body.credit,
      role: body.role,
    })

    const userLastUpdate = await User.findById(params.id);

    set.status = 201
    return userLastUpdate?.toObject()
  }, {
    params: t.Object({ id: idMongodb }),
    body: t.Object({
      name: t.String({ maxLength: 50 }),
      email: t.String({ format: 'email' }),
      credit: t.Number(),
      role: t.String({ maxLength: 50 }),
    })
  })
  .put('/updatePassword', async ({ body, error }) => {
    const getId = app.service.swat.parse(body.token)

    if (!getId) return error(404, ' fail')

    const user = await User.findById(getId.subject)

    if (!user) return error(404, 'fail')

    await user.updateOne({
      password: await argon2.hash(body.password),
    })

    return {
      status: 200,
      massage: 'success'
    }
  }, {
    body: t.Object({
      password: t.String(),
      token: t.String()
    })
  })
  .put('/delete-user/:id', async ({ params, body, error }) => {
    const user = await User.findById(params.id)
    if (!user) return error(404, 'not found')
    await user.updateOne({ active: body.active })
    return { status: 200, message: 'success', id: params.id, active: body.active }
  }, {
    params: t.Object({ id: idMongodb }),
    body: t.Object({
      active: t.Boolean()
    })
  })
  .get('/list-user', async ({ query }) => {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const keyword = query.keyword ?? '';

    const skip = (page - 1) * limit;
    // Bỏ filter cố định active=true theo yêu cầu -> mặc định lấy tất cả
    const filter: Record<string, any> = {};

    // Nếu có keyword thì thêm $or vào filter
    if (keyword) {
      filter.$or = [
        { name: { $regex: keyword, $options: 'i' } },
        { email: { $regex: keyword, $options: 'i' } }
      ];
    }

    const [users, total] = await Promise.all([
      User.find(filter).skip(skip).limit(limit).sort({ createdAt: -1 }),
      User.countDocuments(filter)
    ]);

    return {
      message: 'success',
      status: 200,
      data: users,
      total: total
    }
  }, {
    query: t.Object({
      page: t.Optional(t.Number({ minimum: 1 })),
      limit: t.Optional(t.Number({ minimum: 1, maximum: 50 })),
      keyword: t.Optional(t.String())
    })
  })
  // Hard delete user (xóa cứng) thay vì chỉ cập nhật active=false
  .delete('/hard-delete-user/:id', async ({ params, error }) => {
    const deleted = await User.findByIdAndDelete(params.id)
    if (!deleted) return error(404, 'fail')
    return { status: 200, message: 'deleted', id: params.id }
  }, {
    params: t.Object({ id: idMongodb })
  })
  .post('/pay-ment', async ({ body, error }) => {
    const bodyResponse = {
      orderCode: Number(String(Date.now()).slice(-6)),
      amount: body.price,
      description: body.email,
      items: [
        {
          name: body.name,
          quantity: body.amount,
          price: body.price,
        },
      ],
      returnUrl: `${app.config.URL_CLIENT + "/dashboard"}`,
      cancelUrl: `${app.config.URL_CLIENT + "/dashboard"}`,
      buyerEmail: body.email,
    };

    const paymentLinkResponse = await app.service.payOS.createPaymentLink(bodyResponse);

    if (!paymentLinkResponse) return error(404, 'fail')

    return paymentLinkResponse
  }, {
    body: t.Object({
      price: t.Number(),
      name: t.String(),
      amount: t.Number(),
      email: t.String({ format: 'email' })
    })
  })
  .put('/add-credit', async ({ body, error }) => {
    const getId = app.service.swat.parse(body.token)

    if (!getId) return error(404, ' fail')

    const user = await User.findById(getId.subject)

    if (!user) return error(404, 'fail')

    const creditNew = user.credit + body.amount

    await user.updateOne({
      credit: creditNew
    })

    await HistoryPayment.create({
      user: user._id,
      email: user.email,
      value: body.price,
      active: true
    })

    return {
      status: 200,
      message: "sucess"
    }
  },
    {
      body: t.Object({
        token: t.String(),
        amount: t.Number(),
        price: t.String()
      })
    })
  .post('/forgot-password', async ({ body, error }) => {
    const getUser = await User.findOne({ email: body.email })
    if (!getUser) return error(404, 'fail')

    const resend = new Resend(app.service.config.API_KEY_SEND_MAIL);
    const url = app.service.config.URL_CLIENT
    const token = await app.service.swat.create(getUser.id, getUser.role, Math.floor(Date.now() / 1000) + 300)
    resend.emails.send({
      from: 'veryfimail@aiknvm.vn',
      to: getUser.email,
      subject: 'Xác thực tài khoản',
      html: `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #ddd; border-radius: 8px; background-color: #ffffff; color: #000000;">
  <p style="font-size: 18px;">Xin chào <strong>${getUser.name}</strong>,</p>

  <p style="font-size: 16px; line-height: 1.6;">
    Bạn vừa yêu cầu đặt lại mật khẩu cho tài khoản của mình tại <strong>AIknvm</strong>.
  </p>

  <p style="font-size: 16px; line-height: 1.6;">
    Vui lòng nhấn vào nút bên dưới để thiết lập mật khẩu mới. Liên kết sẽ hết hạn sau 15 phút vì lý do bảo mật.
  </p>

  <div style="text-align: center; margin: 30px 0;">
    <a href="${url}/reset-password?token=${token}" style="display: inline-block; background-color:#007bff; color: #ffffff; text-decoration: none; padding: 12px 24px; font-size: 16px; border-radius: 6px;">
      Đặt lại mật khẩu
    </a>
  </div>

  <p style="font-size: 15px; line-height: 1.6;">
    Nếu bạn không yêu cầu đặt lại mật khẩu, vui lòng bỏ qua email này. Tài khoản của bạn vẫn an toàn 👍
  </p>

  <p style="font-size: 15px;">Nếu cần hỗ trợ, đừng ngần ngại liên hệ với đội ngũ chăm sóc khách hàng của chúng tôi.</p>

  <p style="font-size: 15px; margin-top: 30px;">Thân ái,<br /><strong>Đội ngũ ChatGPT Web by AIknvm</strong></p>

  <hr style="margin: 30px 0;" />

  <p style="font-size: 12px; text-align: center; color: #888888;">
    Nếu bạn không muốn nhận email, hãy ấn 
    <a href="#" style="color: #007bff;">Hủy đăng ký</a> hoặc 
    <a href="#" style="color: #007bff;">Tùy chỉnh thông báo</a>
  </p>
</div>
  `
    });
  }, {
    body: t.Object({
      email: t.String({ format: 'email' }),
    })
  })
  .post('/verify-tokken', ({ body, error }) => {
    const existToken = app.service.swat.verify(body.token)

    if (existToken == false) return error(404)

    return { status: 200 }
  }, {
    body: t.Object({
      token: t.String(),
    })
  })
  .post('/auth/google', async ({ body, error }) => {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code: body.code,
        client_id: app.config.CLIENT_ID_GOOGLE,
        client_secret: app.config.CLIENT_SCERET,
        redirect_uri: `${app.config.URL_CLIENT}/auth/callback`,
        grant_type: 'authorization_code'
      })
    })
    
    const tokenData = await tokenRes.json()
    const idToken = tokenData.id_token

    // Giải mã token (tuỳ chọn xác thực)
    const payload = JSON.parse(Buffer.from(idToken.split('.')[1], 'base64').toString())
    // Xử lý logic: tạo tài khoản hoặc trả về token
    const existUser = await UserModel.findOne({ email: payload.email })

    if (!existUser) {
      const getUser = await User.create({
        name: payload.name,
        email: payload.email,
        active: true,
        role: 'user',
        confirm: true,
        credit: 0,
        phone: '',
        image: payload.picture
      })
      const token = app.service.swat.create(getUser.id, getUser.role, Math.floor(Date.now() / 1000) + 21600)
      return { message: 'success', status: 200, token, email: getUser.email, data: true, phone: getUser.phone }
    }

    if (existUser.active === false) {
      return { status: 403, message: 'Tài khoản đã bị vô hiệu hóa' }
    }

    const token = app.service.swat.create(existUser.id, existUser.role, Math.floor(Date.now() / 1000) + 21600)
    return { message: 'success', status: 200, token, email: existUser.email, data: true , phone: existUser.phone}

  }, {
    body: t.Object({
      code: t.String()
    })
  })
  .post('/update-phone', async ({ body, error }) => {
    const getIdUser = app.service.swat.parse(body.token).subject

    const getUser = await UserModel.findById(getIdUser)

    if (!getUser) return error (404)
    
    const existPhone = await UserModel.findOne({ phone: body.phone })

    if (existPhone) return {
      status: 404,
      messsage: 'Số điện thoại đã tồn tại'
    }
    
    await getUser.updateOne({
      phone: body.phone
    })
    
    return {
      status: 200,
      messsage: 'success'
    }
  }, {
    body: t.Object({
      token: t.String(),
      phone: t.String()
    })
  })
    .post('/update-phone-mobile', async ({ body, error }) => {

    const getUser = await UserModel.findById(body.id)

    if (!getUser) return error (404)
    
    const existPhone = await UserModel.findOne({ phone: body.phone })

    if (existPhone) return {
      status: 404,
      messsage: 'Số điện thoại đã tồn tại'
    }
    
    await getUser.updateOne({
      phone: body.phone
    })
    
    return {
      status: 200,
      messsage: 'success'
    }
  }, {
    body: t.Object({
      id: t.String(),
      phone: t.String()
    })
  })
  .post('/mobile-login', async ({ body, error }) => {
    const existUser = await UserModel.findOne({ email: body.email })

    if (!existUser) {
      const getUser = await User.create({
        name: body.name,
        email: body.email,
        active: true,
        role: 'user',
        confirm: true,
        credit: 1,
        phone: '',
        image: body.picture
      })

      return { message: 'success', status: 200, email: getUser.email, data: true, role: getUser.role, id: getUser._id }
    }

    else if (existUser.active === true) {
      
      return { message: 'success', status: 200, email: existUser.email, data: true, role: existUser.role, id: existUser._id }
    }

    else if (existUser.role === 'admin') {
      return { message: 'success', status: 200, email: existUser.email, data: true, role: existUser.role, id: existUser._id }
    }

    else {
      error(404, 'Tài khoản đã bị khoá')
    }

  },{
    body: t.Object({
      email: t.String(),
      name: t.String(),
      picture: t.String()
    })
  })
.post('/auth/google-mobile', async ({ body, error }) => {
  try {
    const idToken: string | undefined = body.idToken
    if (!idToken) return error(400, 'Missing idToken')

    // 1) VERIFY chữ ký + audience
    const oauth = new OAuth2Client()
    const audiences = [
      app.config.CLIENT_ID_GOOGLE,           // Web Client ID (bắt buộc)
      app.config.CLIENT_ID_GOOGLE_ANDROID    // Android Client ID (nếu muốn chấp nhận cả mobile)
    ].filter(Boolean)

    const ticket = await oauth.verifyIdToken({ idToken, audience: audiences })
    const payload = ticket.getPayload()
    if (!payload?.email) return error(401, 'Invalid Google token')
    if (
      payload.iss &&
      !['accounts.google.com', 'https://accounts.google.com'].includes(payload.iss)
    ) {
      return error(401, 'Invalid issuer')
    }

    // 2) App logic: tạo tài khoản / trả token
    const email = payload.email
    const name = payload.name ?? email.split('@')[0]
    const image = payload.picture ?? ''

    let user = await UserModel.findOne({ email })
    if (!user) {
      user = await UserModel.create({
        name,
        email,
        image,
        active: true,
        role: 'user',
        confirm: true,
        credit: 0,
        phone: ''
      })
    } else if (user.active === false) {
      return { status: 403, message: 'Tài khoản đã bị vô hiệu hóa' }
    }

    const exp = Math.floor(Date.now() / 1000) + 21600 // 6h
    const token = app.service.swat.create(user.id, user.role, exp)

    return {
      message: 'success',
      status: 200,
      token,
      email: user.email,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        name: user.name,
        image: user.image
      }
    }
  } catch (e: any) {
    return error(401, e?.message ?? 'Mobile auth failed')
  }
}, {
  body: t.Object({
    idToken: t.String() // BẮT BUỘC phải có idToken, không cần code nữa
  })
})
  .put('/update-admin/:id', async ({ params, set, error }) => {
    const user = await User.findById(params.id)
    set.status = 404
    if (!user) return error(404, 'fail')

   await user.updateOne({
      active: true
    })

    const userLastUpdate = await User.findById(params.id);

    set.status = 201
    return userLastUpdate?.toObject()
  }, {
    params: t.Object({ id: idMongodb })
  })


export default controllerAuthen