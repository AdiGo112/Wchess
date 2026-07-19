# 02-Game-Engine — Implementation Prompt: Increment 2

Copy and paste to an AI coding assistant. Self-contained.

---

You are implementing Increment 2 of the chess game engine: draw flow and disconnect handling.

## Current state
Increment 1 is complete. GameGateway handles join_room, move, resign. GameService handles applyMove, handleTimeout, handleResign, persistGame. ClockService handles startClock, stopClock.

## What you are building
1. Draw offer flow: offer_draw → draw_offered event → accept_draw or decline_draw
2. Disconnect grace period: 30-second auto-resign timer on disconnect

## Changes to GameService (`backend/src/game/game.service.ts`)

Add methods:
```typescript
async offerDraw(gameId: string, userId: string): Promise<void> {
  const state = await this.getGameState(gameId);
  const color = state.whiteId === userId ? 'white' : 'black';
  state.pendingDraw = color;
  await this.saveGameState(gameId, state);
}

async acceptDraw(gameId: string, userId: string): Promise<GameOverResult> {
  const state = await this.getGameState(gameId);
  if (!state.pendingDraw) throw new WsException({ code: 'NO_DRAW_OFFER' });
  const color = state.whiteId === userId ? 'white' : 'black';
  if (state.pendingDraw === color) throw new WsException({ code: 'CANNOT_ACCEPT_OWN_OFFER' });
  return await this.persistGame(state, 'draw', 'agreement');
}

async declineDraw(gameId: string): Promise<void> {
  const state = await this.getGameState(gameId);
  state.pendingDraw = null;
  await this.saveGameState(gameId, state);
}
```

Also: in applyMove, after updating state, add: `state.pendingDraw = null;` (draw offer cancelled on opponent's move).

## Changes to GameGateway (`backend/src/game/game.gateway.ts`)

Add handlers and disconnect logic:
```typescript
private disconnectTimers = new Map<string, NodeJS.Timeout>();

handleDisconnect(client: Socket) {
  const userId = client.data.userId;
  // Find which game this user is in
  // (store gameId in client.data.gameId when they join)
  const gameId = client.data.gameId;
  if (!gameId) return;

  // Notify opponent
  this.server.to(`game-${gameId}`).emit('opponent_disconnected', { userId, reconnectSeconds: 30 });

  // Start auto-resign timer
  const timer = setTimeout(async () => {
    try {
      const result = await this.gameService.handleResign(gameId, userId);
      this.clockService.stopClock(gameId);
      this.server.to(`game-${gameId}`).emit('game_over', { ...result, reason: 'abandonment' });
    } catch (e) { /* game may already be over */ }
    this.disconnectTimers.delete(userId);
  }, 30000);
  this.disconnectTimers.set(userId, timer);
}

handleConnection(client: Socket) {
  // Cancel auto-resign timer on reconnect
  const userId = client.data.userId;
  const existingTimer = this.disconnectTimers.get(userId);
  if (existingTimer) {
    clearTimeout(existingTimer);
    this.disconnectTimers.delete(userId);
    this.server.to(`game-${client.data.gameId}`).emit('opponent_reconnected', { userId });
  }
}

@SubscribeMessage('offer_draw')
async handleOfferDraw(client: Socket, dto: { gameId: string }) {
  await this.gameService.offerDraw(dto.gameId, client.data.userId);
  client.to(`game-${dto.gameId}`).emit('draw_offered', { byUserId: client.data.userId });
}

@SubscribeMessage('accept_draw')
async handleAcceptDraw(client: Socket, dto: { gameId: string }) {
  const result = await this.gameService.acceptDraw(dto.gameId, client.data.userId);
  this.clockService.stopClock(dto.gameId);
  this.server.to(`game-${dto.gameId}`).emit('game_over', result);
}

@SubscribeMessage('decline_draw')
async handleDeclineDraw(client: Socket, dto: { gameId: string }) {
  await this.gameService.declineDraw(dto.gameId);
  client.to(`game-${dto.gameId}`).emit('draw_declined', {});
}
```

## Verification
1. White offers draw → black receives draw_offered
2. Black accepts → both receive game_over { result: 'draw', reason: 'agreement' }
3. White offers draw → black makes a move → draw offer is cleared (draw_offered not re-emitted)
4. White disconnects → black receives opponent_disconnected with countdown
5. White reconnects within 30s → black receives opponent_reconnected, game resumes
6. White stays disconnected 30s → game_over { reason: 'abandonment' } to black
