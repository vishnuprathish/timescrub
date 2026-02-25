/**
 * Built-in sample datasets for demos.
 * Each dataset has: id, name, icon, meta, filename, csv (inline string).
 */

function buildSensorData() {
  const rows = ['timestamp,temperature,humidity,pressure'];
  let t = new Date('2024-01-01T00:00:00Z');
  for (let i = 0; i < 365; i++) {
    const temp = (20 + 8 * Math.sin((i / 365) * 2 * Math.PI) + (Math.random() - 0.5) * 2).toFixed(2);
    const hum = (60 + 15 * Math.sin((i / 365) * 2 * Math.PI + 1) + (Math.random() - 0.5) * 5).toFixed(1);
    const pres = (1013 + 5 * Math.sin((i / 365) * 4 * Math.PI) + (Math.random() - 0.5)).toFixed(1);
    // Inject some nulls and outliers
    const tempVal = i % 47 === 0 ? '' : (i % 93 === 0 ? (parseFloat(temp) + 25).toFixed(2) : temp);
    const humVal = i % 71 === 0 ? '' : hum;
    rows.push(`${t.toISOString()},${tempVal},${humVal},${pres}`);
    t = new Date(t.getTime() + 86400000);
  }
  return rows.join('\n');
}

function buildWeatherHourly() {
  const rows = ['timestamp,temp_c,wind_kmh,rain_mm'];
  let t = new Date('2024-01-01T00:00:00Z');
  for (let i = 0; i < 720; i++) { // 30 days hourly
    const temp = (5 + 10 * Math.sin((i / 24) * Math.PI / 7) + (Math.random() - 0.5) * 3).toFixed(1);
    const wind = Math.max(0, (15 + 10 * Math.random() - 5)).toFixed(1);
    const rain = i % 48 < 6 ? (Math.random() * 3).toFixed(2) : '0';
    // Inject some gaps (missing hours)
    if (i % 120 === 0 && i > 0) { t = new Date(t.getTime() + 86400000 * 3); } // 3-day gap
    rows.push(`${t.toISOString()},${temp},${wind},${rain}`);
    t = new Date(t.getTime() + 3600000);
  }
  return rows.join('\n');
}

function buildOHLCV() {
  const rows = ['date,open,high,low,close,volume'];
  let t = new Date('2023-01-02T00:00:00Z');
  let price = 150;
  for (let i = 0; i < 252; i++) { // trading days
    // Skip weekends
    while (t.getDay() === 0 || t.getDay() === 6) t = new Date(t.getTime() + 86400000);
    price += (Math.random() - 0.495) * 3;
    const open = price.toFixed(2);
    const close = (price + (Math.random() - 0.5) * 2).toFixed(2);
    const high = (Math.max(parseFloat(open), parseFloat(close)) + Math.random() * 2).toFixed(2);
    const low = (Math.min(parseFloat(open), parseFloat(close)) - Math.random() * 2).toFixed(2);
    const vol = Math.round(1000000 + (Math.random() - 0.5) * 500000);
    rows.push(`${t.toISOString().slice(0, 10)},${open},${high},${low},${close},${vol}`);
    t = new Date(t.getTime() + 86400000);
  }
  return rows.join('\n');
}

function buildIoTWithGaps() {
  const rows = ['timestamp,sensor_a,sensor_b,sensor_c'];
  let t = new Date('2024-03-01T00:00:00Z');
  for (let i = 0; i < 2016; i++) { // 7 days × 5-min intervals
    const a = (Math.sin(i / 100) * 50 + 100 + (Math.random() - 0.5) * 5).toFixed(3);
    const b = (Math.cos(i / 80) * 30 + 80 + (Math.random() - 0.5) * 3).toFixed(3);
    const c = (Math.sin(i / 60 + 1) * 20 + 60 + (Math.random() - 0.5) * 2).toFixed(3);
    // Introduce gaps and nulls
    const skip = (i > 500 && i < 600) || (i > 1200 && i < 1250);
    if (!skip) {
      const aVal = i % 37 === 0 ? '' : (i % 200 === 0 ? (parseFloat(a) * 3).toFixed(3) : a);
      rows.push(`${t.toISOString()},${aVal},${b},${c}`);
    }
    t = new Date(t.getTime() + 300000); // 5 min
  }
  return rows.join('\n');
}

function buildEnergy15min() {
  const rows = ['timestamp,consumption_kwh,solar_kwh,grid_kwh'];
  let t = new Date('2024-01-01T00:00:00Z');
  for (let i = 0; i < 2976; i++) { // 31 days × 96 intervals
    const hour = t.getHours();
    const solarFactor = Math.max(0, Math.sin((hour - 6) / 12 * Math.PI));
    const consumption = (2 + 3 * Math.sin((hour / 24) * 2 * Math.PI + 1) + (Math.random()) * 0.5).toFixed(3);
    const solar = (solarFactor * 3.5 + Math.random() * 0.3).toFixed(3);
    const grid = Math.max(0, parseFloat(consumption) - parseFloat(solar)).toFixed(3);
    rows.push(`${t.toISOString()},${consumption},${solar},${grid}`);
    t = new Date(t.getTime() + 900000); // 15 min
  }
  return rows.join('\n');
}

export const SAMPLE_DATASETS = [
  {
    id: 'sensor',
    name: 'Sensor (Daily)',
    icon: '🌡',
    meta: '365 rows · 3 cols · gaps + outliers',
    filename: 'sensor_daily.csv',
    get csv() { return buildSensorData(); },
  },
  {
    id: 'weather',
    name: 'Weather (Hourly)',
    icon: '🌤',
    meta: '720 rows · 3 cols · missing hours',
    filename: 'weather_hourly.csv',
    get csv() { return buildWeatherHourly(); },
  },
  {
    id: 'ohlcv',
    name: 'OHLCV (Financial)',
    icon: '📈',
    meta: '252 rows · 5 cols · business days',
    filename: 'ohlcv_financial.csv',
    get csv() { return buildOHLCV(); },
  },
  {
    id: 'iot',
    name: 'IoT with Gaps',
    icon: '📡',
    meta: '~1900 rows · 3 cols · 5-min · gaps',
    filename: 'iot_with_gaps.csv',
    get csv() { return buildIoTWithGaps(); },
  },
  {
    id: 'energy',
    name: 'Energy (15-min)',
    icon: '⚡',
    meta: '2976 rows · 3 cols · 15-min',
    filename: 'energy_15min.csv',
    get csv() { return buildEnergy15min(); },
  },
];
