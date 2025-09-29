import { Elysia } from "elysia";
import { Schema, model } from "mongoose";

interface IUser {
    name: string,
    email: string,
    password: string,
    credit: number,
    bankAccount: string,
    createdAt: Date,
    updatedAt: Date,
    active: boolean,
    bank: string,
    role: string,
    creditUsed: number,
    confirm: Boolean,
    phone: string,
    image: string
}

const UserSchema = new Schema<IUser>({
    name: { type: String, required: true},
    email: { type: String, required: true, unique: true,},
    password: { type: String},
    credit: { type: Number, default: 0 },
    bankAccount: { type: String },
    image: { type: String },
    bank: {type: String},
    phone: {type: String},
    active: { type: Boolean, required: true},
    role: {type: String, required: true},
    creditUsed: { type: Number, default: 0 },
    confirm: { type: Boolean, default: false},
}, {
    timestamps: true
})

export default model<IUser>('User', UserSchema)