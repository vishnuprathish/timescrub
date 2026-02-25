/**
 * FFT-based seasonality / dominant period detection.
 *
 * Algorithm:
 *  1. Extract numeric values for the chosen column, skipping nulls.
 *  2. Linearly detrend the series.
 *  3. Pad to next power-of-2, apply Cooley-Tukey FFT.
 *  4. Find the dominant frequency peak (excluding DC and the last symmetric half).
 *  5. Convert peak index → period in milliseconds.
 *  6. Map period to a human-readable label.
 *
 * Confidence = peak_power / mean_power_of_spectrum (excluding DC).
 * Values > 3 are considered "strong"; 2–3 "moderate"; < 2 "weak".
 */

// -----------------------------------------------------------------------
// Cooley-Tukey in-place radix-2 FFT (iterative, no recursion)
// re and im are Float64Array of length n (must be a power of 2)
// -----------------------------------------------------------------------
function fft(re, im) {
  const n = re.length;

  // Bit-reversal permutation
  let j = 0;
  for (let i = 1; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }

  // Butterfly passes
  for (let len = 2; len <= n; len <<= 1) {
    const half = len >> 1;
    const ang = (-2 * Math.PI) / len;
    const wRe = Math.cos(ang);
    const wIm = Math.sin(ang);

    for (let i = 0; i < n; i += len) {
      let curRe = 1, curIm = 0;
      for (let k = 0; k < half; k++) {
        const uRe = re[i + k];
        const uIm = im[i + k];
        const vRe = re[i + k + half] * curRe - im[i + k + half] * curIm;
        const vIm = re[i + k + half] * curIm + im[i + k + half] * curRe;

        re[i + k] = uRe + vRe;
        im[i + k] = uIm + vIm;
        re[i + k + half] = uRe - vRe;
        im[i + k + half] = uIm - vIm;

        const nextRe = curRe * wRe - curIm * wIm;
        const nextIm = curRe * wIm + curIm * wRe;
        curRe = nextRe;
        curIm = nextIm;
      }
    }
  }
}

// -----------------------------------------------------------------------
// Next power of 2 >= n
// -----------------------------------------------------------------------
function nextPow2(n) {
  let p = 1;
  while (p < n) p <<= 1;
  return p;
}

// -----------------------------------------------------------------------
// Linear detrend: subtract least-squares linear fit
// -----------------------------------------------------------------------
function detrend(values) {
  const n = values.length;
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
  for (let i = 0; i < n; i++) {
    sumX += i;
    sumY += values[i];
    sumXY += i * values[i];
    sumX2 += i * i;
  }
  const denom = n * sumX2 - sumX * sumX;
  const slope = denom !== 0 ? (n * sumXY - sumX * sumY) / denom : 0;
  const intercept = (sumY - slope * sumX) / n;
  return values.map((v, i) => v - (slope * i + intercept));
}

// -----------------------------------------------------------------------
// Map period (in ms) to human-readable label
// -----------------------------------------------------------------------
function periodLabel(ms) {
  const s = ms / 1000;
  const m = s / 60;
  const h = m / 60;
  const d = h / 24;
  const w = d / 7;
  const mo = d / 30.44;
  const yr = d / 365.25;

  if (Math.abs(yr - Math.round(yr)) / Math.max(yr, 1) < 0.15 && yr >= 0.8) {
    return Math.round(yr) === 1 ? 'annual' : `${Math.round(yr)} yr`;
  }
  if (Math.abs(mo - Math.round(mo)) / Math.max(mo, 1) < 0.15 && mo >= 0.8) {
    return Math.round(mo) === 1 ? 'monthly' : `${Math.round(mo)} mo`;
  }
  if (Math.abs(w - Math.round(w)) / Math.max(w, 1) < 0.15 && w >= 0.8) {
    return Math.round(w) === 1 ? 'weekly' : `${Math.round(w)} wk`;
  }
  if (d >= 0.9 && d < 2) return 'daily';
  if (h >= 0.9 && h < 2) return '1 h';
  if (h >= 10 && h < 14) return '12 h';
  if (m >= 0.9 && m < 2) return '1 min';
  if (m >= 4 && m < 6) return '5 min';
  if (m >= 14 && m < 16) return '15 min';
  if (m >= 29 && m < 31) return '30 min';

  // Generic fallback
  if (d >= 1) return `${d.toFixed(1)} d`;
  if (h >= 1) return `${h.toFixed(1)} h`;
  if (m >= 1) return `${m.toFixed(1)} min`;
  return `${s.toFixed(0)} s`;
}

// -----------------------------------------------------------------------
// Public API
// rows          : plain JS row objects
// tsCol         : name of timestamp column
// valueCol      : name of numeric column to analyse (first numeric col)
// medianMs      : median interval between samples in ms (from frequencyDetector)
// -----------------------------------------------------------------------
export function detectSeasonality(rows, tsCol, valueCol, medianMs) {
  if (!tsCol || !valueCol || !medianMs) return null;

  // Extract values in row order (already sorted by ParseConfigPanel flow)
  const rawVals = rows.map((r) => {
    const v = r[valueCol];
    const n = typeof v === 'number' ? v : parseFloat(v);
    return isFinite(n) ? n : null;
  });

  // Linear-interpolate short gaps for continuity; skip if too sparse
  const nullCount = rawVals.filter((v) => v === null).length;
  if (nullCount / rawVals.length > 0.5) return null; // >50% missing → unreliable

  const filled = [...rawVals];
  for (let i = 0; i < filled.length; i++) {
    if (filled[i] === null) {
      let l = i - 1, r = i + 1;
      while (l >= 0 && filled[l] === null) l--;
      while (r < filled.length && filled[r] === null) r++;
      if (l >= 0 && r < filled.length) {
        filled[i] = filled[l] + ((filled[r] - filled[l]) * (i - l)) / (r - l);
      } else {
        filled[i] = l >= 0 ? filled[l] : (r < filled.length ? filled[r] : 0);
      }
    }
  }

  const N = filled.length;
  if (N < 16) return null;

  // Detrend
  const detrended = detrend(filled);

  // Pad to next power of 2
  const fftN = nextPow2(N);
  const re = new Float64Array(fftN);
  const im = new Float64Array(fftN);
  for (let i = 0; i < N; i++) re[i] = detrended[i];

  fft(re, im);

  // Power spectrum (only first half — positive frequencies)
  const halfN = fftN >> 1;
  const power = new Float64Array(halfN);
  for (let k = 0; k < halfN; k++) {
    power[k] = re[k] * re[k] + im[k] * im[k];
  }

  // Find dominant peak, excluding:
  //   k=0 (DC component)
  //   k=1 (period = full signal length — usually just trend residual)
  //   k >= halfN/2 (periods < 2 samples — Nyquist region)
  const minK = 2;
  const maxK = Math.floor(halfN / 2);

  let peakK = minK;
  let peakPower = power[minK];
  for (let k = minK + 1; k <= maxK; k++) {
    if (power[k] > peakPower) {
      peakPower = power[k];
      peakK = k;
    }
  }

  // Mean power (excluding DC)
  let meanPow = 0;
  for (let k = 1; k < halfN; k++) meanPow += power[k];
  meanPow /= (halfN - 1);

  const confidence = meanPow > 0 ? peakPower / meanPow : 0;

  // Period in ms: T = (fftN * medianMs) / peakK
  const dominantPeriodMs = (fftN * medianMs) / peakK;

  // Filter out periods that are implausibly long (> 10× full signal duration)
  const signalDurationMs = N * medianMs;
  if (dominantPeriodMs > signalDurationMs * 10) return null;

  // Must be at least 2× the sampling interval
  if (dominantPeriodMs < medianMs * 2) return null;

  const label = periodLabel(dominantPeriodMs);

  return {
    dominantPeriodMs,
    label,
    confidence: +confidence.toFixed(2),
  };
}
