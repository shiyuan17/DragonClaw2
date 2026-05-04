import { useCallback, useState } from "react";

import type { WorkspaceSkillCategory, WorkspaceSkillOption } from "../../components/workspace-clone/workspaceCloneTypes";

interface UseWorkspaceSkillsAdminOptions {
  agentId: string | null;
  gatewayConnected?: boolean;
  requestSkillStatus?: (agentId: string) => Promise<unknown>;
}

export function useWorkspaceSkillsAdmin(_options: UseWorkspaceSkillsAdminOptions) {
  const [showSkillsModal, setShowSkillsModal] = useState(false);
  const [skillOptions] = useState<WorkspaceSkillOption[]>([]);
  const [skillSearch, setSkillSearch] = useState("");
  const [skillCategory, setSkillCategory] = useState<WorkspaceSkillCategory>("builtIn");
  const [skillDraftIds, setSkillDraftIds] = useState<string[]>([]);
  const [skillLoading, setSkillLoading] = useState(false);
  const [skillSaving, setSkillSaving] = useState(false);
  const [skillNotice, setSkillNotice] = useState("");
  const [skillError, setSkillError] = useState("");

  const clearSkillStatus = useCallback(() => {
    setSkillNotice("");
    setSkillError("");
  }, []);

  const refreshSkillOptions = useCallback(async (_options?: { showLoading?: boolean }) => {
    return;
  }, []);

  const openSkillsModal = useCallback(() => {
    setShowSkillsModal(true);
    clearSkillStatus();
  }, [clearSkillStatus]);

  const closeSkillsModal = useCallback(() => {
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

  const handleSaveSkills = useCallback(async () => {
    return;
  }, []);

  return {
    showSkillsModal,
    skillOptions,
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
    handleSaveSkills,
  };
}
