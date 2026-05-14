import { useEffect, useMemo, useRef, type MutableRefObject, type ReactNode, type UIEvent } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { WorkspaceRenderableMessage } from "./workspaceChatRenderTypes";

const MESSAGE_OVERSCAN = 8;
const MESSAGE_ESTIMATED_HEIGHT = 168;
const MESSAGE_BOTTOM_THRESHOLD_PX = 96;

interface WorkspaceChatVirtualMessageListProps {
  messages: WorkspaceRenderableMessage[];
  sessionKey: string;
  loadingOlder?: boolean;
  hasMoreBefore?: boolean;
  onLoadOlderHistoryPage?: () => boolean | Promise<boolean>;
  onNearBottomChange?: (nearBottom: boolean) => void;
  onBlankAreaClick: (event: React.MouseEvent<HTMLElement>) => void;
  renderMessage: (message: WorkspaceRenderableMessage) => ReactNode;
  scrollElementRef?: MutableRefObject<HTMLDivElement | null>;
}

export function WorkspaceChatVirtualMessageList({
  messages,
  sessionKey,
  loadingOlder = false,
  hasMoreBefore = false,
  onLoadOlderHistoryPage,
  onNearBottomChange,
  onBlankAreaClick,
  renderMessage,
  scrollElementRef,
}: WorkspaceChatVirtualMessageListProps) {
  const parentRef = useRef<HTMLDivElement | null>(null);
  const lastSessionKeyRef = useRef(sessionKey);
  const loadingOlderRef = useRef(false);
  const lastMessageKey = messages[messages.length - 1]?.render.key ?? "";
  const virtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => MESSAGE_ESTIMATED_HEIGHT,
    overscan: MESSAGE_OVERSCAN,
    getItemKey: (index) => messages[index]?.id ?? index,
  });
  const virtualItems = virtualizer.getVirtualItems();
  const renderedVirtualItems = virtualItems.length > 0 || messages.length === 0
    ? virtualItems
    : messages.slice(-60).map((message, offset, windowed) => {
      const index = messages.length - windowed.length + offset;
      return {
        key: message.id,
        index,
        start: offset * MESSAGE_ESTIMATED_HEIGHT,
      };
    });
  const setScrollElement = (element: HTMLDivElement | null) => {
    parentRef.current = element;
    if (scrollElementRef) {
      scrollElementRef.current = element;
    }
  };

  const isNearBottom = () => {
    const element = parentRef.current;
    if (!element) {
      return true;
    }
    return element.scrollHeight - element.scrollTop - element.clientHeight <= MESSAGE_BOTTOM_THRESHOLD_PX;
  };

  useEffect(() => {
    const element = parentRef.current;
    if (!element || messages.length === 0) {
      return;
    }

    const sessionChanged = lastSessionKeyRef.current !== sessionKey;
    lastSessionKeyRef.current = sessionKey;
    if (!sessionChanged && !isNearBottom()) {
      return;
    }

    window.requestAnimationFrame(() => {
      virtualizer.scrollToIndex(messages.length - 1, { align: "end" });
      onNearBottomChange?.(true);
    });
  }, [lastMessageKey, messages.length, onNearBottomChange, sessionKey, virtualizer]);

  const handleScroll = (event: UIEvent<HTMLDivElement>) => {
    const element = event.currentTarget;
    const nearBottom = isNearBottom();
    onNearBottomChange?.(nearBottom);
    if (!hasMoreBefore || loadingOlder || loadingOlderRef.current || !onLoadOlderHistoryPage) {
      return;
    }
    if (element.scrollTop > 48) {
      return;
    }

    loadingOlderRef.current = true;
    void Promise.resolve(onLoadOlderHistoryPage()).finally(() => {
      loadingOlderRef.current = false;
    });
  };

  const totalSize = virtualizer.getTotalSize();
  const spacerStyle = useMemo(() => ({
    height: `${totalSize}px`,
    position: "relative" as const,
  }), [totalSize]);

  return (
    <div
      ref={setScrollElement}
      className="workspace-clone__message-scroll"
      onScroll={handleScroll}
      onClick={onBlankAreaClick}
    >
      <div className="workspace-clone__message-list workspace-clone__message-list--virtual" onClick={onBlankAreaClick} style={spacerStyle}>
        {loadingOlder ? (
          <div className="workspace-clone__history-page-loading">正在加载更早消息...</div>
        ) : null}
        {renderedVirtualItems.map((virtualItem) => {
          const message = messages[virtualItem.index];
          if (!message) {
            return null;
          }

          return (
            <div
              key={virtualItem.key}
              ref={virtualizer.measureElement}
              data-index={virtualItem.index}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                transform: `translateY(${virtualItem.start}px)`,
              }}
            >
              {renderMessage(message)}
            </div>
          );
        })}
      </div>
      <div className="workspace-clone__canvas-fill" onClick={onBlankAreaClick} />
    </div>
  );
}
