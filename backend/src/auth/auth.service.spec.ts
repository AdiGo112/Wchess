import { ConflictException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { AuthService } from './auth.service';

const sha256 = (s: string) => crypto.createHash('sha256').update(s).digest('hex');

function setup() {
  const tokens = new Map<string, { id: string; token: string; userId: string; expiresAt: Date }>();
  const users = new Map<string, any>();
  const refreshToken = {
    create: jest.fn(async ({ data }) => { const row = { id: data.token, ...data }; tokens.set(data.token, row); return row; }),
    findUnique: jest.fn(async ({ where }) => tokens.get(where.token) ?? null),
    delete: jest.fn(async ({ where }) => {
      if (!tokens.delete(where.id)) throw Object.assign(new Error('gone'), { code: 'P2025' });
    }),
    deleteMany: jest.fn(async ({ where }) => {
      for (const [k, t] of tokens) {
        if (t.userId === where.userId && (!where.expiresAt || t.expiresAt < where.expiresAt.lt)) tokens.delete(k);
      }
      return { count: 0 };
    }),
  };
  const user = {
    findUnique: jest.fn(async ({ where }) => {
      const [field, value] = Object.entries(where)[0];
      return [...users.values()].find((u) => u[field] === value) ?? null;
    }),
    create: jest.fn(async ({ data }) => ({ id: 'new', ...data })),
    update: jest.fn(async () => ({})),
  };
  const prisma: any = { refreshToken, user, $transaction: (fn: any) => fn(prisma) };
  const jwt = { sign: jest.fn(() => 'access') };
  return { auth: new AuthService(prisma, jwt as any), tokens, users, prisma };
}

describe('AuthService — register', () => {
  it('lowercases email, hashes the password and seeds all four ratings', async () => {
    const { auth, prisma } = setup();
    const { user } = await auth.register({ username: 'adi', email: 'Adi@X.com', password: 'secret123', name: 'Adi' } as any);
    const data = prisma.user.create.mock.calls[0][0].data;
    expect(data.email).toBe('adi@x.com');
    expect(await bcrypt.compare('secret123', data.passwordHash)).toBe(true);
    expect(data.ratings.create.map((r: any) => r.variant)).toEqual(['BULLET', 'BLITZ', 'RAPID', 'CLASSICAL']);
    expect(user).not.toHaveProperty('passwordHash');
  });

  it('rejects a taken email (case-insensitively) or username', async () => {
    const { auth, users } = setup();
    users.set('u1', { id: 'u1', username: 'taken', email: 'a@x.com' });
    await expect(auth.register({ username: 'new', email: 'A@X.com', password: 'p' } as any))
      .rejects.toMatchObject({ response: { code: 'EMAIL_ALREADY_EXISTS' } });
    await expect(auth.register({ username: 'taken', email: 'b@x.com', password: 'p' } as any))
      .rejects.toMatchObject({ response: { code: 'USERNAME_ALREADY_EXISTS' } });
  });

  it('maps a unique-constraint race to the right conflict', async () => {
    const { auth, prisma } = setup();
    prisma.user.create.mockRejectedValueOnce({ code: 'P2002', meta: { target: ['email'] } });
    await expect(auth.register({ username: 'x', email: 'x@x.com', password: 'p' } as any))
      .rejects.toBeInstanceOf(ConflictException);
  });
});

describe('AuthService — validateUser', () => {
  it('accepts the right password and refuses wrong passwords and banned users', async () => {
    const { auth, users } = setup();
    const passwordHash = await bcrypt.hash('pw', 4);
    users.set('u', { id: 'u', username: 'adi', passwordHash, isBanned: false });
    expect(await auth.validateUser('adi', 'pw')).toMatchObject({ id: 'u' });
    expect(await auth.validateUser('adi', 'nope')).toBeNull();
    expect(await auth.validateUser('ghost', 'pw')).toBeNull();
    users.get('u').isBanned = true;
    expect(await auth.validateUser('adi', 'pw')).toBeNull();
  });
});

describe('AuthService — refresh tokens', () => {
  const login = async (s: ReturnType<typeof setup>) => {
    s.users.set('u', { id: 'u', username: 'adi', role: 'USER', isBanned: false });
    return (await s.auth.login(s.users.get('u'))).refreshToken;
  };

  it('stores only the SHA-256 of the refresh token', async () => {
    const s = setup();
    const raw = await login(s);
    expect([...s.tokens.keys()]).toEqual([sha256(raw)]);
  });

  it('rotates: the old token dies, the new one works', async () => {
    const s = setup();
    const raw = await login(s);
    const next = await s.auth.refresh({ refreshToken: raw });
    expect(next.refreshToken).not.toBe(raw);
    await expect(s.auth.refresh({ refreshToken: raw })).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(s.auth.refresh({ refreshToken: next.refreshToken })).resolves.toHaveProperty('accessToken');
  });

  it('refuses unknown, expired, and banned-user tokens', async () => {
    const s = setup();
    await expect(s.auth.refresh({ refreshToken: 'nope' })).rejects.toBeInstanceOf(UnauthorizedException);

    const raw = await login(s);
    s.tokens.get(sha256(raw))!.expiresAt = new Date(Date.now() - 1);
    await expect(s.auth.refresh({ refreshToken: raw })).rejects.toBeInstanceOf(UnauthorizedException);

    const raw2 = await login(s);
    s.users.get('u').isBanned = true;
    await expect(s.auth.refresh({ refreshToken: raw2 })).rejects.toBeInstanceOf(UnauthorizedException);
    expect(s.tokens.has(sha256(raw2))).toBe(true); // banned users can't rotate it away either
  });

  it('a concurrent refresh that loses the delete race is refused', async () => {
    const s = setup();
    const raw = await login(s);
    s.prisma.refreshToken.delete.mockRejectedValueOnce({ code: 'P2025' });
    await expect(s.auth.refresh({ refreshToken: raw })).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('logout kills every session for that user and is idempotent', async () => {
    const s = setup();
    const a = await login(s);
    await login(s);
    await s.auth.logoutByRefreshToken(a);
    expect(s.tokens.size).toBe(0);
    await expect(s.auth.logoutByRefreshToken(a)).resolves.toBeUndefined();
  });
});
