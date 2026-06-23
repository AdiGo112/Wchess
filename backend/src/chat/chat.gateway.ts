import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { ChatService } from './chat.service';

@WebSocketGateway({
  cors: { origin: process.env.CORS_ORIGIN || 'http://localhost:5173', credentials: true },
})
export class ChatGateway {
  @WebSocketServer() server: Server;

  constructor(private chatService: ChatService) {}

  @SubscribeMessage('send_message')
  async handleMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { roomId: string; text: string; roomType?: string },
  ) {
    const userId = client.data.userId;
    const username = client.data.username;
    if (!userId || !data.text?.trim()) return;

    const text = data.text.trim().slice(0, 500);
    const message = await this.chatService.saveMessage({
      roomId: data.roomId,
      roomType: data.roomType || 'game',
      senderId: userId,
      username,
      text,
    });

    this.server.to(data.roomId).emit('message', { roomId: data.roomId, message });
  }

  @SubscribeMessage('get_history')
  async handleGetHistory(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { roomId: string; before?: string },
  ) {
    const messages = await this.chatService.getHistory(data.roomId, data.before);
    client.emit('history', {
      roomId: data.roomId,
      messages: messages.reverse(),
      hasMore: messages.length === 50,
    });
  }
}
