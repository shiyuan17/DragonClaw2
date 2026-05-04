import { useEffect } from "react";

import { useFeedback } from "../useFeedback";

interface UseWorkspaceCloneFeedbackOptions {
  memoryNotice: string;
  memoryError: string;
  memoryErrorTitle: string;
  skillNotice: string;
  skillError: string;
  skillErrorTitle: string;
  toolNotice: string;
  toolError: string;
  toolErrorTitle: string;
  commandNotice: string;
  commandError: string;
  channelNotice: string;
  channelError: string;
  channelErrorTitle: string;
  activeChannelId: string | null;
  weixinQrStarting: boolean;
  weixinQrPolling: boolean;
  weixinQrUrl: string;
  hasActiveWeixinQrSession: boolean;
}

export function useWorkspaceCloneFeedback({
  memoryNotice,
  memoryError,
  memoryErrorTitle,
  skillNotice,
  skillError,
  skillErrorTitle,
  toolNotice,
  toolError,
  toolErrorTitle,
  commandNotice,
  commandError,
  channelNotice,
  channelError,
  channelErrorTitle,
  activeChannelId,
  weixinQrStarting,
  weixinQrPolling,
  weixinQrUrl,
  hasActiveWeixinQrSession,
}: UseWorkspaceCloneFeedbackOptions) {
  const { pushFeedback } = useFeedback();

  useEffect(() => {
    const message = memoryNotice.trim();
    if (!message) {
      return;
    }

    pushFeedback({
      tone: "success",
      message,
      dedupeKey: "workspace-memory-notice",
      persistent: false,
    });
  }, [memoryNotice, pushFeedback]);

  useEffect(() => {
    const message = memoryError.trim();
    if (!message) {
      return;
    }

    pushFeedback({
      tone: "error",
      title: memoryErrorTitle,
      message,
      dedupeKey: "workspace-memory-error",
      persistent: false,
      autoCloseMs: 3600,
    });
  }, [memoryError, memoryErrorTitle, pushFeedback]);

  useEffect(() => {
    const message = skillNotice.trim();
    if (!message) {
      return;
    }

    pushFeedback({
      tone: "success",
      message,
      dedupeKey: "workspace-skills-notice",
      persistent: false,
    });
  }, [pushFeedback, skillNotice]);

  useEffect(() => {
    const message = skillError.trim();
    if (!message) {
      return;
    }

    pushFeedback({
      tone: "error",
      title: skillErrorTitle,
      message,
      dedupeKey: "workspace-skills-error",
      persistent: false,
      autoCloseMs: 3600,
    });
  }, [pushFeedback, skillError, skillErrorTitle]);

  useEffect(() => {
    const message = toolNotice.trim();
    if (!message) {
      return;
    }

    pushFeedback({
      tone: "success",
      message,
      dedupeKey: "workspace-tools-notice",
      persistent: false,
    });
  }, [pushFeedback, toolNotice]);

  useEffect(() => {
    const message = toolError.trim();
    if (!message) {
      return;
    }

    pushFeedback({
      tone: "error",
      title: toolErrorTitle,
      message,
      dedupeKey: "workspace-tools-error",
      persistent: false,
      autoCloseMs: 3600,
    });
  }, [pushFeedback, toolError, toolErrorTitle]);

  useEffect(() => {
    const message = commandNotice.trim();
    if (!message) {
      return;
    }

    pushFeedback({
      tone: "success",
      message,
      dedupeKey: "workspace-commands-notice",
      persistent: false,
    });
  }, [commandNotice, pushFeedback]);

  useEffect(() => {
    const message = commandError.trim();
    if (!message) {
      return;
    }

    pushFeedback({
      tone: "error",
      title: "Slash Commands",
      message,
      dedupeKey: "workspace-commands-error",
      persistent: false,
      autoCloseMs: 3600,
    });
  }, [commandError, pushFeedback]);

  useEffect(() => {
    const message = channelNotice.trim();
    if (!message) {
      return;
    }

    const isWeixinProcessNotice = activeChannelId === "weixin" && (
      weixinQrStarting
      || weixinQrPolling
      || weixinQrUrl.trim().length > 0
      || hasActiveWeixinQrSession
    );
    if (isWeixinProcessNotice) {
      return;
    }

    pushFeedback({
      tone: "success",
      message,
      dedupeKey: "workspace-channel-notice",
      persistent: false,
    });
  }, [
    activeChannelId,
    channelNotice,
    hasActiveWeixinQrSession,
    pushFeedback,
    weixinQrPolling,
    weixinQrStarting,
    weixinQrUrl,
  ]);

  useEffect(() => {
    const message = channelError.trim();
    if (!message) {
      return;
    }

    pushFeedback({
      tone: "error",
      title: channelErrorTitle,
      message,
      dedupeKey: "workspace-channel-error",
      persistent: false,
      autoCloseMs: 3600,
    });
  }, [channelError, channelErrorTitle, pushFeedback]);
}
