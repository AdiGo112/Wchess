import {
  Controller,
  Post,
  Get,
  Body,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiBody } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';
import { LocalAuthGuard } from './local-auth.guard';
import { JwtAuthGuard } from './jwt-auth.guard';

/**
 * Credential endpoints get a far tighter limit than the global one (10/s), which
 * is no brake at all on password guessing: AUTH_RATE_LIMIT requests per minute
 * per client IP, default 10 (ship-plan 0.5). Failures are also logged
 * (login_failed), so a burst is visible. Not on /me, which every page load calls.
 */
const AUTH_PER_MIN = Number(process.env.AUTH_RATE_LIMIT) || 10;
const CredentialLimit = () => Throttle({ short: { limit: AUTH_PER_MIN, ttl: 60_000 } });

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('register')
  @CredentialLimit()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Register a new user' })
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('login')
  @CredentialLimit()
  @HttpCode(HttpStatus.OK)
  @UseGuards(LocalAuthGuard)
  @ApiOperation({ summary: 'Login with username + password' })
  @ApiBody({ type: LoginDto })
  login(@Request() req: any) {
    return this.authService.login(req.user);
  }

  @Post('refresh')
  @CredentialLimit()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Rotate refresh token and issue new access token' })
  refresh(@Body() dto: RefreshDto) {
    return this.authService.refresh(dto);
  }

  @Post('logout')
  @CredentialLimit()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoke all refresh tokens for current user' })
  async logout(@Body() dto: RefreshDto) {
    await this.authService.logoutByRefreshToken(dto.refreshToken);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current authenticated user' })
  getMe(@Request() req: any) {
    return this.authService.getMe(req.user.id);
  }
}
