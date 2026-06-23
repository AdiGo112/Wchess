import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';

@Injectable()
export class PuzzlesService {
  constructor(private prisma: PrismaService) {}

  async getDailyPuzzle() {
    const dayIndex = Math.floor(Date.now() / 86400000);
    const total = await this.prisma.puzzle.count();
    if (total === 0) return null;
    const skip = dayIndex % total;
    const puzzles = await this.prisma.puzzle.findMany({ skip, take: 1 });
    return puzzles[0] ?? null;
  }

  async getById(id: string) {
    const puzzle = await this.prisma.puzzle.findUnique({ where: { id } });
    if (!puzzle) throw new NotFoundException('Puzzle not found');
    return puzzle;
  }

  async getNext(userId: string) {
    const recent = await this.prisma.puzzleAttempt.findMany({
      where: { userId },
      select: { puzzleId: true },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    const seen = recent.map(a => a.puzzleId);

    const puzzle = await this.prisma.puzzle.findFirst({
      where: seen.length > 0 ? { id: { notIn: seen } } : {},
      orderBy: { rating: 'asc' },
    });
    return puzzle;
  }

  async submitAttempt(userId: string, puzzleId: string, moves: string[], timeMs: number) {
    const puzzle = await this.getById(puzzleId);
    const solved = this.checkSolution(moves, puzzle.moves);

    await this.prisma.puzzleAttempt.create({
      data: { userId, puzzleId, solved, timeMs },
    });

    await this.prisma.puzzle.update({
      where: { id: puzzleId },
      data: { plays: { increment: 1 } },
    });

    return { solved, correctMoves: puzzle.moves };
  }

  private checkSolution(submitted: string[], correct: string[]): boolean {
    if (submitted.length < correct.length) return false;
    return correct.every((move, i) => move.toLowerCase() === submitted[i]?.toLowerCase());
  }

  async getByTheme(theme: string, limit = 10) {
    return this.prisma.puzzle.findMany({
      where: { themes: { has: theme } },
      orderBy: { plays: 'desc' },
      take: limit,
    });
  }
}
