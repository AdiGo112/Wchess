import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true })
export class Message extends Document {
  @Prop({ required: true, index: true }) roomId: string;
  @Prop({ required: true, enum: ['game', 'tournament', 'study', 'dm'] }) roomType: string;
  @Prop({ required: true }) senderId: string;
  @Prop({ required: true }) username: string;
  @Prop({ required: true, maxlength: 500 }) text: string;
  @Prop({ default: Date.now }) createdAt: Date;
}

export const MessageSchema = SchemaFactory.createForClass(Message);
MessageSchema.index({ roomId: 1, createdAt: -1 });
MessageSchema.index({ createdAt: 1 }, { expireAfterSeconds: 30 * 24 * 3600 });
