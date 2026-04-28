import type { WorkspaceModelVendorPreset } from "./workspaceCloneTypes";

export const WORKSPACE_MODEL_VENDOR_PRESETS: WorkspaceModelVendorPreset[] = [
  {
    id: "tongyi-bailian",
    label: "通义百炼（千问）",
    displayName: "通义百炼（千问）",
    baseUrl: "https://coding.dashscope.aliyuncs.com/apps/anthropic",
    apiType: "anthropic-messages",
    modelOptions: [
      "Qwen3.5 Plus",
      "Qwen Max",
      "Qwen Plus",
      "Qwen Turbo",
      "Qwen3 Coder Plus",
      "MiniMax M2.5",
      "Kimi K2.5",
      "GLM-5",
      "GLM-4.7",
      "DeepSeek V3.2",
    ],
    defaultModel: "Qwen3.5 Plus",
  },
  {
    id: "zhipu-glm",
    label: "智谱AI(GLM国内)",
    displayName: "智谱AI(GLM国内)",
    baseUrl: "https://open.bigmodel.cn/api/anthropic",
    apiType: "anthropic-messages",
    modelOptions: ["GLM-5-Turbo", "GLM-5", "GLM-4.7", "GLM-4.6", "GLM-4.5-Air", "GLM-4.5"],
    defaultModel: "GLM-5-Turbo",
  },
  {
    id: "deepseek",
    label: "深度求索(DeepSeek)",
    displayName: "深度求索(DeepSeek)",
    baseUrl: "https://api.deepseek.com/v1",
    apiType: "openai-completions",
    modelOptions: ["DeepSeek Chat", "DeepSeek Reasoner"],
    defaultModel: "DeepSeek Chat",
  },
  {
    id: "moonshot-kimi",
    label: "Moonshot AI(Kimi国内)",
    displayName: "Moonshot AI(Kimi国内)",
    baseUrl: "https://api.moonshot.cn/anthropic",
    apiType: "openai-completions",
    modelOptions: ["Kimi K2 Thinking", "Kimi K2 Thinking Turbo", "Kimi K2.5", "Moonshot V1128K"],
    defaultModel: "Kimi K2 Thinking",
  },
  {
    id: "xiaomi-mimo",
    label: "小米 (Xiaomi MIMO)",
    displayName: "小米 (Xiaomi MIMO)",
    baseUrl: "https://api.xiaomimimo.com/anthropic",
    apiType: "openai-completions",
    modelOptions: ["Xiaomi Mimo-V2-Pro", "Xiaomi Mimo-V2-Omni", "Xiaomi Mimo-V2-Flash"],
    defaultModel: "Xiaomi Mimo-V2-Pro",
  },
  {
    id: "minimax-cn",
    label: "Minimax(国内)",
    displayName: "Minimax(国内)",
    baseUrl: "https://api.minimaxi.com/anthropic",
    apiType: "anthropic-messages",
    modelOptions: ["MiniMax M2.7", "MiniMax M2.5", "MiniMax M2.1", "MiniMax M2.1 Lightning", "MiniMax M2"],
    defaultModel: "MiniMax M2.7",
  },
  {
    id: "huoshan-doubao",
    label: "火山引擎(豆包)",
    displayName: "火山引擎(豆包)",
    baseUrl: "https://ark.cn-beijing.volces.com/api/coding",
    apiType: "anthropic-messages",
    modelOptions: [
      "Doubao Seed 2.0 Pro",
      "Doubao Seed 1.8",
      "GLM-4.7",
      "Doubao Seed Code Preview",
      "Doubao Seed 1.6 Lite",
      "Doubao Seed 1.6 Flash",
      "Doubao Seed 1.6 Vision",
    ],
    defaultModel: "Doubao Seed 2.0 Pro",
  },
  {
    id: "custom",
    label: "自定义",
    displayName: "自定义",
    baseUrl: "",
    apiType: "openai-completions",
    modelOptions: [],
    defaultModel: "",
  },
];

export const WORKSPACE_MODEL_VENDOR_PRESET_MAP = new Map(
  WORKSPACE_MODEL_VENDOR_PRESETS.map((item) => [item.id, item]),
);

export function getWorkspaceModelVendorPreset(id: string) {
  return WORKSPACE_MODEL_VENDOR_PRESET_MAP.get(id) ?? WORKSPACE_MODEL_VENDOR_PRESET_MAP.get("custom")!;
}
