import { Schema, model } from "mongoose";

interface IBot {
    name: string,
    description: string,
    templateMessage: string,
    createdAt: Date,
    updatedAt: Date,
    active: boolean,
    image: string,
    status: number,
    priority?: string,
    models: string
}

const BotSchema = new Schema<IBot>({
    name: { type: String, required: true, unique: true},
    description: { type: String,},
    templateMessage: { type: String },
    active: { type: Boolean, required: true},
    image: { type: String },
    status: { type: Number},
    priority: { type: String, default: '0' },
    models: { type: String, default: '1' }
}, {
    timestamps: true
})

export default model<IBot>('BotManange', BotSchema)