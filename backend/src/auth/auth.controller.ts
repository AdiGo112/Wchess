import {
  Controller,
  Post,
  Get,
  Body,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
  Res,
} from '@nestjs/common';
import type { CookieOptions, Request as Req, Response } from 'express';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiBody } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthService, REFRESH_TOKEN_DAYS } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { LocalAuthGuard } from './local-auth.guard';
import { Public } from './jwt-auth.guard';

/**
 * Credential endpoints get a far tighter limit than the global one (10/s), which
 * is no brake at all on password guessing: AUTH_RATE_LIMIT requests per minute
 * per client IP, default 10 (ship-plan 0.5). Failures are also logged
 * (login_failed), so a burst is visible. Not on /me, which every page load calls.
 */
const AUTH_PER_MIN = Number(process.env.AUTH_RATE_LIMIT) || 10;
const CredentialLimit = () => Throttle({ short: { limit: AUTH_PER_MIN, ttl: 60_000 } });

/**
 * The refresh token lives only in this cookie (ship-plan 1.1): HttpOnly so no
 * script on the page can read it, SameSite=Strict + one origin so no other site
 * can make the browser send it, and scoped to /auth so no other route sees it.
 * Secure in production only, so a plain-http localhost demo still works.
 */
const REFRESH_COOKIE = 'rt';
const cookieOptions = (): CookieOptions => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict',
  path: '/api/v1/auth',
});
const readRefreshCookie = (req: Req) =>
  req.headers.cookie?.match(/(?:^|;\s*)rt=([^;]+)/)?.[1]; // ponytail: one cookie, no cookie-parser
const setRefreshCookie = (res: Response, token: string) =>
  res.cookie(REFRESH_COOKIE, token, { ...cookieOptions(), maxAge: REFRESH_TOKEN_DAYS * 86_400_000 });

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Public()
  @Post('register')
  @CredentialLimit()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Register a new user' })
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Public()
  @Post('login')
  @CredentialLimit()
  @HttpCode(HttpStatus.OK)
  @UseGuards(LocalAuthGuard)
  @ApiOperation({ summary: 'Login with username + password' })
  @ApiBody({ type: LoginDto })
  async login(@Request() req: any, @Res({ passthrough: true }) res: Response) {
    const { refreshToken, ...body } = await this.authService.login(req.user);
    setRefreshCookie(res, refreshToken);
    return body;
  }

  @Public()
  @Post('refresh')
  @CredentialLimit()
  @ApiOperation({ summary: 'Rotate refresh token and issue new access token' })
  async refresh(@Request() req: Req, @Res({ passthrough: true }) res: Response) {
    const raw = readRefreshCookie(req);
    // No cookie is a logged-out visitor asking on page load, not a failure: 204,
    // so every anonymous page view doesn't log a 401 (here and in the browser console).
    if (!raw) {
      res.status(HttpStatus.NO_CONTENT);
      return;
    }
    try {
      const { refreshToken, accessToken } = await this.authService.refresh({ refreshToken: raw });
      setRefreshCookie(res, refreshToken);
      res.status(HttpStatus.OK);
      return { accessToken };
    } catch (err) {
      res.clearCookie(REFRESH_COOKIE, cookieOptions()); // dead token: stop the browser resending it
      throw err;
    }
  }

  @Public()
  @Post('logout')
  @CredentialLimit()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoke all refresh tokens for current user' })
  async logout(@Request() req: Req, @Res({ passthrough: true }) res: Response) {
    const raw = readRefreshCookie(req);
    if (raw) await this.authService.logoutByRefreshToken(raw);
    res.clearCookie(REFRESH_COOKIE, cookieOptions());
  }

  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current authenticated user' })
  getMe(@Request() req: any) {
    return this.authService.getMe(req.user.id);
  }
}
