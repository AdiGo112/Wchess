import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Notification } from './notification.schema';

@Injectable()
export class NotificationsService {
  constructor(
    @InjectModel(Notification.name) private notifModel: Model<Notification>,
  ) {}

  async create(userId: string, type: string, data: Record<string, any>) {
    return this.notifModel.create({ userId, type, data });
  }

  async getForUser(userId: string, limit = 20) {
    return this.notifModel
      .find({ userId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();
  }

  async markRead(notifId: string, userId: string) {
    return this.notifModel.findOneAndUpdate(
      { _id: notifId, userId },
      { read: true },
      { new: true },
    );
  }

  async markAllRead(userId: string) {
    return this.notifModel.updateMany({ userId, read: false }, { read: true });
  }

  async getUnreadCount(userId: string): Promise<number> {
    return this.notifModel.countDocuments({ userId, read: false });
  }
}
