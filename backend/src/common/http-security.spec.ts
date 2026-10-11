import { clientIp } from './http-security';

describe('clientIp (throttler tracker)', () => {
  const req = (headers: Record<string, string> = {}) => ({ ip: '10.0.0.1', headers });
  afterEach(() => delete process.env.CLIENT_IP_HEADER);

  it('uses req.ip when no header is configured, even if one is sent', () => {
    expect(clientIp(req({ 'cf-connecting-ip': '1.2.3.4' }))).toBe('10.0.0.1');
  });

  it('uses the configured header, case-insensitively', () => {
    process.env.CLIENT_IP_HEADER = 'CF-Connecting-IP';
    expect(clientIp(req({ 'cf-connecting-ip': '1.2.3.4' }))).toBe('1.2.3.4');
  });

  it('falls back to req.ip when the configured header is missing', () => {
    process.env.CLIENT_IP_HEADER = 'cf-connecting-ip';
    expect(clientIp(req())).toBe('10.0.0.1');
  });
});
