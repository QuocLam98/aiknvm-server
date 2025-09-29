import { Schema, model } from "mongoose";

interface IField {
    name: string,
    createdAt: Date,
    updatedAt: Date,
    active: boolean,
}

const FieldSchema = new Schema<IField>({
    name: { type: String, required: true, unique: true},
    active: { type: Boolean, required: true},
}, {
    timestamps: true
})

export default model<IField>('Field', FieldSchema)