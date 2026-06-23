import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true })
export class Notification extends Document {
  @Prop({ required: true, index: true }) userId: string;
  @Prop({ required: true }) type: string;
  @Prop({ type: Object }) data: Record<string, any>;
  @Prop({ default: false, index: true }) read: boolean;
  @Prop({ default: Date.now }) createdAt: Date;
}

export const NotificationSchema = SchemaFactory.createForClass(Notification);
NotificationSchema.index({ userId: 1, read: 1, createdAt: -1 });
