import { Schema, model } from "mongoose";

interface IStore {
    name: string,
    description: string,
    url: string,
    createdAt: Date,
    updatedAt: Date,
    active: boolean,
    price: string,
    fileType: string,
    type: string,
}

const StoreSchema = new Schema<IStore>({
    name: { type: String, required: true, unique: true},
    description: { type: String,},
    url: { type: String },
    price: { type: String },
    fileType: { type: String },
    active: { type: Boolean, required: true},
    type: { type: String },
}, {
    timestamps: true
})

export default model<IStore>('StoreManage', StoreSchema)