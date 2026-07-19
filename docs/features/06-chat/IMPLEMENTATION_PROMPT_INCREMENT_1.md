# 06-Chat — Implementation Prompt: Increment 1

Copy and paste this entire prompt to an AI coding assistant. It is self-contained.

---

You are implementing Increment 1 of the in-game chat feature for ChessWeb: MongoDB message persistence and Socket.io delivery.

## Current state of codebase

- MongoDB client available: injectable via `@Inject('MONGO_CLIENT') private mongoClient: MongoClient`
- Redis available: injectable via `@Inject('REDIS_CLIENT') private redis: Redis`
- WsJwtGuard exists and works: sets `client.data.userId` and `client.data.username`
- game-{gameId} Socket.io rooms are created by GameGateway when players join
- Game state stored in Redis key `game:{gameId}` as JSON string with fields: `whiteId`, `blackId`
- JwtAuthGuard exists for HTTP routes

## What to build

ChatService, ChatGateway (/chat Socket.io namespace), ChatController (REST).

Do NOT implement rate limiting or profanity filter yet (that is Increment 2).

## ChatService

`backend/src/chat/chat.service.ts`:

```typescript
import { Injectable, Inject } from '@nestjs/common';
import { MongoClient, Db, ObjectId } from 'mongodb';
import Redis from 'ioredis';

export interface ChatMessageDoc {
  _id?: ObjectId;
  gameId: string;
  userId: string;
  username: string;
  content: string;
  createdAt: Date;
}

@Injectable()
export class ChatService {
  private db: Db;

  constructor(
    @Inject('MONGO_CLIENT') private mongoClient: MongoClient,
    @Inject('REDIS_CLIENT') private redis: Redis,
  ) {
    this.db = this.mongoClient.db(process.env.MONGODB_DB_NAME || 'chessweb');
    // Setup indexes (idempotent)
    this.setupIndexes();
  }

  private async setupIndexes() {
    const col = this.db.collection('messages');
    await col.createIndex({ createdAt: 1 }, { expireAfterSeconds: 2592000 }); // 30 days TTL
    await col.createIndex({ gameId: 1, createdAt: -1 }); // For history queries
  }

  async verifyParticipant(gameId: string, userId: string): Promise<boolean> {
    const raw = await this.redis.get(`game:${gameId}`);
    if (!raw) return false;
    const state = JSON.parse(raw);
    return state.whiteId === userId || state.blackId === userId;
  }

  async sendMessage(gameId: string, userId: string, username: string, content: string): Promise<ChatMessageDoc> {
    const trimmed = content.trim();
    if (!trimmed) throw new Error(JSON.stringify({ code: 'CONTENT_EMPTY', message: 'Message cannot be empty' }));
    if (trimmed.length > 500) throw new Error(JSON.stringify({ code: 'CONTENT_TOO_LONG', message: 'Message must be 500 characters or less' }));

    const doc: ChatMessageDoc = { gameId, userId, username, content: trimmed, createdAt: new Date() };
    const result = await this.db.collection('messages').insertOne(doc);
    return { _id: result.insertedId, ...doc };
  }

  async getHistory(gameId: string, limit = 50, before?: string): Promise<ChatMessageDoc[]> {
    const query: Record<string, any> = { gameId };
    if (before) query.createdAt = { $lt: new Date(before) };
    const messages = await this.db.collection('messages')
      .find(query)
      .sort({ createdAt: -1 })
      .limit(Math.min(limit, 50))
      .toArray();
    return (messages as ChatMessageDoc[]).reverse(); // Chronological order for display
  }
}
```

## ChatGateway

`backend/src/chat/chat.gateway.ts`:

```typescript
import { WebSocketGateway, WebSocketServer, SubscribeMessage, UseGuards, MessageBody, ConnectedSocket } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { WsJwtGuard } from '../game/guards/ws-jwt.guard';
import { ChatService } from './chat.service';

@WebSocketGateway({ namespace: '/chat', cors: { origin: '*' } })
@UseGuards(WsJwtGuard)
export class ChatGateway {
  @WebSocketServer() server: Server;

  constructor(private chatService: ChatService) {}

  @SubscribeMessage('send_message')
  async handleSendMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() dto: { gameId: string; content: string },
  ) {
    const { userId, username } = client.data;

    const isParticipant = await this.chatService.verifyParticipant(dto.gameId, userId);
    if (!isParticipant) {
      client.emit('error', { code: 'NOT_A_PARTICIPANT', message: 'You are not a participant in this game' });
      return;
    }

    try {
      const message = await this.chatService.sendMessage(dto.gameId, userId, username, dto.content);
      const payload = {
        id: message._id!.toString(),
        gameId: message.gameId,
        userId: message.userId,
        username: message.username,
        content: message.content,
        createdAt: message.createdAt.toISOString(),
      };
      this.server.to(`game-${dto.gameId}`).emit('message_received', payload);
    } catch (err) {
      try {
        const parsed = JSON.parse(err.message);
        client.emit('error', parsed);
      } catch {
        client.emit('error', { code: 'UNKNOWN_ERROR', message: 'Could not send message' });
      }
    }
  }
}
```

## ChatController

`backend/src/chat/chat.controller.ts`:

```typescript
import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ChatService } from './chat.service';

@Controller('chat')
@UseGuards(JwtAuthGuard)
export class ChatController {
  constructor(private chatService: ChatService) {}

  @Get(':gameId/history')
  async getHistory(
    @Param('gameId') gameId: string,
    @Query('limit') limit = '50',
    @Query('before') before?: string,
  ) {
    const messages = await this.chatService.getHistory(gameId, parseInt(limit), before);
    const nextCursor = messages.length > 0 ? messages[0].createdAt.toISOString() : null;
    return {
      messages: messages.map(m => ({
        id: m._id!.toString(),
        gameId: m.gameId,
        userId: m.userId,
        username: m.username,
        content: m.content,
        createdAt: m.createdAt.toISOString(),
      })),
      nextCursor,
    };
  }
}
```

## ChatModule + AppModule registration

Create `backend/src/chat/chat.module.ts` and add ChatModule to AppModule imports.

## Verification

1. Start two browser tabs with different users both in the same game room
2. Open browser console in Tab A: `socket.emit('send_message', { gameId: 'YOUR_GAME_ID', content: 'Hello!' })`
3. Both tabs should receive `message_received` with the message
4. `curl -H "Authorization: Bearer $TOKEN" "http://localhost:3000/chat/YOUR_GAME_ID/history"` should return the message
5. Check MongoDB: `db.messages.find({ gameId: 'YOUR_GAME_ID' })` should show the document
