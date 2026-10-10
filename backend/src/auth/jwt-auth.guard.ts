import { ExecutionContext, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';

const IS_PUBLIC = 'isPublic';
/** Opt a route (or a whole controller) out of the global JWT guard. */
export const Public = () => SetMetadata(IS_PUBLIC, true);

/**
 * Bound globally in AppModule (ship-plan 1.2): every HTTP route needs a valid
 * access token unless it is marked @Public(), so a new route that forgets
 * about auth fails closed instead of open.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private reflector: Reflector) {
    super();
  }

  canActivate(ctx: ExecutionContext) {
    // Sockets authenticate in GameGateway.handleConnection, not here.
    if (ctx.getType() !== 'http') return true;
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [ctx.getHandler(), ctx.getClass()]);
    return isPublic || super.canActivate(ctx);
  }
}
