import { getRatingChange, updateGlicko2, variantFromTimeControl } from './elo';
import { parseCorsOrigin } from './cors';

const fresh = { rating: 1500, rd: 350, sigma: 0.06 };
const settled = { rating: 1500, rd: 50, sigma: 0.06 };

describe('Glicko-2', () => {
  it('win goes up, loss goes down, by the same amount between equals', () => {
    const up = getRatingChange(settled, settled, 1);
    const down = getRatingChange(settled, settled, 0);
    expect(up).toBeGreaterThan(0);
    expect(down).toBe(-up);
    expect(getRatingChange(settled, settled, 0.5)).toBe(0);
  });

  it('beating a stronger player is worth more than beating a weaker one', () => {
    const strong = { ...settled, rating: 1800 };
    const weak = { ...settled, rating: 1200 };
    expect(getRatingChange(settled, strong, 1)).toBeGreaterThan(getRatingChange(settled, weak, 1));
    // and a draw against someone stronger still gains
    expect(getRatingChange(settled, strong, 0.5)).toBeGreaterThan(0);
  });

  it('a provisional (high-RD) rating moves much more than a settled one', () => {
    expect(getRatingChange(fresh, settled, 1)).toBeGreaterThan(getRatingChange(settled, settled, 1) * 3);
  });

  it('every game shrinks RD, inside the 30..350 clamp', () => {
    const r = updateGlicko2(fresh, settled, 1);
    expect(r.rd).toBeLessThan(350);
    expect(updateGlicko2({ rating: 1500, rd: 30, sigma: 0.06 }, settled, 1).rd).toBeGreaterThanOrEqual(30);
  });

  it('stays finite for extreme rating gaps (volatility solver converges)', () => {
    const r = updateGlicko2({ rating: 800, rd: 350, sigma: 0.06 }, { rating: 2800, rd: 30 }, 1);
    expect(Number.isFinite(r.rating)).toBe(true);
    expect(Number.isFinite(r.sigma)).toBe(true);
  });
});

describe('variantFromTimeControl', () => {
  it.each([
    [60, 'BULLET'], [179, 'BULLET'], [180, 'BLITZ'], [599, 'BLITZ'],
    [600, 'RAPID'], [1799, 'RAPID'], [1800, 'CLASSICAL'],
  ])('%is → %s', (tc, variant) => expect(variantFromTimeControl(tc)).toBe(variant));
});

describe('parseCorsOrigin', () => {
  it('defaults to the dev frontend, reflects *, splits lists', () => {
    expect(parseCorsOrigin('')).toBe('http://localhost:5173');
    expect(parseCorsOrigin('*')).toBe(true);
    expect(parseCorsOrigin('https://a.com, https://b.com')).toEqual(['https://a.com', 'https://b.com']);
    expect(parseCorsOrigin('https://a.com')).toBe('https://a.com');
  });
});
