import { useRef } from "react";
import { Modal } from "../ui/Modal";
import type {
  WorkspaceCloneAvatarCategoryId,
  WorkspaceCloneAvatarOption,
} from "./workspaceCloneAvatarPresets";

interface WorkspaceCloneAvatarModalProps {
  show: boolean;
  selectedEntity: {
    name: string;
    subtitle: string;
    avatarLabel: string;
    avatarUrl?: string;
  } | null;
  categoryTabs: Array<{ id: WorkspaceCloneAvatarCategoryId; label: string }>;
  activeCategory: WorkspaceCloneAvatarCategoryId;
  presetOptions: WorkspaceCloneAvatarOption[];
  selectedPresetId: string | null;
  notice: string;
  error: string;
  onClose: () => void;
  onSetCategory: (category: WorkspaceCloneAvatarCategoryId) => void;
  onApplyPreset: (option: WorkspaceCloneAvatarOption) => void;
  onUploadChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onResetDefault: () => void;
}

export function WorkspaceCloneAvatarModal({
  show,
  selectedEntity,
  categoryTabs,
  activeCategory,
  presetOptions,
  selectedPresetId,
  notice,
  error,
  onClose,
  onSetCategory,
  onApplyPreset,
  onUploadChange,
  onResetDefault,
}: WorkspaceCloneAvatarModalProps) {
  const uploadInputRef = useRef<HTMLInputElement | null>(null);

  return (
    <Modal
      show={show && Boolean(selectedEntity)}
      onClose={onClose}
      title="头像设置"
      maxWidth={860}
      overlayClassName="workspace-avatar-modal__overlay"
      contentClassName="workspace-avatar-modal__surface"
    >
      <div className="workspace-avatar-modal">
        <div className="workspace-avatar-modal__hero">
          <span className="workspace-avatar-modal__preview" aria-hidden="true">
            {selectedEntity?.avatarUrl ? (
              <img src={selectedEntity.avatarUrl} alt="" />
            ) : (
              <span>{selectedEntity?.avatarLabel || selectedEntity?.name?.slice(0, 1) || "A"}</span>
            )}
          </span>
          <div className="workspace-avatar-modal__copy">
            <strong>{selectedEntity?.name || "数字员工"}</strong>
            <p>{selectedEntity?.subtitle || "选择预设头像、上传自定义图片，或恢复默认头像。"}</p>
          </div>
        </div>

        <div className="workspace-avatar-modal__tabs" role="tablist" aria-label="头像分类">
          {categoryTabs.map((category) => (
            <button
              key={category.id}
              type="button"
              className={activeCategory === category.id ? "is-active" : ""}
              onClick={() => onSetCategory(category.id)}
            >
              {category.label}
            </button>
          ))}
        </div>

        <div className="workspace-avatar-modal__grid" role="list">
          {presetOptions.map((option) => (
            <button
              key={option.id}
              type="button"
              className={selectedPresetId === option.id ? "is-active" : ""}
              title={option.label}
              onClick={() => onApplyPreset(option)}
            >
              <img src={option.url} alt={option.label} loading="lazy" decoding="async" />
            </button>
          ))}
        </div>

        <div className="workspace-avatar-modal__actions">
          <button
            type="button"
            className="btn-primary"
            onClick={() => uploadInputRef.current?.click()}
          >
            上传自定义图片
          </button>
          <button type="button" className="btn-secondary" onClick={onResetDefault}>
            恢复默认
          </button>
        </div>

        {notice ? <div className="workspace-avatar-modal__feedback is-notice">{notice}</div> : null}
        {error ? <div className="workspace-avatar-modal__feedback is-error">{error}</div> : null}

        <input
          ref={uploadInputRef}
          className="workspace-avatar-modal__upload-input"
          type="file"
          accept="image/*"
          onChange={onUploadChange}
        />
      </div>
    </Modal>
  );
}
