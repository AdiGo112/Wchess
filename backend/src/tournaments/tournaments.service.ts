import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';

@Injectable()
export class TournamentsService {
  constructor(private prisma: PrismaService) {}

  async list(status?: string) {
    return this.prisma.tournament.findMany({
      where: status ? { status: status.toUpperCase() as any } : undefined,
      orderBy: { startAt: 'asc' },
      include: { _count: { select: { players: true } } },
    });
  }

  async getById(id: string) {
    const t = await this.prisma.tournament.findUnique({
      where: { id },
      include: { players: { include: { user: { select: { username: true, avatarUrl: true } } } } },
    });
    if (!t) throw new NotFoundException('Tournament not found');
    return t;
  }

  async create(userId: string, data: {
    name: string;
    format?: string;
    variant?: string;
    timeControl: number;
    rounds?: number;
    maxPlayers?: number;
    startAt: string;
  }) {
    return this.prisma.tournament.create({
      data: {
        name: data.name,
        format: (data.format?.toUpperCase() as any) || 'SWISS',
        variant: (data.variant?.toUpperCase() as any) || 'BLITZ',
        timeControl: data.timeControl,
        rounds: data.rounds || 7,
        maxPlayers: data.maxPlayers || 64,
        startAt: new Date(data.startAt),
        createdBy: userId,
      },
    });
  }

  async join(tournamentId: string, userId: string) {
    const tournament = await this.getById(tournamentId);
    if (tournament.status !== 'UPCOMING' && tournament.status !== 'ONGOING') {
      throw new ForbiddenException('Tournament is not open for registration');
    }
    if (tournament.players.length >= tournament.maxPlayers) {
      throw new ForbiddenException('Tournament is full');
    }

    return this.prisma.tournamentPlayer.create({
      data: { tournamentId, userId },
    });
  }

  async leave(tournamentId: string, userId: string) {
    await this.prisma.tournamentPlayer.deleteMany({
      where: { tournamentId, userId },
    });
  }

  async getStandings(tournamentId: string) {
    return this.prisma.tournamentPlayer.findMany({
      where: { tournamentId },
      orderBy: [{ score: 'desc' }, { tiebreak: 'desc' }],
      include: { user: { select: { username: true, avatarUrl: true } } },
    });
  }
}
