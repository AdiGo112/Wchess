import { createRateLimiter, payloadProblem } from './socket-guard';

describe('createRateLimiter', () => {
  it('allows `limit` events per window, then refuses until the window rolls', () => {
    let t = 0;
    const allow = createRateLimiter(3, 1000, () => t);
    expect([allow(), allow(), allow(), allow()]).toEqual([true, true, true, false]);
    t = 999;
    expect(allow()).toBe(false);
    t = 1000;
    expect(allow()).toBe(true);
  });
});

describe('payloadProblem', () => {
  it('passes well-formed payloads', () => {
    expect(payloadProblem('join_room', { roomId: 'AB12CD' })).toBeNull();
    expect(payloadProblem('move', { roomId: 'AB12CD', from: 'e7', to: 'e8', promotion: 'n' })).toBeNull();
    expect(payloadProblem('move', { roomId: 'AB12CD', from: 'e2', to: 'e4' })).toBeNull();
    expect(payloadProblem('join_queue', { timeControl: 180 })).toBeNull(); // DTO-validated in its gateway
  });

  it.each([
    ['resign', undefined, 'payload is not an object'],
    ['resign', 'AB12CD', 'payload is not an object'],
    ['resign', ['AB12CD'], 'payload is not an object'],
    ['resign', { roomId: { $gt: '' } }, 'bad roomId'],
    ['resign', { roomId: 'ab12cd' }, 'bad roomId'],
    ['resign', { roomId: 'A'.repeat(5000) }, 'bad roomId'],
    ['move', { roomId: 'AB12CD', from: 'e9', to: 'e4' }, 'bad from square'],
    ['move', { roomId: 'AB12CD', from: 'e2', to: 42 }, 'bad to square'],
    ['computer_move', { roomId: 'AB12CD', from: 'e7', to: 'e8', promotion: 'k' }, 'bad promotion'],
  ])('%s %j → %s', (event, data, problem) => expect(payloadProblem(event, data)).toBe(problem));
});
