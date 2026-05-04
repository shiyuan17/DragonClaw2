import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

import {
  createUniqueWorkspaceSlashCommandValue,
  createWorkspaceSlashCommandId,
  mapWorkspaceSlashCommandRecord,
  toWorkspaceActiveSlashCommand,
  WORKSPACE_BUILTIN_SLASH_COMMANDS,
} from "../../components/workspace-clone/workspaceCloneSlashCommands";
import type {
  WorkspaceActiveSlashCommand,
  WorkspaceSlashCommandDefinition,
  WorkspaceSlashCommandDraftInput,
  WorkspaceSlashCommandRecord,
} from "../../components/workspace-clone/workspaceCloneTypes";

const EMPTY_WORKSPACE_SLASH_COMMAND_DRAFT: WorkspaceSlashCommandDraftInput = {
  name: "",
  description: "",
  instruction: "",
};

export function useWorkspaceCommandsAdmin() {
  const [customSlashCommands, setCustomSlashCommands] = useState<WorkspaceSlashCommandDefinition[]>([]);
  const [activeSlashCommandId, setActiveSlashCommandId] = useState("");
  const [commandSearch, setCommandSearch] = useState("");
  const [commandDraft, setCommandDraft] = useState<WorkspaceSlashCommandDraftInput>(EMPTY_WORKSPACE_SLASH_COMMAND_DRAFT);
  const [editingCommandId, setEditingCommandId] = useState<string | null>(null);
  const [commandEditorOpen, setCommandEditorOpen] = useState(false);
  const [commandLoading, setCommandLoading] = useState(false);
  const [commandSaving, setCommandSaving] = useState(false);
  const [commandNotice, setCommandNotice] = useState("");
  const [commandError, setCommandError] = useState("");
  const commandLoadSeqRef = useRef(0);

  const slashCommands = useMemo(
    () => [...WORKSPACE_BUILTIN_SLASH_COMMANDS, ...customSlashCommands],
    [customSlashCommands],
  );
  const activeSlashCommand: WorkspaceActiveSlashCommand = useMemo(
    () => toWorkspaceActiveSlashCommand(slashCommands.find((item) => item.id === activeSlashCommandId) ?? null),
    [activeSlashCommandId, slashCommands],
  );

  const clearCommandStatus = useCallback(() => {
    setCommandNotice("");
    setCommandError("");
  }, []);

  const refreshSlashCommands = useCallback(async (_options?: { showLoading?: boolean }) => {
    const showLoading = _options?.showLoading ?? false;
    const requestId = commandLoadSeqRef.current + 1;
    commandLoadSeqRef.current = requestId;

    if (showLoading) {
      setCommandLoading(true);
    }

    try {
      const records = await invoke<WorkspaceSlashCommandRecord[]>("load_custom_slash_commands");
      if (commandLoadSeqRef.current !== requestId) {
        return;
      }

      setCustomSlashCommands(records.map((item) => mapWorkspaceSlashCommandRecord(item)));
      setCommandError("");
    } catch (commandLoadError) {
      if (commandLoadSeqRef.current !== requestId) {
        return;
      }
      setCommandError(commandLoadError instanceof Error ? commandLoadError.message : "读取 Slash Commands 失败");
    } finally {
      if (showLoading && commandLoadSeqRef.current === requestId) {
        setCommandLoading(false);
      }
    }
  }, []);

  const openCommandsModal = useCallback(() => {
    clearCommandStatus();
    void refreshSlashCommands({ showLoading: true });
  }, [clearCommandStatus, refreshSlashCommands]);

  const closeCommandsModal = useCallback(() => {
    commandLoadSeqRef.current += 1;
    setCommandSearch("");
    setEditingCommandId(null);
    setCommandDraft(EMPTY_WORKSPACE_SLASH_COMMAND_DRAFT);
    setCommandEditorOpen(false);
    setCommandLoading(false);
    setCommandSaving(false);
    clearCommandStatus();
  }, [clearCommandStatus]);

  const persistSlashCommands = useCallback(
    async (
      nextCommands: WorkspaceSlashCommandDefinition[],
      successMessage: string,
    ) => {
      clearCommandStatus();
      setCommandSaving(true);

      try {
        const records = nextCommands
          .filter((item) => item.source === "custom")
          .map<WorkspaceSlashCommandRecord>(({ id, command, name, description, instruction }) => ({
            id,
            command,
            name,
            description,
            instruction,
          }));
        const savedRecords = await invoke<WorkspaceSlashCommandRecord[]>("save_custom_slash_commands", {
          commands: records,
        });
        const savedCommands = savedRecords.map((item) => mapWorkspaceSlashCommandRecord(item));
        setCustomSlashCommands(savedCommands);
        setCommandNotice(successMessage);
        return savedCommands;
      } catch (commandSaveError) {
        setCommandError(commandSaveError instanceof Error ? commandSaveError.message : "保存 Slash Commands 失败");
        return null;
      } finally {
        setCommandSaving(false);
      }
    },
    [clearCommandStatus],
  );

  const handleActivateSlashCommand = useCallback((commandId: string) => {
    setActiveSlashCommandId(commandId);
  }, []);

  const handleStartCreateSlashCommand = useCallback(() => {
    clearCommandStatus();
    setEditingCommandId(null);
    setCommandDraft(EMPTY_WORKSPACE_SLASH_COMMAND_DRAFT);
    setCommandEditorOpen(true);
  }, [clearCommandStatus]);

  const handleStartEditSlashCommand = useCallback((commandId: string) => {
    const target = customSlashCommands.find((item) => item.id === commandId);
    if (!target) {
      return;
    }
    clearCommandStatus();
    setEditingCommandId(commandId);
    setCommandDraft({
      name: target.name,
      description: target.description,
      instruction: target.instruction,
    });
    setCommandEditorOpen(true);
  }, [clearCommandStatus, customSlashCommands]);

  const handleCancelSlashCommandEdit = useCallback(() => {
    clearCommandStatus();
    setEditingCommandId(null);
    setCommandDraft(EMPTY_WORKSPACE_SLASH_COMMAND_DRAFT);
    setCommandEditorOpen(false);
  }, [clearCommandStatus]);

  const handleDeleteSlashCommand = useCallback(async (commandId: string) => {
    const target = customSlashCommands.find((item) => item.id === commandId);
    if (!target) {
      return;
    }

    const savedCommands = await persistSlashCommands(
      customSlashCommands.filter((item) => item.id !== commandId),
      `已删除命令：${target.name}`,
    );
    if (!savedCommands) {
      return;
    }

    if (activeSlashCommandId === commandId) {
      setActiveSlashCommandId("");
    }
    if (editingCommandId === commandId) {
      setEditingCommandId(null);
      setCommandDraft(EMPTY_WORKSPACE_SLASH_COMMAND_DRAFT);
      setCommandEditorOpen(false);
    }
  }, [activeSlashCommandId, customSlashCommands, editingCommandId, persistSlashCommands]);

  const handleSaveSlashCommandDraft = useCallback(async () => {
    const name = commandDraft.name.trim();
    const description = commandDraft.description.trim();
    const instruction = commandDraft.instruction.trim();

    if (!name) {
      setCommandError("请填写命令名称");
      return;
    }

    if (!instruction) {
      setCommandError("请填写命令指令内容");
      return;
    }

    const record = mapWorkspaceSlashCommandRecord({
      id: editingCommandId || createWorkspaceSlashCommandId(),
      command: createUniqueWorkspaceSlashCommandValue({
        name,
        existingCommands: slashCommands,
        excludeId: editingCommandId,
      }),
      name,
      description,
      instruction,
    });
    const nextCommands = editingCommandId
      ? customSlashCommands.map((item) => (item.id === editingCommandId ? record : item))
      : [...customSlashCommands, record];
    const savedCommands = await persistSlashCommands(
      nextCommands,
      editingCommandId ? `已保存命令：${name}` : `已创建命令：${name}`,
    );

    if (!savedCommands) {
      return;
    }

    setEditingCommandId(null);
    setCommandDraft(EMPTY_WORKSPACE_SLASH_COMMAND_DRAFT);
    setCommandEditorOpen(false);
  }, [commandDraft, customSlashCommands, editingCommandId, persistSlashCommands, slashCommands]);

  useEffect(() => {
    if (!activeSlashCommandId) {
      return;
    }

    if (!slashCommands.some((item) => item.id === activeSlashCommandId)) {
      setActiveSlashCommandId("");
    }
  }, [activeSlashCommandId, slashCommands]);

  useEffect(() => {
    void refreshSlashCommands({ showLoading: true });
  }, [refreshSlashCommands]);

  return {
    customSlashCommands,
    activeSlashCommandId,
    activeSlashCommand,
    slashCommands,
    commandSearch,
    commandDraft,
    editingCommandId,
    commandEditorOpen,
    commandLoading,
    commandSaving,
    commandNotice,
    commandError,
    setCommandSearch,
    setCommandDraft,
    setEditingCommandId,
    setCommandNotice,
    setCommandError,
    clearCommandStatus,
    refreshSlashCommands,
    openCommandsModal,
    closeCommandsModal,
    persistSlashCommands,
    handleActivateSlashCommand,
    handleStartCreateSlashCommand,
    handleStartEditSlashCommand,
    handleCancelSlashCommandEdit,
    handleDeleteSlashCommand,
    handleSaveSlashCommandDraft,
  };
}
