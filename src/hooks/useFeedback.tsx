import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type PropsWithChildren,
} from "react";

export type FeedbackTone = "success" | "error" | "warning" | "info";

export interface FeedbackPayload {
  tone: FeedbackTone;
  title?: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void | Promise<void>;
  autoCloseMs?: number;
  dedupeKey?: string;
  persistent?: boolean;
}

export interface FeedbackItem extends FeedbackPayload {
  id: string;
  createdAt: number;
  persistent: boolean;
  autoCloseMs?: number;
}

interface FeedbackContextValue {
  items: FeedbackItem[];
  maxVisible: number;
  pushFeedback: (payload: FeedbackPayload) => string | null;
  dismissFeedback: (id: string) => void;
  clearFeedbacks: () => void;
}

const MAX_VISIBLE_FEEDBACK_ITEMS = 3;
const DEFAULT_AUTO_CLOSE_MS = 4200;

const FeedbackContext = createContext<FeedbackContextValue | null>(null);

function resolveFeedbackPersistence(payload: FeedbackPayload) {
  if (typeof payload.persistent === "boolean") {
    return payload.persistent;
  }

  if (payload.actionLabel?.trim()) {
    return true;
  }

  return payload.tone === "error";
}

function normalizeFeedbackPayload(payload: FeedbackPayload): FeedbackItem | null {
  const title = payload.title?.trim() || "";
  const message = payload.message.trim();
  if (!title && !message) {
    return null;
  }

  const persistent = resolveFeedbackPersistence(payload);
  const autoCloseMs = typeof payload.autoCloseMs === "number"
    ? payload.autoCloseMs
    : persistent
      ? undefined
      : DEFAULT_AUTO_CLOSE_MS;

  return {
    ...payload,
    title,
    message,
    actionLabel: payload.actionLabel?.trim() || undefined,
    persistent,
    autoCloseMs,
    id: "",
    createdAt: Date.now(),
  };
}

export function FeedbackProvider({ children }: PropsWithChildren) {
  const [items, setItems] = useState<FeedbackItem[]>([]);

  const pushFeedback = useCallback((payload: FeedbackPayload) => {
    const normalized = normalizeFeedbackPayload(payload);
    if (!normalized) {
      return null;
    }

    const nextId = `feedback-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const nextItem: FeedbackItem = {
      ...normalized,
      id: nextId,
      createdAt: Date.now(),
    };

    setItems((current) => {
      const dedupeKey = nextItem.dedupeKey?.trim();
      if (dedupeKey) {
        const existingIndex = current.findIndex((item) => item.dedupeKey === dedupeKey);
        if (existingIndex >= 0) {
          const next = [...current];
          next[existingIndex] = {
            ...nextItem,
            id: current[existingIndex].id,
          };
          return next;
        }
      }

      return [...current, nextItem];
    });

    return nextId;
  }, []);

  const dismissFeedback = useCallback((id: string) => {
    setItems((current) => current.filter((item) => item.id !== id));
  }, []);

  const clearFeedbacks = useCallback(() => {
    setItems([]);
  }, []);

  const value = useMemo<FeedbackContextValue>(() => ({
    items,
    maxVisible: MAX_VISIBLE_FEEDBACK_ITEMS,
    pushFeedback,
    dismissFeedback,
    clearFeedbacks,
  }), [clearFeedbacks, dismissFeedback, items, pushFeedback]);

  return (
    <FeedbackContext.Provider value={value}>
      {children}
    </FeedbackContext.Provider>
  );
}

function useFeedbackContext() {
  const context = useContext(FeedbackContext);
  if (!context) {
    throw new Error("useFeedback must be used within a FeedbackProvider.");
  }
  return context;
}

export function useFeedback() {
  const { pushFeedback, dismissFeedback, clearFeedbacks } = useFeedbackContext();
  return {
    pushFeedback,
    dismissFeedback,
    clearFeedbacks,
  };
}

export function useFeedbackState() {
  const { items, maxVisible, dismissFeedback } = useFeedbackContext();
  return {
    items,
    maxVisible,
    dismissFeedback,
  };
}
