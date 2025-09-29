import { Schema, model, type ObjectId } from "mongoose";

interface IFile {
    url: string,
    bot: ObjectId,
    createdAt: Date,
    updatedAt: Date,
    active: boolean,
    typeFile: string,
}

const FileManageSchema = new Schema<IFile>({
    url: { type: String, required: true, unique: true},
    bot: { type: Schema.Types.ObjectId, ref: 'BotManange', required: true },
    typeFile: { type: String, required: true},
    active: { type: Boolean, required: true},
}, {
    timestamps: true
})

export default model<IFile>('FileBotManage', FileManageSchema)