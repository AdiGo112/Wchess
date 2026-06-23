import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Message } from './message.schema';

@Injectable()
export class ChatService {
  constructor(@InjectModel(Message.name) private messageModel: Model<Message>) {}

  async saveMessage(data: {
    roomId: string;
    roomType: string;
    senderId: string;
    username: string;
    text: string;
  }): Promise<Message> {
    return this.messageModel.create(data);
  }

  async getHistory(roomId: string, before?: string, limit = 50): Promise<any[]> {
    const query: any = { roomId };
    if (before) query.createdAt = { $lt: new Date(before) };
    return this.messageModel
      .find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();
  }
}
