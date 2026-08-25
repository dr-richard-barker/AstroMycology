// Benjamini-Hochberg FDR correction. Returns q-values in the same order as
// the input p-values. Standard step-up procedure: rank ascending, scale each
// p-value by n/rank, then enforce monotonicity by taking a running minimum
// from the largest rank down.
export function benjaminiHochberg(pvalues: number[]): number[] {
  const n = pvalues.length;
  const idx = pvalues.map((p, i) => i).sort((a, b) => pvalues[a] - pvalues[b]);
  const q = new Array(n).fill(1);
  let runningMin = 1;
  for (let rank = n; rank >= 1; rank--) {
    const i = idx[rank - 1];
    const scaled = (pvalues[i] * n) / rank;
    runningMin = Math.min(runningMin, scaled);
    q[i] = runningMin;
  }
  return q;
}

// Lanczos approximation of log(Gamma(x)) — standard, ~15-digit accuracy,
// avoids the overflow a direct factorial would hit for the population sizes
// (a few hundred to ~1200 genes) involved in GO-term enrichment below.
const LANCZOS_G = 7;
const LANCZOS_COEF = [
  0.99999999999980993, 676.5203681218851, -1259.1392167224028,
  771.32342877765313, -176.61502916214059, 12.507343278686905,
  -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
];
function logGamma(x: number): number {
  if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - logGamma(1 - x);
  x -= 1;
  let a = LANCZOS_COEF[0];
  const t = x + LANCZOS_G + 0.5;
  for (let i = 1; i < LANCZOS_G + 2; i++) a += LANCZOS_COEF[i] / (x + i);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}
function logChoose(n: number, k: number): number {
  if (k < 0 || k > n) return -Infinity;
  if (k === 0 || k === n) return 0;
  return logGamma(n + 1) - logGamma(k + 1) - logGamma(n - k + 1);
}

// One-sided (over-representation) hypergeometric test: P(X >= k) for X ~
// Hypergeometric drawing n genes (the foreground, e.g. significant DEGs)
// from a population of N genes (the annotated universe) that contains K
// genes carrying the term in question. Standard GO-enrichment test.
export function hypergeometricUpperTail(k: number, K: number, n: number, N: number): number {
  const maxI = Math.min(n, K);
  if (k > maxI) return 0;
  if (k <= 0) return 1;
  const logDenom = logChoose(N, n);
  let sum = 0;
  for (let i = k; i <= maxI; i++) sum += Math.exp(logChoose(K, i) + logChoose(N - K, n - i) - logDenom);
  return Math.min(1, sum);
}
