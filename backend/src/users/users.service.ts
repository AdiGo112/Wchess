import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  /**
   * Public player directory. Selects explicitly (never `passwordHash`/`email`)
   * rather than deleting fields afterwards, so a new sensitive column can't
   * leak here by default.
   */
  async listUsers(page = 1, limit = 25, search?: string) {
    const take = Math.min(Math.max(limit, 1), 50);
    const skip = (Math.max(page, 1) - 1) * take;
    const where = search
      ? { username: { contains: search, mode: 'insensitive' as const } }
      : {};

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        select: {
          id: true,
          username: true,
          name: true,
          createdAt: true,
          ratings: { select: { variant: true, rating: true } },
        },
        orderBy: { username: 'asc' },
        skip,
        take,
      }),
      this.prisma.user.count({ where }),
    ]);

    // Flatten to one headline rating so the client doesn't have to pick.
    const players = users.map(({ ratings, ...u }) => ({
      ...u,
      rating: ratings.length
        ? Math.max(...ratings.map((r) => r.rating))
        : null,
    }));

    return { players, total, page, limit: take };
  }

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
