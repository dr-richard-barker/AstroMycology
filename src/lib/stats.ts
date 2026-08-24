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
