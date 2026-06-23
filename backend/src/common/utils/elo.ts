const SCALE = 173.7178;
const TAU = 0.5;
const EPSILON = 0.000001;

interface GlickoPlayer {
  rating: number;
  rd: number;        // rating deviation
  sigma: number;     // volatility
}

interface GlickoResult {
  rating: number;
  rd: number;
  sigma: number;
}

function toGlicko2(r: number, rd: number) {
  return { mu: (r - 1500) / SCALE, phi: rd / SCALE };
}

function fromGlicko2(mu: number, phi: number) {
  return { rating: Math.round(mu * SCALE + 1500), rd: Math.round(phi * SCALE) };
}

function g(phi: number): number {
  return 1 / Math.sqrt(1 + (3 * phi * phi) / (Math.PI * Math.PI));
}

function E(mu: number, muJ: number, phiJ: number): number {
  return 1 / (1 + Math.exp(-g(phiJ) * (mu - muJ)));
}

export function updateGlicko2(
  player: GlickoPlayer,
  opponent: { rating: number; rd: number; sigma?: number },
  score: 0 | 0.5 | 1,
): GlickoResult {
  const { mu, phi } = toGlicko2(player.rating, player.rd);
  const { mu: muJ, phi: phiJ } = toGlicko2(opponent.rating, opponent.rd);
  const sigma = player.sigma;

  const gJ = g(phiJ);
  const eJ = E(mu, muJ, phiJ);

  const v = 1 / (gJ * gJ * eJ * (1 - eJ));
  const delta = v * gJ * (score - eJ);

  // Update volatility via Illinois algorithm
  const a = Math.log(sigma * sigma);
  let A = a;
  let B: number;
  const f = (x: number) => {
    const ex = Math.exp(x);
    const phiSq = phi * phi;
    const num1 = ex * (delta * delta - phiSq - v - ex);
    const den1 = 2 * (phiSq + v + ex) * (phiSq + v + ex);
    return num1 / den1 - (x - a) / (TAU * TAU);
  };

  if (delta * delta > phi * phi + v) {
    B = Math.log(delta * delta - phi * phi - v);
  } else {
    let k = 1;
    while (f(a - k * TAU) < 0) k++;
    B = a - k * TAU;
  }

  let fA = f(A);
  let fB = f(B);

  for (let i = 0; i < 100 && Math.abs(B - A) > EPSILON; i++) {
    const C = A + ((A - B) * fA) / (fB - fA);
    const fC = f(C);
    if (fC * fB <= 0) { A = B; fA = fB; }
    else { fA /= 2; }
    B = C;
    fB = fC;
  }

  const newSigma = Math.exp(A / 2);
  const phiStar = Math.sqrt(phi * phi + newSigma * newSigma);
  const newPhi = 1 / Math.sqrt(1 / (phiStar * phiStar) + 1 / v);
  const newMu = mu + newPhi * newPhi * gJ * (score - eJ);

  const result = fromGlicko2(newMu, newPhi);

  return {
    rating: result.rating,
    rd: Math.max(30, Math.min(350, result.rd)),
    sigma: newSigma,
  };
}

export function getRatingChange(
  player: GlickoPlayer,
  opponent: GlickoPlayer,
  score: 0 | 0.5 | 1,
): number {
  const updated = updateGlicko2(player, opponent, score);
  return updated.rating - player.rating;
}

export function variantFromTimeControl(timeControl: number): string {
  if (timeControl < 180) return 'BULLET';
  if (timeControl < 600) return 'BLITZ';
  if (timeControl < 1800) return 'RAPID';
  return 'CLASSICAL';
}
