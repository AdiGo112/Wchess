# Feature 09 — Social: Increment 2 Implementation Prompt

Copy and paste the following prompt into a fresh AI conversation. It is fully self-contained.

---

You are implementing Increment 2 of the Social feature for ChessWeb, a NestJS 10 + React chess platform.

**Increment 2 goal**: Implement `FriendshipsModule` with full CRUD service logic and REST controller. The Prisma models from Increment 1 are already in the database.

## Existing Codebase State

- NestJS 10 backend
- `prisma/schema.prisma` contains `Friendship` model and `FriendshipStatus` enum (PENDING, ACCEPTED, DECLINED, BLOCKED)
- `PrismaService` is already provided by `PrismaModule` (injectable as `@Inject(PrismaService)` or via constructor)
- `JwtAuthGuard` exists at `src/auth/guards/jwt-auth.guard.ts` and decorates `req.user.sub` with the userId from the JWT
- A `PresenceService` stub exists (or will be injected); for now, `getOnlineStatus(ids)` returns `ids.map(() => false)`
- Route prefix for all social endpoints is `/social`

## Files to Create

### File 1: `src/friendships/dto/send-friend-request.dto.ts`

```typescript
import { IsString, IsNotEmpty } from 'class-validator';

export class SendFriendRequestDto {
  @IsString()
  @IsNotEmpty()
  addresseeId: string;
}
```

### File 2: `src/friendships/friendships.service.ts`

```typescript
import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PresenceService } from '../presence/presence.service';

@Injectable()
export class FriendshipService {
  private readonly logger = new Logger(FriendshipService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly presenceService: PresenceService,
  ) {}

  async sendRequest(requesterId: string, addresseeId: string) {
    if (requesterId === addresseeId) {
      throw new BadRequestException('Cannot send friend request to yourself');
    }

    const addressee = await this.prisma.user.findUnique({ where: { id: addresseeId } });
    if (!addressee) {
      throw new NotFoundException('User not found');
    }

    // Check for any BLOCKED row in either direction
    const blockedRow = await this.prisma.friendship.findFirst({
      where: {
        OR: [
          { requesterId, addresseeId, status: 'BLOCKED' },
          { requesterId: addresseeId, addresseeId: requesterId, status: 'BLOCKED' },
        ],
      },
    });
    if (blockedRow) {
      throw new ForbiddenException('Cannot send request to this user');
    }

    try {
      return await this.prisma.friendship.create({
        data: { requesterId, addresseeId, status: 'PENDING' },
        include: { requester: { select: { username: true } } },
      });
    } catch (e: any) {
      if (e?.code === 'P2002') {
        throw new ConflictException('Friend request already exists');
      }
      throw e;
    }
  }

  async acceptRequest(friendshipId: string, currentUserId: string) {
    const friendship = await this.prisma.friendship.findUnique({
      where: { id: friendshipId },
      include: { requester: { select: { id: true, username: true } } },
    });
    if (!friendship) throw new NotFoundException('Friendship not found');
    if (friendship.addresseeId !== currentUserId) {
      throw new ForbiddenException('Only the addressee can accept a request');
    }
    if (friendship.status !== 'PENDING') {
      throw new ConflictException('Request is not in PENDING status');
    }
    return this.prisma.friendship.update({
      where: { id: friendshipId },
      data: { status: 'ACCEPTED' },
    });
  }

  async declineRequest(friendshipId: string, currentUserId: string) {
    const friendship = await this.prisma.friendship.findUnique({ where: { id: friendshipId } });
    if (!friendship) throw new NotFoundException('Friendship not found');
    if (friendship.addresseeId !== currentUserId) {
      throw new ForbiddenException('Only the addressee can decline a request');
    }
    if (friendship.status !== 'PENDING') {
      throw new ConflictException('Request is not in PENDING status');
    }
    return this.prisma.friendship.update({
      where: { id: friendshipId },
      data: { status: 'DECLINED' },
    });
  }

  async blockUser(friendshipId: string, currentUserId: string) {
    const friendship = await this.prisma.friendship.findUnique({ where: { id: friendshipId } });
    if (!friendship) throw new NotFoundException('Friendship not found');
    if (friendship.requesterId !== currentUserId && friendship.addresseeId !== currentUserId) {
      throw new ForbiddenException('You are not part of this friendship');
    }
    return this.prisma.friendship.update({
      where: { id: friendshipId },
      data: { status: 'BLOCKED' },
    });
  }

  async unfriend(friendshipId: string, currentUserId: string) {
    const friendship = await this.prisma.friendship.findUnique({ where: { id: friendshipId } });
    if (!friendship) throw new NotFoundException('Friendship not found');
    if (friendship.requesterId !== currentUserId && friendship.addresseeId !== currentUserId) {
      throw new ForbiddenException('You are not part of this friendship');
    }
    if (friendship.status !== 'ACCEPTED') {
      throw new BadRequestException('Can only unfriend an accepted friendship');
    }
    await this.prisma.friendship.delete({ where: { id: friendshipId } });
    return { message: 'Unfriended successfully' };
  }

  async getFriendIds(userId: string): Promise<string[]> {
    const rows = await this.prisma.friendship.findMany({
      where: {
        OR: [
          { requesterId: userId, status: 'ACCEPTED' },
          { addresseeId: userId, status: 'ACCEPTED' },
        ],
      },
      select: { requesterId: true, addresseeId: true },
    });
    return rows.map(r => (r.requesterId === userId ? r.addresseeId : r.requesterId));
  }

  async getFriends(userId: string) {
    const friendships = await this.prisma.friendship.findMany({
      where: {
        OR: [
          { requesterId: userId, status: 'ACCEPTED' },
          { addresseeId: userId, status: 'ACCEPTED' },
        ],
      },
      include: {
        requester: { select: { id: true, username: true, avatar: true, lastSeen: true } },
        addressee: { select: { id: true, username: true, avatar: true, lastSeen: true } },
      },
    });

    const friends = friendships.map(f => ({
      friendshipId: f.id,
      ...(f.requesterId === userId ? f.addressee : f.requester),
    }));

    const onlineStatuses = friends.length > 0
      ? await this.presenceService.getOnlineStatus(friends.map(fr => fr.id))
      : [];

    return {
      friends: friends.map((friend, i) => ({ ...friend, isOnline: onlineStatuses[i] ?? false })),
      total: friends.length,
    };
  }

  async getIncomingRequests(userId: string) {
    const rows = await this.prisma.friendship.findMany({
      where: { addresseeId: userId, status: 'PENDING' },
      include: { requester: { select: { id: true, username: true, avatar: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return {
      requests: rows.map(r => ({
        id: r.id,
        requesterId: r.requesterId,
        requesterUsername: r.requester.username,
        requesterAvatar: r.requester.avatar,
        createdAt: r.createdAt,
      })),
    };
  }

  async getOutgoingRequests(userId: string) {
    const rows = await this.prisma.friendship.findMany({
      where: { requesterId: userId, status: 'PENDING' },
      include: { addressee: { select: { id: true, username: true, avatar: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return {
      requests: rows.map(r => ({
        id: r.id,
        addresseeId: r.addresseeId,
        addresseeUsername: r.addressee.username,
        addresseeAvatar: r.addressee.avatar,
        createdAt: r.createdAt,
      })),
    };
  }
}
```

### File 3: `src/friendships/friendships.controller.ts`

```typescript
import {
  Controller, Post, Delete, Get, Param, Body, UseGuards, Request, HttpCode,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { FriendshipService } from './friendships.service';
import { SendFriendRequestDto } from './dto/send-friend-request.dto';

@Controller('social/friends')
@UseGuards(JwtAuthGuard)
export class FriendshipsController {
  constructor(private readonly friendshipService: FriendshipService) {}

  @Post('request')
  sendRequest(@Request() req, @Body() dto: SendFriendRequestDto) {
    return this.friendshipService.sendRequest(req.user.sub, dto.addresseeId);
  }

  @Post(':id/accept')
  @HttpCode(200)
  acceptRequest(@Request() req, @Param('id') id: string) {
    return this.friendshipService.acceptRequest(id, req.user.sub);
  }

  @Post(':id/decline')
  @HttpCode(200)
  declineRequest(@Request() req, @Param('id') id: string) {
    return this.friendshipService.declineRequest(id, req.user.sub);
  }

  @Post(':id/block')
  @HttpCode(200)
  blockUser(@Request() req, @Param('id') id: string) {
    return this.friendshipService.blockUser(id, req.user.sub);
  }

  @Delete(':id')
  unfriend(@Request() req, @Param('id') id: string) {
    return this.friendshipService.unfriend(id, req.user.sub);
  }

  @Get()
  getFriends(@Request() req) {
    return this.friendshipService.getFriends(req.user.sub);
  }

  @Get('requests/incoming')
  getIncomingRequests(@Request() req) {
    return this.friendshipService.getIncomingRequests(req.user.sub);
  }

  @Get('requests/outgoing')
  getOutgoingRequests(@Request() req) {
    return this.friendshipService.getOutgoingRequests(req.user.sub);
  }
}
```

### File 4: `src/friendships/friendships.module.ts`

```typescript
import { Module, forwardRef } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { PresenceModule } from '../presence/presence.module';
import { FriendshipService } from './friendships.service';
import { FriendshipsController } from './friendships.controller';

@Module({
  imports: [PrismaModule, forwardRef(() => PresenceModule)],
  providers: [FriendshipService],
  controllers: [FriendshipsController],
  exports: [FriendshipService],
})
export class FriendshipsModule {}
```

Note: `PresenceModule` may not exist yet. Create a stub:

### File 5: `src/presence/presence.module.ts` (stub)

```typescript
import { Module } from '@nestjs/common';
import { PresenceService } from './presence.service';

@Module({
  providers: [PresenceService],
  exports: [PresenceService],
})
export class PresenceModule {}
```

### File 6: `src/presence/presence.service.ts` (stub)

```typescript
import { Injectable } from '@nestjs/common';

@Injectable()
export class PresenceService {
  async setOnline(_userId: string): Promise<void> {}
  async setOffline(_userId: string): Promise<void> {}
  async isOnline(_userId: string): Promise<boolean> { return false; }
  async getOnlineStatus(userIds: string[]): Promise<boolean[]> {
    return userIds.map(() => false);
  }
}
```

This stub will be replaced in Increment 3.

### File 7: Register in `src/app.module.ts`

Add `FriendshipsModule` and `PresenceModule` to the `imports` array of `AppModule`.

## Verification

```bash
# Start the server
npm run start:dev

# Send a friend request (replace tokens and IDs)
curl -X POST http://localhost:3000/social/friends/request \
  -H "Authorization: Bearer $TOKEN_A" \
  -H "Content-Type: application/json" \
  -d '{"addresseeId": "USER_B_ID"}'
# Expected: 201 { id, requesterId, addresseeId, status: "PENDING", createdAt }

# Attempt self-request
curl -X POST http://localhost:3000/social/friends/request \
  -H "Authorization: Bearer $TOKEN_A" \
  -H "Content-Type: application/json" \
  -d '{"addresseeId": "USER_A_ID"}'
# Expected: 400 { message: "Cannot send friend request to yourself" }

# Accept the request (as User B)
curl -X POST http://localhost:3000/social/friends/FRIENDSHIP_ID/accept \
  -H "Authorization: Bearer $TOKEN_B"
# Expected: 200 { status: "ACCEPTED" }

# List friends (as User B)
curl http://localhost:3000/social/friends \
  -H "Authorization: Bearer $TOKEN_B"
# Expected: 200 { friends: [{ id, username, isOnline: false }], total: 1 }

# Try without JWT
curl http://localhost:3000/social/friends
# Expected: 401
```
