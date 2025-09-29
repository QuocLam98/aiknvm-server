import { Schema, model, type ObjectId } from "mongoose";

interface IFile {
    url: string,
    bot: ObjectId,
    user: ObjectId,
    createdAt: Date,
    updatedAt: Date,
    active: boolean,
    typeFile: string,
    name: string
}

const FileUserManageSchema = new Schema<IFile>({
    url: { type: String, required: true, unique: true},
    bot: { type: Schema.Types.ObjectId, ref: 'BotManange', required: true },
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    typeFile: { type: String, required: true},
    name: { type: String, required: true},
    active: { type: Boolean, required: true},
}, {
    timestamps: true
})

export default model<IFile>('FileUserBotManage', FileUserManageSchema)