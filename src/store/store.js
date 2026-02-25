import { create } from 'zustand';

/**
 * Central Zustand store.
 * rawTable and cleanedTable hold plain JS arrays of objects (rows).
 * Arquero operations are applied in cleaning modules and results stored back here.
 */
const useStore = create((set, get) => ({
  // ----------------------------------------------------------------
  // Raw parsed data (array of plain objects, one per row)
  // ----------------------------------------------------------------
  rawData: null,       // original parsed rows, never mutated
  cleanedData: null,   // current state after all cleaning ops applied

  // ----------------------------------------------------------------
  // Column metadata (derived from parsed data)
  // ----------------------------------------------------------------
  columns: [],  // [{ name, dtype, sampleValues }]

  // ----------------------------------------------------------------
  // Parse configuration
  // ----------------------------------------------------------------
  parseConfig: {
    delimiter: ',',
    hasHeader: true,
    timestampColumn: null,    // column name identified as the datetime index
    timestampFormat: 'auto',  // 'auto' | explicit format string
    timezone: 'UTC',
  },

  // ----------------------------------------------------------------
  // Profiling results (populated after parse)
  // ----------------------------------------------------------------
  profiling: {
    rowCount: 0,
    columnCount: 0,
    memoryEstimateBytes: 0,
    timeRange: { min: null, max: null },
    detectedFrequency: null,    // e.g. 'hourly', 'daily', '15min', 'irregular'
    detectedFrequencyMs: null,  // median diff in milliseconds
    columnStats: [],            // per-column stats array
    gaps: [],                   // [{ start, end, durationMs, missingCount }]
    duplicates: [],             // duplicate timestamp entries
    outliers: {},               // { columnName: [{ rowIndex, value, method }] }
    qualityScore: null,         // 0–100
    qualityDimensions: {
      completeness: null,
      regularity: null,
      outlierDensity: null,
      duplicateRate: null,
    },
    stationarityResults: [],    // [{ column, adfStat, verdict, pApprox, level, lags }]
    correlationMatrix: null,    // { columns: [], matrix: [[]] } | null
    seasonality: null,          // { dominantPeriodMs, label, confidence } | null
  },

  // ----------------------------------------------------------------
  // Operation log — ordered list of applied cleaning steps
  // Each entry: { id, op, params, description, appliedAt }
  // This is the source of truth for script generation and undo.
  // ----------------------------------------------------------------
  operationLog: [],

  // ----------------------------------------------------------------
  // UI state
  // ----------------------------------------------------------------
  ui: {
    activeTab: 'overview',
    isLoading: false,
    loadingMessage: '',
    progress: null,           // 0–100 or null (indeterminate)
    largeFileMode: false,     // true when file exceeds threshold
    filename: null,
    fileSize: null,
    parseStep: 'upload',      // 'upload' | 'config' | 'workspace'
    toasts: [],               // [{ id, type, message }]
    sidebarSection: {         // which sections are expanded in ops panel
      timestamp: true,
      missing: true,
      outliers: false,
      resample: false,
      smooth: false,
      columns: false,
    },
  },

  // ----------------------------------------------------------------
  // Actions
  // ----------------------------------------------------------------

  setRawData: (data) => set({ rawData: data, cleanedData: data }),

  setCleanedData: (data) => set({ cleanedData: data }),

  setColumns: (columns) => set({ columns }),

  setParseConfig: (updates) =>
    set((state) => ({
      parseConfig: { ...state.parseConfig, ...updates },
    })),

  setProfiling: (updates) =>
    set((state) => ({
      profiling: { ...state.profiling, ...updates },
    })),

  setUI: (updates) =>
    set((state) => ({
      ui: { ...state.ui, ...updates },
    })),

  setSidebarSection: (section, open) =>
    set((state) => ({
      ui: {
        ...state.ui,
        sidebarSection: { ...state.ui.sidebarSection, [section]: open },
      },
    })),

  // Operation log management
  appendOperation: (op) =>
    set((state) => ({
      operationLog: [...state.operationLog, { ...op, appliedAt: Date.now() }],
    })),

  removeOperation: (id) =>
    set((state) => ({
      operationLog: state.operationLog.filter((o) => o.id !== id),
    })),

  clearOperations: () => set({ operationLog: [] }),

  // Toast management
  addToast: (type, message) => {
    const id = Math.random().toString(36).slice(2);
    set((state) => ({
      ui: { ...state.ui, toasts: [...state.ui.toasts, { id, type, message }] },
    }));
    setTimeout(() => {
      set((state) => ({
        ui: { ...state.ui, toasts: state.ui.toasts.filter((t) => t.id !== id) },
      }));
    }, 4000);
  },

  dismissToast: (id) =>
    set((state) => ({
      ui: { ...state.ui, toasts: state.ui.toasts.filter((t) => t.id !== id) },
    })),

  // Full reset
  reset: () =>
    set({
      rawData: null,
      cleanedData: null,
      columns: [],
      parseConfig: {
        delimiter: ',',
        hasHeader: true,
        timestampColumn: null,
        timestampFormat: 'auto',
        timezone: 'UTC',
      },
      profiling: {
        rowCount: 0,
        columnCount: 0,
        memoryEstimateBytes: 0,
        timeRange: { min: null, max: null },
        detectedFrequency: null,
        detectedFrequencyMs: null,
        columnStats: [],
        gaps: [],
        duplicates: [],
        outliers: {},
        qualityScore: null,
        qualityDimensions: {
          completeness: null,
          regularity: null,
          outlierDensity: null,
          duplicateRate: null,
        },
        stationarityResults: [],
        correlationMatrix: null,
        seasonality: null,
      },
      operationLog: [],
      ui: {
        activeTab: 'overview',
        isLoading: false,
        loadingMessage: '',
        progress: null,
        largeFileMode: false,
        filename: null,
        fileSize: null,
        parseStep: 'upload',
        toasts: [],
        sidebarSection: {
          timestamp: true,
          missing: true,
          outliers: false,
          resample: false,
          smooth: false,
          columns: false,
        },
      },
    }),
}));

export default useStore;
