# 01-Auth — Implementation Prompt: Increment 2

Copy and paste this entire prompt to an AI coding assistant. It is self-contained.

---

You are implementing Increment 2 of the authentication feature for ChessWeb: refresh token rotation and logout.

## Current state of the codebase

Increment 1 is complete. The following files exist and are working:
- `backend/src/auth/auth.service.ts` — has register(), validateUser(), login(), getMe()
- `backend/src/auth/auth.controller.ts` — has POST /auth/register, POST /auth/login, GET /auth/me
- `backend/prisma/schema.prisma` — has User and RefreshToken models
- `backend/src/auth/guards/jwt-auth.guard.ts` — JwtAuthGuard working

The RefreshToken table has columns: id, tokenHash (SHA-256 of raw token), userId, expiresAt, createdAt, revoked.

## What you are building in this increment

Two new endpoints and two new service methods:
1. POST /auth/refresh — exchange a valid refresh token for new access + refresh tokens (token rotation)
2. POST /auth/logout — revoke all refresh tokens for the current user

## Files to modify

### Modify: `backend/src/auth/auth.service.ts`

Add two methods:

```typescript
async refresh(dto: RefreshDto): Promise<{ accessToken: string; refreshToken: string }> {
  // 1. Hash the presented token
  const tokenHash = crypto.createHash('sha256').update(dto.refreshToken).digest('hex');
  
  // 2. Find the RefreshToken row
  const storedToken = await this.prisma.refreshToken.findUnique({ where: { tokenHash } });
  
  // 3. Validate
  if (!storedToken) {
    throw new UnauthorizedException({ message: 'Refresh token not found', code: 'REFRESH_TOKEN_INVALID' });
  }
  if (storedToken.expiresAt < new Date()) {
    // Clean up expired token
    await this.prisma.refreshToken.delete({ where: { id: storedToken.id } });
    throw new UnauthorizedException({ message: 'Refresh token expired', code: 'REFRESH_TOKEN_INVALID' });
  }
  if (storedToken.revoked) {
    throw new UnauthorizedException({ message: 'Refresh token revoked', code: 'REFRESH_TOKEN_INVALID' });
  }
  
  // 4. Delete old token (rotation — old token is now invalid)
  await this.prisma.refreshToken.delete({ where: { id: storedToken.id } });
  
  // 5. Get user
  const user = await this.prisma.user.findUniqueOrThrow({ where: { id: storedToken.userId } });
  
  // 6. Issue new tokens
  const payload: JwtPayload = { sub: user.id, username: user.username };
  const accessToken = this.jwtService.sign(payload, { expiresIn: '15m' });
  const rawRefreshToken = crypto.randomBytes(64).toString('hex');
  const newTokenHash = crypto.createHash('sha256').update(rawRefreshToken).digest('hex');
  
  // 7. Store new refresh token
  await this.prisma.refreshToken.create({
    data: {
      tokenHash: newTokenHash,
      userId: user.id,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  });
  
  return { accessToken, refreshToken: rawRefreshToken };
}

async logout(userId: string): Promise<void> {
  // Delete all refresh tokens for this user (logout from all devices)
  await this.prisma.refreshToken.deleteMany({ where: { userId } });
}
```

### Modify: `backend/src/auth/auth.controller.ts`

Add two routes:

```typescript
@Post('refresh')
@HttpCode(200)
async refresh(@Body() dto: RefreshDto) {
  return this.authService.refresh(dto);
}

@Post('logout')
@HttpCode(204)
@UseGuards(JwtAuthGuard)
async logout(@Request() req) {
  await this.authService.logout(req.user.userId);
}
```

### Create: `backend/src/auth/dto/refresh.dto.ts`

```typescript
import { IsString } from 'class-validator';

export class RefreshDto {
  @IsString()
  refreshToken: string;
}
```

## Verification

```bash
# 1. Login to get tokens
TOKEN_RESPONSE=$(curl -s -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123"}')

ACCESS_TOKEN=$(echo $TOKEN_RESPONSE | jq -r '.accessToken')
REFRESH_TOKEN=$(echo $TOKEN_RESPONSE | jq -r '.refreshToken')

# 2. Refresh tokens
REFRESH_RESPONSE=$(curl -s -X POST http://localhost:3000/auth/refresh \
  -H "Content-Type: application/json" \
  -d "{\"refreshToken\":\"$REFRESH_TOKEN\"}")
echo $REFRESH_RESPONSE  # Should have new accessToken and refreshToken

NEW_REFRESH_TOKEN=$(echo $REFRESH_RESPONSE | jq -r '.refreshToken')

# 3. Try to reuse old refresh token (should fail)
curl -X POST http://localhost:3000/auth/refresh \
  -H "Content-Type: application/json" \
  -d "{\"refreshToken\":\"$REFRESH_TOKEN\"}"
# Expected: 401 REFRESH_TOKEN_INVALID

# 4. Logout
curl -X POST http://localhost:3000/auth/logout \
  -H "Authorization: Bearer $ACCESS_TOKEN"
# Expected: 204 No Content

# 5. Try refresh after logout (should fail)
curl -X POST http://localhost:3000/auth/refresh \
  -H "Content-Type: application/json" \
  -d "{\"refreshToken\":\"$NEW_REFRESH_TOKEN\"}"
# Expected: 401 REFRESH_TOKEN_INVALID
```
