import { create } from 'zustand';

export interface GroqRateTelemetry {
  tpdLimit: number | null;
  tpdRemaining: number | null;
  retryAfterSeconds: number | null;
  updatedAt: string | null;
}

interface AIConfigState {
  selectedModel: string;
  fallbackModel: string;
  autoFallbackToCompletions: boolean;
  userGroqApiKey: string;
  activeModel: string;
  rateTelemetryByModel: Record<string, GroqRateTelemetry>;
  setSelectedModel: (model: string) => void;
  setFallbackModel: (model: string) => void;
  setAutoFallbackToCompletions: (enabled: boolean) => void;
  setUserGroqApiKey: (apiKey: string) => void;
  setActiveModel: (model: string) => void;
  updateRateTelemetry: (
    model: string,
    telemetry: Partial<GroqRateTelemetry>,
  ) => void;
}

const STORAGE_KEY = 'lms_ai_config_v1';

const DEFAULT_MODEL = 'llama-3.3-70b-versatile';
const DEFAULT_FALLBACK_MODEL = 'llama-3.1-8b-instant';

const EMPTY_TELEMETRY: GroqRateTelemetry = {
  tpdLimit: null,
  tpdRemaining: null,
  retryAfterSeconds: null,
  updatedAt: null,
};

export const GROQ_MODEL_SUGGESTIONS = [
  "allam-2-7b",
  "canopylabs/orpheus-arabic-saudi",
  "canopylabs/orpheus-v1-english",
  "groq/compound",
  "groq/compound-mini",
  "llama-3.1-8b-instant",
  "llama-3.3-70b-versatile",
  "meta-llama/llama-4-maverick-17b-128e-instruct",
  "meta-llama/llama-4-scout-17b-16e-instruct",
  "meta-llama/llama-guard-4-12b",
  "meta-llama/llama-prompt-guard-2-22m",
  "meta-llama/llama-prompt-guard-2-86m",
  "moonshotai/kimi-k2-instruct",
  "moonshotai/kimi-k2-instruct-0905",
  "openai/gpt-oss-120b",
  "openai/gpt-oss-20b",
  "openai/gpt-oss-safeguard-20b",
  "qwen/qwen3-32b"
];


type PersistedAIConfig = Pick<
  AIConfigState,
  | 'selectedModel'
  | 'fallbackModel'
  | 'autoFallbackToCompletions'
  | 'userGroqApiKey'
  | 'activeModel'
  | 'rateTelemetryByModel'
>;

function sanitizeModel(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : fallback;
}

function loadPersistedAIConfig(): PersistedAIConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return {
        selectedModel: DEFAULT_MODEL,
        fallbackModel: DEFAULT_FALLBACK_MODEL,
        autoFallbackToCompletions: false,
        userGroqApiKey: '',
        activeModel: DEFAULT_MODEL,
        rateTelemetryByModel: {},
      };
    }

    const parsed = JSON.parse(raw) as Partial<PersistedAIConfig>;
    return {
      selectedModel: sanitizeModel(parsed.selectedModel, DEFAULT_MODEL),
      fallbackModel: sanitizeModel(parsed.fallbackModel, DEFAULT_FALLBACK_MODEL),
      autoFallbackToCompletions:
        typeof parsed.autoFallbackToCompletions === 'boolean'
          ? parsed.autoFallbackToCompletions
          : false,
      userGroqApiKey:
        typeof parsed.userGroqApiKey === 'string' ? parsed.userGroqApiKey : '',
      activeModel: sanitizeModel(parsed.activeModel, DEFAULT_MODEL),
      rateTelemetryByModel:
        parsed.rateTelemetryByModel && typeof parsed.rateTelemetryByModel === 'object'
          ? parsed.rateTelemetryByModel
          : {},
    };
  } catch {
    return {
      selectedModel: DEFAULT_MODEL,
      fallbackModel: DEFAULT_FALLBACK_MODEL,
      autoFallbackToCompletions: false,
      userGroqApiKey: '',
      activeModel: DEFAULT_MODEL,
      rateTelemetryByModel: {},
    };
  }
}

function persistState(state: AIConfigState): void {
  const payload: PersistedAIConfig = {
    selectedModel: state.selectedModel,
    fallbackModel: state.fallbackModel,
    autoFallbackToCompletions: state.autoFallbackToCompletions,
    userGroqApiKey: state.userGroqApiKey,
    activeModel: state.activeModel,
    rateTelemetryByModel: state.rateTelemetryByModel,
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

const initial = loadPersistedAIConfig();

export const useAIConfigStore = create<AIConfigState>((set, get) => ({
  ...initial,
  setSelectedModel: (model) => {
    set((state) => {
      const next = { ...state, selectedModel: sanitizeModel(model, DEFAULT_MODEL) };
      persistState(next);
      return next;
    });
  },
  setFallbackModel: (model) => {
    set((state) => {
      const next = { ...state, fallbackModel: sanitizeModel(model, DEFAULT_FALLBACK_MODEL) };
      persistState(next);
      return next;
    });
  },
  setAutoFallbackToCompletions: (enabled) => {
    set((state) => {
      const next = { ...state, autoFallbackToCompletions: enabled };
      persistState(next);
      return next;
    });
  },
  setUserGroqApiKey: (apiKey) => {
    set((state) => {
      const next = { ...state, userGroqApiKey: apiKey.trim() };
      persistState(next);
      return next;
    });
  },
  setActiveModel: (model) => {
    set((state) => {
      const next = { ...state, activeModel: sanitizeModel(model, state.selectedModel) };
      persistState(next);
      return next;
    });
  },
  updateRateTelemetry: (model, telemetry) => {
    const cleanModel = sanitizeModel(model, DEFAULT_MODEL);
    set((state) => {
      const current = state.rateTelemetryByModel[cleanModel] ?? EMPTY_TELEMETRY;
      const nextTelemetry: GroqRateTelemetry = {
        ...current,
        ...telemetry,
        updatedAt: telemetry.updatedAt ?? new Date().toISOString(),
      };
      const next = {
        ...state,
        rateTelemetryByModel: {
          ...state.rateTelemetryByModel,
          [cleanModel]: nextTelemetry,
        },
      };
      persistState(next);
      return next;
    });
  },
}));

export interface AIConfigSnapshot {
  selectedModel: string;
  fallbackModel: string;
  autoFallbackToCompletions: boolean;
  userGroqApiKey: string;
  activeModel: string;
}

export function getAIConfigSnapshot(): AIConfigSnapshot {
  const state = useAIConfigStore.getState();
  return {
    selectedModel: state.selectedModel,
    fallbackModel: state.fallbackModel,
    autoFallbackToCompletions: state.autoFallbackToCompletions,
    userGroqApiKey: state.userGroqApiKey,
    activeModel: state.activeModel,
  };
}

export function updateGroqRateTelemetry(
  model: string,
  telemetry: Partial<GroqRateTelemetry>,
): void {
  useAIConfigStore.getState().updateRateTelemetry(model, telemetry);
}

export function setGroqActiveModel(model: string): void {
  useAIConfigStore.getState().setActiveModel(model);
}
