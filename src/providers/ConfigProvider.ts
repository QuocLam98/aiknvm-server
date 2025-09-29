import { defineProvider } from './Application'


export default defineProvider(() => {
    const config = {
        PORT: process.env.APP_PORT as string,
        CONNECT : process.env.CONNECT_STRING_MONGODB as string,
        JWT_ALG : process.env.JWT_ALG as string,
        JWT_SECRET : process.env.JWT_SECRET as string,
        OPENAI_KEY: process.env.OPENAI_KEY as string,
        URL_CLIENT: process.env.URL_CLIENT as string,
        API_KEY_SEND_MAIL: process.env.API_KEY_SEND_MAIL as string,
        ACCESSKEYID: process.env.ACCESSKEYID as string,
        SECRETACCESSKEY: process.env.SECRETACCESSKEY as string,
        BUCKET: process.env.BUCKET as string,
        ENDPOINT: process.env.ENDPOINT as string,
        BUCKET_AVA: process.env.ENDPOINT as string,
        BUCKET_FILE: process.env.ENDPOINT as string,
        CLIENT_ID: process.env.CLIENT_ID as string,
        KEY_PAY: process.env.KEY_PAY as string,
        CHESUN_KEY: process.env.CHESUN_KEY as string,
        URL_SERVER: process.env.URL_SERVER as string,
        CREATE_IMAGE: process.env.CREATE_IMAGE as string,
        CREATE_IMAGE_PREMIUM: process.env.CREATE_IMAGE_PREMIUM as string,
        CLIENT_ID_GOOGLE: process.env.CLIENT_ID_GOOGLE as string,
        CLIENT_SCERET: process.env.CLIENT_SCERET as string,
        CLIENT_ID_GOOGLE_ANDROID: process.env.CLIENT_ID_GOOGLE_ANDROID as string,
        GEMINI_KEY: process.env.GEMINI_KEY as string,
    }

    return {config}
})