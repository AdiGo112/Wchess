import { HttpException } from '@nestjs/common';
import { AnalysisService } from './analysis.service';

// Per-user analysis limits (ship-plan 1.4). The sweep itself is stubbed: these
// tests are about who may start one, not what the engine says.
describe('AnalysisService per-user limits', () => {
  const prisma = {
    gameAnalysis: { findUnique: jest.fn().mockResolvedValue(null) },
    game: { findUnique: jest.fn().mockResolvedValue({ moves: ['e4', 'e5'] }) },
  };
  let service: AnalysisService;
  let finish: () => void;

  beforeEach(() => {
    service = new AnalysisService(prisma as any);
    // Each sweep stays "running" until finish() is called.
    jest.spyOn(service as any, 'sweep').mockImplementation(
      () => new Promise<void>((resolve) => (finish = resolve)),
    );
  });

  const status = (p: Promise<unknown>) =>
    p.then(() => 200, (e: HttpException) => e.getStatus());

  it('allows one running sweep per user', async () => {
    expect(await status(service.request('g1', 'alice'))).toBe(200);
    expect(await status(service.request('g2', 'alice'))).toBe(429);
    expect(await status(service.request('g2', 'bob'))).toBe(200);
  });

  it('re-requesting the game already running is not a second sweep', async () => {
    await service.request('g1', 'alice');
    expect(await service.request('g1', 'alice')).toEqual({ status: 'running', gameId: 'g1' });
  });

  it('caps fresh sweeps per user per hour', async () => {
    for (let i = 0; i < 5; i++) {
      expect(await status(service.request(`g${i}`, 'alice'))).toBe(200);
      finish();
      await new Promise((r) => setImmediate(r)); // let finally() clear the in-flight slot
    }
    expect(await status(service.request('g5', 'alice'))).toBe(429);
  });
});
