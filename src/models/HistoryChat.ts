import { Schema, model, type ObjectId } from "mongoose";

interface IHistory {
    bot: ObjectId,
    user: ObjectId,
    name: string,
    updatedAt: Date,
    createdAt: Date,
    active: boolean
}

const HistoryChatSchema = new Schema<IHistory>({
    bot: { type: Schema.Types.ObjectId, ref: 'BotManange', required: true },
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String },
    active: { type: Boolean, required: true}
}, {
    timestamps: true
})

export default model<IHistory>('HistoryChat', HistoryChatSchema)