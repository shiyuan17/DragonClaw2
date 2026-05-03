import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertCircle, AlertTriangle, CheckCircle2, Info, X } from "lucide-react";
import { useFeedbackState, type FeedbackItem, type FeedbackTone } from "../hooks/useFeedback";

function resolveFeedbackIcon(tone: FeedbackTone) {
  switch (tone) {
    case "success":
      return CheckCircle2;
    case "warning":
      return AlertTriangle;
    case "error":
      return AlertCircle;
    case "info":
    default:
      return Info;
  }
}

export function FeedbackCenterHost() {
  const { items, maxVisible, dismissFeedback } = useFeedbackState();
  const [actioningIds, setActioningIds] = useState<string[]>([]);
  const timersRef = useRef<Record<string, number>>({});
  const visibleItems = useMemo(() => items.slice(0, maxVisible), [items, maxVisible]);

  useEffect(() => {
    const activeIds = new Set<string>();

    visibleItems.forEach((item) => {
      activeIds.add(item.id);
      if (item.persistent || !item.autoCloseMs || timersRef.current[item.id]) {
        return;
      }

      timersRef.current[item.id] = window.setTimeout(() => {
        dismissFeedback(item.id);
        delete timersRef.current[item.id];
      }, item.autoCloseMs);
    });

    Object.entries(timersRef.current).forEach(([id, timer]) => {
      if (activeIds.has(id)) {
        return;
      }
      window.clearTimeout(timer);
      delete timersRef.current[id];
    });
  }, [dismissFeedback, visibleItems]);

  useEffect(
    () => () => {
      Object.values(timersRef.current).forEach((timer) => window.clearTimeout(timer));
      timersRef.current = {};
    },
    [],
  );

  const handleAction = async (item: FeedbackItem) => {
    if (!item.onAction || actioningIds.includes(item.id)) {
      return;
    }

    setActioningIds((current) => [...current, item.id]);
    try {
      await item.onAction();
    } finally {
      setActioningIds((current) => current.filter((id) => id !== item.id));
      dismissFeedback(item.id);
    }
  };

  return (
    <div className="feedback-center" aria-live="polite" aria-atomic="false">
      <div className="feedback-center__stack">
        <AnimatePresence initial={false}>
          {visibleItems.map((item) => {
            const Icon = resolveFeedbackIcon(item.tone);
            const isActioning = actioningIds.includes(item.id);

            return (
              <motion.section
                key={item.id}
                className={`feedback-toast is-${item.tone}`}
                initial={{ opacity: 0, y: -18, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -12, scale: 0.98 }}
                transition={{ duration: 0.22, ease: [0.2, 0, 0, 1] }}
              >
                <div className="feedback-toast__icon" aria-hidden="true">
                  <Icon size={17} strokeWidth={2.2} />
                </div>

                <div className="feedback-toast__content">
                  {item.title ? <strong className="feedback-toast__title">{item.title}</strong> : null}
                  <p className="feedback-toast__message">{item.message}</p>
                </div>

                {item.actionLabel ? (
                  <button
                    type="button"
                    className="feedback-toast__action"
                    onClick={() => void handleAction(item)}
                    disabled={isActioning}
                  >
                    {isActioning ? "处理中..." : item.actionLabel}
                  </button>
                ) : null}

                <button
                  type="button"
                  className="feedback-toast__close"
                  aria-label="关闭提示"
                  onClick={() => dismissFeedback(item.id)}
                >
                  <X size={16} strokeWidth={2.2} />
                </button>
              </motion.section>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}
