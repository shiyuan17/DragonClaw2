import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

import { isGatewaySkillStatusResult } from "../../components/workspace-clone/workspaceCloneGateway";
import {
  buildSkillOptions,
  buildSkillSummaryItems,
  normalizeWorkspaceStringList,
} from "../../components/workspace-clone/workspaceCloneAgentResources";
import type {
  WorkspaceAgentSkillConfig,
  WorkspaceAgentSkillSaveResult,
  WorkspaceInstalledSkillInfo,
  WorkspaceSkillCategory,
  WorkspaceSkillOption,
} from "../../components/workspace-clone/workspaceCloneTypes";

interface UseWorkspaceSkillsAdminOptions {
  agentId: string | null;
  gatewayConnected?: boolean;
  requestSkillStatus?: (agentId: string) => Promise<unknown>;
}

export function useWorkspaceSkillsAdmin({
  agentId,
  gatewayConnected = false,
  requestSkillStatus,
}: UseWorkspaceSkillsAdminOptions) {
  const [showSkillsModal, setShowSkillsModal] = useState(false);
  const [skillOptions, setSkillOptions] = useState<WorkspaceSkillOption[]>([]);
  const [skillSearch, setSkillSearch] = useState("");
  const [skillCategory, setSkillCategory] = useState<WorkspaceSkillCategory>("builtIn");
  const [skillDraftIds, setSkillDraftIds] = useState<string[]>([]);
  const [skillLoading, setSkillLoading] = useState(false);
  const [skillSaving, setSkillSaving] = useState(false);
  const [skillNotice, setSkillNotice] = useState("");
  const [skillError, setSkillError] = useState("");
  const currentAgentIdRef = useRef<string | null>(null);
  const skillLoadSeqRef = useRef(0);

  useEffect(() => {
    currentAgentIdRef.current = agentId;
  }, [agentId]);

  const clearSkillStatus = useCallback(() => {
    setSkillNotice("");
    setSkillError("");
  }, []);

  useEffect(() => {
    setSkillSearch("");
    setSkillCategory("builtIn");
    clearSkillStatus();
  }, [agentId, clearSkillStatus]);

  const selectedSkillOptions = useMemo(
    () => skillOptions.map((item) => ({
      ...item,
      selected: skillDraftIds.includes(item.id),
    })),
    [skillDraftIds, skillOptions],
  );

  const skillResourceItems = useMemo(
    () => buildSkillSummaryItems(selectedSkillOptions),
    [selectedSkillOptions],
  );

  const refreshSkillOptions = useCallback(async (options?: { showLoading?: boolean }) => {
    const showLoading = options?.showLoading ?? false;
    if (!agentId) {
      setSkillOptions([]);
      setSkillDraftIds([]);
      return;
    }

    if (showLoading) {
      setSkillLoading(true);
    }

    const targetAgentId = agentId;
    const requestId = skillLoadSeqRef.current + 1;
    skillLoadSeqRef.current = requestId;

    try {
      const savedConfig = await invoke<WorkspaceAgentSkillConfig>("get_agent_skill_config", {
        agentId: targetAgentId,
      });
      if (skillLoadSeqRef.current !== requestId || currentAgentIdRef.current !== targetAgentId) {
        return;
      }

      let nextOptions: WorkspaceSkillOption[] = [];
      if (gatewayConnected && requestSkillStatus) {
        const report = await requestSkillStatus(targetAgentId);
        if (skillLoadSeqRef.current !== requestId || currentAgentIdRef.current !== targetAgentId) {
          return;
        }
        if (!isGatewaySkillStatusResult(report)) {
          throw new Error("skills.status 返回格式不正确");
        }
        const installedSkills = await invoke<WorkspaceInstalledSkillInfo[]>("list_skills").catch(() => []);
        if (skillLoadSeqRef.current !== requestId || currentAgentIdRef.current !== targetAgentId) {
          return;
        }
        nextOptions = buildSkillOptions({
          selectedSkillNames: savedConfig.selectedSkillNames,
          statusEntries: report.skills,
          installedSkills,
        });
      } else {
        const installedSkills = await invoke<WorkspaceInstalledSkillInfo[]>("list_skills");
        if (skillLoadSeqRef.current !== requestId || currentAgentIdRef.current !== targetAgentId) {
          return;
        }
        nextOptions = buildSkillOptions({
          selectedSkillNames: savedConfig.selectedSkillNames,
          installedSkills,
        });
      }

      setSkillOptions(nextOptions);
      setSkillDraftIds(nextOptions.filter((item) => item.selected).map((item) => item.id));
      setSkillError("");
    } catch (skillLoadError) {
      if (skillLoadSeqRef.current !== requestId || currentAgentIdRef.current !== targetAgentId) {
        return;
      }
      setSkillError(skillLoadError instanceof Error ? skillLoadError.message : "读取技能配置失败");
      setSkillOptions((current) =>
        current.length > 0
          ? current
          : [
              {
                id: "pending",
                title: "技能配置",
                description: "未能读取真实技能配置，请稍后刷新。",
                tag: "Error",
                category: "builtIn",
                selected: false,
              },
            ],
      );
      setSkillDraftIds((current) => current);
    } finally {
      if (showLoading && skillLoadSeqRef.current === requestId && currentAgentIdRef.current === targetAgentId) {
        setSkillLoading(false);
      }
    }
  }, [agentId, gatewayConnected, requestSkillStatus]);

  const openSkillsModal = useCallback(() => {
    setShowSkillsModal(true);
    clearSkillStatus();
    void refreshSkillOptions({ showLoading: true });
  }, [clearSkillStatus, refreshSkillOptions]);

  const closeSkillsModal = useCallback(() => {
    skillLoadSeqRef.current += 1;
    setShowSkillsModal(false);
    setSkillSearch("");
    setSkillLoading(false);
    setSkillSaving(false);
    clearSkillStatus();
  }, [clearSkillStatus]);

  const handleToggleSkill = useCallback((skillId: string) => {
    setSkillDraftIds((current) =>
      current.includes(skillId)
        ? current.filter((item) => item !== skillId)
        : [...current, skillId],
    );
  }, []);

  const handleSelectAllSkills = useCallback(() => {
    setSkillDraftIds(skillOptions.map((item) => item.id));
  }, [skillOptions]);

  const handleClearSkills = useCallback(() => {
    setSkillDraftIds([]);
  }, []);

  const handleSaveSkills = useCallback(async () => {
    if (!agentId) {
      setSkillError("当前未选中 Agent");
      return;
    }

    clearSkillStatus();
    setSkillSaving(true);

    try {
      const result = await invoke<WorkspaceAgentSkillSaveResult>("save_agent_skill_config", {
        agentId,
        skillNames: normalizeWorkspaceStringList(skillDraftIds),
      });
      setSkillNotice(
        result.appliesOnNextMessage
          ? "技能配置已保存，下一条消息会按新配置生效。"
          : "技能配置已保存。",
      );
      await refreshSkillOptions();
    } catch (saveError) {
      setSkillError(saveError instanceof Error ? saveError.message : "保存技能配置失败");
    } finally {
      setSkillSaving(false);
    }
  }, [agentId, clearSkillStatus, refreshSkillOptions, skillDraftIds]);

  return {
    showSkillsModal,
    skillOptions,
    selectedSkillOptions,
    skillResourceItems,
    skillSearch,
    skillCategory,
    skillDraftIds,
    skillLoading,
    skillSaving,
    skillNotice,
    skillError,
    setSkillSearch,
    setSkillCategory,
    setSkillDraftIds,
    setSkillNotice,
    setSkillError,
    clearSkillStatus,
    refreshSkillOptions,
    openSkillsModal,
    closeSkillsModal,
    handleToggleSkill,
    handleSelectAllSkills,
    handleClearSkills,
    handleSaveSkills,
  };
}
