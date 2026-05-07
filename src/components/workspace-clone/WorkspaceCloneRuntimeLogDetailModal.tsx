import { useEffect, useState } from "react";

import { Modal, ModalFooter } from "../ui/Modal";
import { sanitizeReadableText } from "../../utils/text-mojibake";
import { WorkspaceCloneIcon } from "./workspaceCloneIcons";
import type { WorkspaceRuntimeLogItem } from "./workspaceCloneTypes";

interface WorkspaceCloneRuntimeLogDetailModalProps {
  show: boolean;
  runtimeLog: WorkspaceRuntimeLogItem | null;
  onClose: () => void;
}

function resolveVisibleRuntimeLogText(...values: string[]) {
  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed) {
      continue;
    }

    return sanitizeReadableText(trimmed) || trimmed;
  }

  return "日志内容为空";
}

export function WorkspaceCloneRuntimeLogDetailModal({
  show,
  runtimeLog,
  onClose,
}: WorkspaceCloneRuntimeLogDetailModalProps) {
  const [runtimeLogCopied, setRuntimeLogCopied] = useState(false);
  const runtimeLogRawSection = runtimeLog?.detailSections.find((section) => section.tone === "raw") ?? null;
  const runtimeLogTitle = runtimeLog
    ? resolveVisibleRuntimeLogText(runtimeLog.title, runtimeLog.summary, runtimeLog.message)
    : "暂无日志详情";
  const runtimeLogSummary = runtimeLog
    ? resolveVisibleRuntimeLogText(
      runtimeLog.summary !== runtimeLog.title ? runtimeLog.summary : "",
      runtimeLog.message !== runtimeLog.summary ? runtimeLog.message : "",
      runtimeLog.summary,
      runtimeLog.message,
      runtimeLog.title,
    )
    : "请先从运行日志列表中选择一条日志。";
  const runtimeLogRawContent = resolveVisibleRuntimeLogText(runtimeLogRawSection?.content || "");

  useEffect(() => {
    setRuntimeLogCopied(false);
  }, [runtimeLog?.id]);

  useEffect(() => {
    if (!runtimeLogCopied) {
      return undefined;
    }

    const timer = window.setTimeout(() => {
      setRuntimeLogCopied(false);
    }, 1800);

    return () => window.clearTimeout(timer);
  }, [runtimeLogCopied]);

  const handleCopyRuntimeLog = () => {
    if (!runtimeLogRawContent.trim()) {
      return;
    }

    void navigator.clipboard.writeText(runtimeLogRawContent).then(() => {
      setRuntimeLogCopied(true);
    }).catch(() => undefined);
  };

  return (
    <Modal show={show} onClose={onClose} title="运行日志详情" maxWidth={760}>
      <div className="workspace-clone__dialog-body">
        {runtimeLog ? (
          <div className="workspace-clone__log-detail">
            <div className="workspace-clone__dialog-copy workspace-clone__runtime-log-detail-copy">
              <strong>{runtimeLogTitle}</strong>
              <p>{runtimeLogSummary}</p>
            </div>
            <div className="workspace-clone__runtime-log-detail-sections">
              {runtimeLogRawSection ? (
                <section className="workspace-clone__runtime-log-detail-section is-raw">
                  <span className="workspace-clone__runtime-log-detail-label">{runtimeLogRawSection.label}</span>
                  <div className="workspace-clone__runtime-log-raw-wrap">
                    <button
                      type="button"
                      className={`workspace-clone__runtime-log-copy ${runtimeLogCopied ? "is-copied" : ""}`}
                      onClick={handleCopyRuntimeLog}
                      aria-label={runtimeLogCopied ? "已复制原始日志" : "复制原始日志"}
                      title={runtimeLogCopied ? "已复制" : "复制原始日志"}
                    >
                      <WorkspaceCloneIcon
                        name={runtimeLogCopied ? "check" : "copy"}
                        size={14}
                        strokeWidth={2}
                      />
                    </button>
                    <pre>{runtimeLogRawContent}</pre>
                  </div>
                </section>
              ) : null}
            </div>
          </div>
        ) : (
          <div className="workspace-clone__dialog-copy">
            <strong>暂无日志详情</strong>
            <p>请先从运行日志列表中选择一条日志。</p>
          </div>
        )}
      </div>
      <ModalFooter>
        <button className="btn-secondary" type="button" onClick={onClose}>关闭</button>
      </ModalFooter>
    </Modal>
  );
}
