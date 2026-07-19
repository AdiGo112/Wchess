# 06-Chat — Implementation Prompt: Increment 3

Copy and paste to an AI coding assistant. Self-contained.

---

You are implementing Increment 3 of the in-game chat: the React frontend chat panel integrated into the game page.

## Current state

Backend increments 1 and 2 are complete and working:
- Socket.io /chat namespace handles: send_message, typing_start, typing_stop
- Server emits: message_received { id, gameId, userId, username, content, createdAt }, typing_indicator { userId, username, isTyping }, error { code, message }
- GET /chat/:gameId/history returns { messages: ChatMessage[], nextCursor }

Frontend:
- GamePage exists at `frontend/src/pages/GamePage.tsx`
- AuthContext provides { user: { id, username } } and accessToken
- axios instance (api) configured with auth headers
- Tailwind CSS configured

## What to build

useChatSocket hook, ChatPanel component, integration into GamePage.

The full implementation of these files is in IMPLEMENTATION_PROMPT_FRONTEND.md for this feature. Write those files exactly as specified there.

Additionally, update `frontend/src/pages/GamePage.tsx` to include the ChatPanel:

```tsx
// Change the return statement to include a sidebar:
return (
  <div className="flex min-h-screen bg-gray-900 text-white">
    {/* Board area */}
    <div className="flex flex-col items-center justify-center flex-1 p-4 min-w-0">
      <GameClock time={opponentTime} isActive={gameState.turn !== playerColor} label="Opponent" />
      <div className="my-4 w-full max-w-[560px]">
        <ChessBoard fen={gameState.fen} playerColor={playerColor} onMove={makeMove} lastMove={gameState.moves[gameState.moves.length - 1]} />
      </div>
      <GameClock time={myTime} isActive={gameState.turn === playerColor} label="You" />
      <DrawControls onOfferDraw={offerDraw} onAcceptDraw={acceptDraw} onDeclineDraw={declineDraw} onResign={resign} drawOffered={drawOffered} myUserId={user?.id} />
    </div>

    {/* Chat sidebar - hidden on mobile, visible on md+ */}
    <div className="hidden md:flex w-72 flex-shrink-0 p-4">
      <ChatPanel gameId={gameId!} />
    </div>

    {gameOver && <GameOver result={gameOver} gameId={gameId!} />}
  </div>
);
```

Also, make sure the useChatSocket hook properly merges history and live messages to avoid duplicates. On mount: fetch history → setMessages(historyMessages). On message_received: append to messages ONLY if the message ID is not already in the list.

## Verification

1. Open two browser tabs, log in as different users, navigate to the same /game/:gameId
2. Tab A types in the chat input → Tab B shows "Opponent is typing..."
3. Tab A presses Enter → message appears in both tabs instantly
4. Tab A sends 2 messages within 1 second → second shows red error "You are sending messages too fast."
5. Refresh Tab A → chat history loads the previously sent messages

Write all files now.
