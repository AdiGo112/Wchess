import {
  Injectable,
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../common/prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { RefreshDto } from './dto/refresh.dto';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

  async register(dto: RegisterDto) {
    const existingEmail = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
    });
    if (existingEmail) {
      throw new ConflictException({ message: 'Email already registered', code: 'EMAIL_ALREADY_EXISTS' });
    }

    const existingUsername = await this.prisma.user.findUnique({
      where: { username: dto.username },
    });
    if (existingUsername) {
      throw new ConflictException({ message: 'Username already taken', code: 'USERNAME_ALREADY_EXISTS' });
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);

    try {
      const user = await this.prisma.user.create({
        data: {
          username: dto.username,
          email: dto.email.toLowerCase(),
          name: dto.name,
          passwordHash,
          ratings: {
            create: [
              { variant: 'BULLET' },
              { variant: 'BLITZ' },
              { variant: 'RAPID' },
              { variant: 'CLASSICAL' },
            ],
          },
        },
      });
      return { user: this.toProfile(user) };
    } catch (e: any) {
      if (e?.code === 'P2002') {
        const target: string[] = e?.meta?.target ?? [];
        const code = target.some((f) => f.includes('email'))
          ? 'EMAIL_ALREADY_EXISTS'
          : 'USERNAME_ALREADY_EXISTS';
        throw new ConflictException({ message: 'Already exists', code });
      }
      throw e;
    }
  }

  async validateUser(username: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { username } });
    if (!user || !user.passwordHash) return null;
    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) return null;
    if (user.isBanned) return null;
    return user;
  }

  async login(user: any) {
    const payload = { sub: user.id, username: user.username, role: user.role };
    const accessToken = this.jwtService.sign(payload);

    const rawRefreshToken = crypto.randomBytes(64).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawRefreshToken).digest('hex');

    await this.prisma.refreshToken.create({
      data: {
        token: tokenHash,
        userId: user.id,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastSeenAt: new Date() },
    });

    return { accessToken, refreshToken: rawRefreshToken, user: this.toProfile(user) };
  }

  async refresh(dto: RefreshDto): Promise<{ accessToken: string; refreshToken: string }> {
    const tokenHash = crypto.createHash('sha256').update(dto.refreshToken).digest('hex');

    return this.prisma.$transaction(async (tx) => {
      const storedToken = await tx.refreshToken.findUnique({ where: { token: tokenHash } });

      if (!storedToken) {
        throw new UnauthorizedException({ message: 'Refresh token not found', code: 'REFRESH_TOKEN_INVALID' });
      }

      if (storedToken.expiresAt < new Date()) {
        // Don't attempt delete inside the transaction — throwing here rolls back everything,
        // so the delete would never commit. Expired tokens are harmless (always rejected by
        // this check) and are cleaned up when the user logs out or via a scheduled job.
        throw new UnauthorizedException({ message: 'Refresh token expired', code: 'REFRESH_TOKEN_INVALID' });
      }

      // Check user BEFORE deleting — banned users should not be able to rotate their token
      const user = await tx.user.findUnique({ where: { id: storedToken.userId } });
      if (!user || user.isBanned) {
        throw new UnauthorizedException({ message: 'User not found or banned', code: 'REFRESH_TOKEN_INVALID' });
      }

      // Atomic rotation: delete old, create new.
      // Catch P2025 in case a concurrent request already consumed this token.
      try {
        await tx.refreshToken.delete({ where: { id: storedToken.id } });
      } catch (e: any) {
        if (e?.code === 'P2025') {
          throw new UnauthorizedException({ message: 'Refresh token not found', code: 'REFRESH_TOKEN_INVALID' });
        }
        throw e;
      }

      const payload = { sub: user.id, username: user.username, role: user.role };
      const accessToken = this.jwtService.sign(payload);

      const rawRefreshToken = crypto.randomBytes(64).toString('hex');
      const newTokenHash = crypto.createHash('sha256').update(rawRefreshToken).digest('hex');

      await tx.refreshToken.create({
        data: {
          token: newTokenHash,
          userId: user.id,
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
      });

      return { accessToken, refreshToken: rawRefreshToken };
    });
  }

  async logoutByRefreshToken(rawRefreshToken: string): Promise<void> {
    const tokenHash = crypto.createHash('sha256').update(rawRefreshToken).digest('hex');
    const stored = await this.prisma.refreshToken.findUnique({ where: { token: tokenHash } });
    if (!stored) return; // already logged out — idempotent
    await this.prisma.refreshToken.deleteMany({ where: { userId: stored.userId } });
  }

  async getMe(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException();
    return this.toProfile(user);
  }

  private toProfile(user: any) {
    return {
      id: user.id,
      username: user.username,
      email: user.email,
      name: user.name,
      role: user.role,
      avatarUrl: user.avatarUrl ?? null,
      createdAt: user.createdAt,
    };
  }
}
