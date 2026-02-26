/**
 * Built-in sample datasets — each targets specific TimeScrub features:
 *
 *  1. Quick Start     — 180 daily rows · ALL issue types · weekly seasonality
 *  2. Weather Station — 720 hourly · strong daily cycle · correlated columns
 *  3. Stock Prices    — 252 business days · non-stationary · skewed volume
 *  4. Factory Sensors — ~1750 rows · 5-min · strong correlations · 2 gaps
 *  5. Solar & Demand  — 2976 rows · 15-min · bimodal solar · demand spikes
 */

const isoTs = (d) => d.toISOString();

// -----------------------------------------------------------------------
// 1. Quick Start — compact daily dataset with every issue type present
//    Features demonstrated: null heatmap, outlier detection, duplicate
//    deduplication, seasonality (weekly), correlation heatmap (temp ↔ hum)
// -----------------------------------------------------------------------
function buildQuickStart() {
  const rows = ['timestamp,temperature_c,humidity_pct,co2_ppm'];
  let t = new Date('2024-01-01T00:00:00Z');

  // Deterministic issues (by row index)
  const TEMP_NULLS   = new Set([20, 40, 60, 61, 80, 120, 150]);   // scattered + 2-day stretch
  const HUM_NULLS    = new Set([30, 90, 110]);
  const TEMP_SPIKES  = { 45: +22, 128: -18 };                      // sensor glitch spikes
  const DUPLICATE_AT = 75;                                          // duplicate timestamp row

  for (let i = 0; i < 180; i++) {
    const annual  = 8 * Math.sin(Math.PI * i / 180);   // peaks at day 90 (April)
    const weekly  = 4 * Math.sin(2 * Math.PI * i / 7); // ±4°C weekly rhythm
    const noise   = (Math.random() - 0.5) * 3;
    const tempBase = 12 + annual + weekly + noise;

    // Apply spike AFTER computing humidity base (so hum isn't based on spike value)
    const spikeOffset = TEMP_SPIKES[i] ?? 0;
    const tempFinal = tempBase + spikeOffset;
    const tempStr = TEMP_NULLS.has(i) ? '' : tempFinal.toFixed(1);

    // humidity: strong negative correlation with base temp (r ≈ –0.85)
    const humBase = 75 - 0.8 * tempBase + (Math.random() - 0.5) * 6;
    const humStr  = HUM_NULLS.has(i) ? '' : Math.max(15, Math.min(98, humBase)).toFixed(1);

    // CO2: weak negative correlation with temp (seasonal plant uptake)
    const co2 = Math.max(360, 418 - 1.5 * tempBase + (Math.random() - 0.5) * 20).toFixed(0);

    rows.push(`${isoTs(t)},${tempStr},${humStr},${co2}`);
    // Insert identical duplicate row
    if (i === DUPLICATE_AT) rows.push(`${isoTs(t)},${tempStr},${humStr},${co2}`);

    t = new Date(t.getTime() + 86400000);
  }
  return rows.join('\n');
}

// -----------------------------------------------------------------------
// 2. Weather Station — hourly data with strong daily cycle and correlated
//    columns (temp_c ↔ dew_point_c r ≈ 0.97, wind independent)
//    Features: correlation heatmap, daily seasonality, gap imputation
// -----------------------------------------------------------------------
function buildWeatherStation() {
  const rows = ['timestamp,temp_c,dew_point_c,wind_kmh'];
  let t = new Date('2024-03-01T00:00:00Z');

  const GAP1 = [120, 131]; // 12 h — sensor calibration gap
  const GAP2 = [500, 519]; // 20 h — maintenance window gap
  const WIND_GUSTS  = new Set([156, 312, 489, 634]); // gust outliers
  const DEW_NULLS   = new Set([45, 200, 380, 510, 695]);
  const TEMP_NULLS  = new Set([88, 264, 440, 620]);

  for (let i = 0; i < 720; i++) {
    // Remove rows that fall in gap ranges (creates timestamp gaps)
    if ((i >= GAP1[0] && i <= GAP1[1]) || (i >= GAP2[0] && i <= GAP2[1])) {
      t = new Date(t.getTime() + 3600000);
      continue;
    }

    const hour = t.getUTCHours();
    // Daily cycle: trough at 04:00 (min), peak at 14:00 (max)
    const temp = 14 + 9 * Math.sin(2 * Math.PI * (hour - 4) / 24 - Math.PI / 2)
               + (Math.random() - 0.5) * 2;
    const tempStr = TEMP_NULLS.has(i) ? '' : temp.toFixed(1);

    // Dew point: strongly correlated with temp (r ≈ 0.97)
    const dew = 0.82 * temp - 3.5 + (Math.random() - 0.5) * 1.6;
    const dewStr = DEW_NULLS.has(i) ? '' : dew.toFixed(1);

    // Wind: independent random; outlier gusts spike to 75–100 km/h
    let wind = Math.max(0, 10 + (Math.random() - 0.5) * 16);
    if (WIND_GUSTS.has(i)) wind = 75 + Math.random() * 25;

    rows.push(`${isoTs(t)},${tempStr},${dewStr},${wind.toFixed(1)}`);
    t = new Date(t.getTime() + 3600000);
  }
  return rows.join('\n');
}

// -----------------------------------------------------------------------
// 3. Stock Prices — random-walk price (non-stationary, ADF won't reject
//    unit root), log-normal volume (right-skewed distribution), 5 missing
//    trading days (halts) creating date gaps.
//    Features: ADF table, distribution plots, gap detection
// -----------------------------------------------------------------------
function buildStockPrices() {
  const rows = ['date,open,high,low,close,volume'];
  let t = new Date('2023-01-02T00:00:00Z');
  let price = 150;

  // 5 trading days removed entirely → gaps in date sequence
  const HALT_DAYS  = new Set([30, 75, 120, 180, 230]);
  // Volume spikes at earnings releases (≈5× normal)
  const VOL_SPIKES = new Set([50, 185]);

  let dayNum   = 0; // counts ALL trading days (incl. halts)
  let dataRows = 0; // counts rows written

  while (dataRows < 252) {
    while (t.getUTCDay() === 0 || t.getUTCDay() === 6) {
      t = new Date(t.getTime() + 86400000); // skip weekends
    }

    if (!HALT_DAYS.has(dayNum)) {
      price = Math.max(10, price + (Math.random() - 0.495) * 3);
      const open  = price.toFixed(2);
      const close = (price + (Math.random() - 0.5) * 2).toFixed(2);
      const high  = (Math.max(parseFloat(open), parseFloat(close)) + Math.random() * 2).toFixed(2);
      const low   = Math.max(0.01, (Math.min(parseFloat(open), parseFloat(close)) - Math.random() * 2)).toFixed(2);
      // Log-normal volume: exp(N(12.7, 0.4)) — mean ~360k, right tail
      let vol = Math.round(Math.exp(12.7 + (Math.random() - 0.5) * 0.8));
      if (VOL_SPIKES.has(dataRows)) vol = Math.round(vol * 5);
      rows.push(`${t.toISOString().slice(0, 10)},${open},${high},${low},${close},${vol}`);
      dataRows++;
    }

    t = new Date(t.getTime() + 86400000);
    dayNum++;
    if (dayNum > 600) break; // safety valve
  }
  return rows.join('\n');
}

// -----------------------------------------------------------------------
// 4. Factory Sensors — 5-min industrial data with strong correlations
//    (pressure ↔ flow r ≈ 0.95), non-stationary pressure (upward drift),
//    stationary motor temp (daily cycle), 2 equipment-offline gaps.
//    Features: correlation heatmap, ADF (mixed results), gap imputation
// -----------------------------------------------------------------------
function buildFactorySensors() {
  const rows = ['timestamp,pressure_kpa,flow_lpm,motor_temp_c'];
  let t = new Date('2024-03-01T00:00:00Z');

  const GAP1 = [500, 600];   // ~100 rows ≈ 8 h pump offline
  const GAP2 = [1200, 1250]; // ~50 rows ≈ 4 h offline

  // Scattered null positions in pressure (every ~40 rows)
  const PRESSURE_NULLS = new Set([37, 74, 111, 148, 185, 222, 259, 296, 333, 370,
    407, 444, 481, 700, 737, 774, 811, 848, 885, 922, 959, 996, 1033, 1070, 1107]);
  // Pressure spikes (valve slams) — 2.2× normal pressure
  const PRESSURE_SPIKES = new Set([150, 750, 1500]);

  for (let i = 0; i < 2016; i++) {
    if ((i >= GAP1[0] && i <= GAP1[1]) || (i >= GAP2[0] && i <= GAP2[1])) {
      t = new Date(t.getTime() + 300000);
      continue;
    }

    // pressure: upward drift + daily cycle → non-stationary (ADF fails to reject H₀)
    const dailyCycle = 4 * Math.sin(2 * Math.PI * i / 288);
    const pressure = 98 + 0.002 * i + dailyCycle + (Math.random() - 0.5) * 1.6;
    const pressureStr = PRESSURE_NULLS.has(i)
      ? ''
      : (PRESSURE_SPIKES.has(i) ? (pressure * 2.2).toFixed(2) : pressure.toFixed(2));

    // flow: strongly correlated with pressure (r ≈ 0.95) — also non-stationary
    const flow = 1.9 * pressure - 170 + (Math.random() - 0.5) * 3;

    // motor temp: daily cycle shifted π/2 from pressure → ~0 correlation with pressure/flow
    // (sin and cos are orthogonal → Pearson r ≈ 0)
    const motorTemp = 55 - 8 * Math.cos(2 * Math.PI * i / 288) + (Math.random() - 0.5) * 4;

    rows.push(`${isoTs(t)},${pressureStr},${flow.toFixed(2)},${motorTemp.toFixed(1)}`);
    t = new Date(t.getTime() + 300000);
  }
  return rows.join('\n');
}

// -----------------------------------------------------------------------
// 5. Solar & Demand — 15-min energy data with bimodal solar distribution
//    (0 at night, bell curve by day), weekday/weekend demand pattern,
//    cloud event on days 10-11, demand spikes, scattered solar nulls.
//    Features: distribution plots, resampling, correlation (solar ↔ grid)
// -----------------------------------------------------------------------
function buildSolarDemand() {
  const rows = ['timestamp,solar_kwh,demand_kwh,grid_kwh'];
  let t = new Date('2024-01-01T00:00:00Z');

  const CLOUD_DAYS    = new Set([10, 11]); // near-zero solar (overcast event)
  // Solar nulls: sensor malfunction every 144 intervals (1.5 days)
  const SOLAR_NULLS   = new Set([144, 288, 432, 576, 720, 864, 1008, 1152, 1296,
    1440, 1584, 1728, 1872, 2016, 2160, 2304, 2448, 2592, 2736, 2880]);
  // Demand spikes: industrial event pulls (every ~500 intervals)
  const DEMAND_SPIKES = new Set([480, 960, 1440, 1920, 2400]);

  for (let i = 0; i < 2976; i++) {
    const hour     = (i % 96) / 4;            // hour of day 0.0–23.75
    const dayIndex = Math.floor(i / 96);       // calendar day 0–30
    // Jan 1, 2024 = Monday → dayOfWeek: 0=Mon … 6=Sun
    const isWeekend = ((dayIndex % 7) >= 5);

    // Solar: bell curve 7am–7pm, bimodal distribution (0 at night)
    let solar = 0;
    if (hour >= 7 && hour <= 19) {
      solar = 3.5 * Math.sin(Math.PI * (hour - 7) / 12) + (Math.random() - 0.5) * 0.3;
      solar = Math.max(0, solar);
    }
    if (CLOUD_DAYS.has(dayIndex)) solar *= 0.08; // heavy cloud cover
    const solarStr = SOLAR_NULLS.has(i) ? '' : solar.toFixed(3);

    // Demand: morning peak (8am) + evening peak (7pm), weekends lower
    const demandBase  = isWeekend ? 1.7 : 2.8;
    const morningPeak = 1.2 * Math.exp(-0.5 * ((hour - 8)  / 2)   ** 2);
    const eveningPeak = 1.4 * Math.exp(-0.5 * ((hour - 19) / 1.5) ** 2);
    let demand = Math.max(0.5, demandBase + morningPeak + eveningPeak + (Math.random() - 0.5) * 0.4);
    if (DEMAND_SPIKES.has(i)) demand *= 3.2; // industrial event

    // Grid: demand – solar (negative means exporting)
    const grid = (demand - solar).toFixed(3);

    rows.push(`${isoTs(t)},${solarStr},${demand.toFixed(3)},${grid}`);
    t = new Date(t.getTime() + 900000);
  }
  return rows.join('\n');
}

// -----------------------------------------------------------------------
// Dataset registry
// -----------------------------------------------------------------------
export const SAMPLE_DATASETS = [
  {
    id: 'quick-start',
    name: 'Quick Start',
    icon: '🚀',
    meta: '180 rows · daily · nulls · spikes · duplicate',
    filename: 'quick_start.csv',
    get csv() { return buildQuickStart(); },
  },
  {
    id: 'weather',
    name: 'Weather Station',
    icon: '🌤',
    meta: '~690 rows · hourly · correlated · daily cycle',
    filename: 'weather_station.csv',
    get csv() { return buildWeatherStation(); },
  },
  {
    id: 'stocks',
    name: 'Stock Prices',
    icon: '📈',
    meta: '252 rows · non-stationary · skewed volume',
    filename: 'stock_prices.csv',
    get csv() { return buildStockPrices(); },
  },
  {
    id: 'factory',
    name: 'Factory Sensors',
    icon: '🏭',
    meta: '~1750 rows · 5-min · correlated · 2 gaps',
    filename: 'factory_sensors.csv',
    get csv() { return buildFactorySensors(); },
  },
  {
    id: 'solar',
    name: 'Solar & Demand',
    icon: '☀️',
    meta: '2976 rows · 15-min · bimodal · demand spikes',
    filename: 'solar_demand.csv',
    get csv() { return buildSolarDemand(); },
  },
];
