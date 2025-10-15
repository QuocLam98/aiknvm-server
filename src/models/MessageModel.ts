import { Schema, model, type ObjectId } from "mongoose";

interface IMessage {
    bot: ObjectId,
    user: ObjectId,
    contentUser: string,
    contentBot: string,
    fileUser: string,
    tookenRequest: string,
    tookendResponse: string,
    creditCost: number,
    updatedAt: Date,
    createdAt: Date,
    history: ObjectId,
    status: number,
    voice: string,
    active: boolean,
    fileType: string,
    models?: string
}

const MessageSchema = new Schema<IMessage>({
    bot: { type: Schema.Types.ObjectId, ref: 'BotManange', required: true },
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    contentUser: { type: String},
    fileUser: { type: String},
    contentBot: { type: String },
    tookenRequest: { type: String },
    voice: { type: String },
    tookendResponse: { type: String },
    fileType: { type: String },
    creditCost: { type: Number, default: 0 },
    status: { type: Number, default: 0 },
    history: { type: Schema.Types.ObjectId, default: null  },
    active: { type: Boolean, required: true},
    models: { type: String },
}, {
    timestamps: true
})

export default model<IMessage>('MessageManage', MessageSchema)