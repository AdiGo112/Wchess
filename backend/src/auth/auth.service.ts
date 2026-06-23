import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../common/prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

  async register(dto: RegisterDto) {
    const existing = await this.prisma.user.findFirst({
      where: { OR: [{ username: dto.username }, { email: dto.email }] },
    });

    if (existing?.username === dto.username) {
      throw new ConflictException({ code: 'AUTH_001', message: 'Username already taken' });
    }
    if (existing?.email === dto.email) {
      throw new ConflictException({ code: 'AUTH_002', message: 'Email already registered' });
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);

    const user = await this.prisma.user.create({
      data: {
        username: dto.username,
        email: dto.email,
        name: dto.name,
        passwordHash,
        ratings: {
          create: [
            { variant: 'BLITZ' },
            { variant: 'BULLET' },
            { variant: 'RAPID' },
            { variant: 'CLASSICAL' },
          ],
        },
      },
    });

    const token = this.signToken(user.id, user.username, user.role);
    return { accessToken: token, user: this.sanitize(user) };
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { username: dto.username },
    });

    if (!user || !user.passwordHash) {
      throw new UnauthorizedException({ code: 'AUTH_003', message: 'Invalid credentials' });
    }

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException({ code: 'AUTH_003', message: 'Invalid credentials' });
    }

    if (user.isBanned) {
      throw new UnauthorizedException({ code: 'AUTH_006', message: 'Account suspended' });
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastSeenAt: new Date() },
    });

    const token = this.signToken(user.id, user.username, user.role);
    return { accessToken: token, user: this.sanitize(user) };
  }

  async getMe(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        ratings: true,
      },
    });
    if (!user) throw new UnauthorizedException();
    return this.sanitize(user);
  }

  private signToken(userId: string, username: string, role: string) {
    return this.jwtService.sign(
      { sub: userId, username, role },
      { expiresIn: process.env.JWT_EXPIRES_IN || '15m' },
    );
  }

  private sanitize(user: any) {
    const { passwordHash, ...safe } = user;
    return safe;
  }
}
