import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async getPublicProfile(username: string) {
    const user = await this.prisma.user.findUnique({
      where: { username },
      include: { ratings: true },
    });
    if (!user) throw new NotFoundException('User not found');
    const { passwordHash, email, ...safe } = user;
    return safe;
  }

  async getStats(username: string) {
    const user = await this.prisma.user.findUnique({
      where: { username },
      include: { ratings: true },
    });
    if (!user) throw new NotFoundException('User not found');

    const totalGames = await this.prisma.game.count({
      where: { OR: [{ whiteId: user.id }, { blackId: user.id }] },
    });

    return {
      userId: user.id,
      username: user.username,
      ratings: user.ratings,
      totalGames,
    };
  }

  async updateProfile(userId: string, dto: { name?: string; bio?: string; country?: string }) {
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: dto,
    });
    const { passwordHash, ...safe } = updated;
    return safe;
  }

  async findById(id: string) {
    return this.prisma.user.findUnique({ where: { id } });
  }
}
