import type { WorkspaceChannelId } from "../../types";
import channelDingtalkIcon from "../../assets/channels/dingtalk.svg";
import channelDiscordIcon from "../../assets/channels/discord.svg";
import channelFeishuIcon from "../../assets/channels/feishu.svg";
import channelQqIcon from "../../assets/channels/qq.svg";
import channelTelegramIcon from "../../assets/channels/telegram.svg";
import channelWhatsappIcon from "../../assets/channels/whatsapp.svg";
import channelWecomIcon from "../../assets/channels/wecom.svg";
import channelWeixinIcon from "../../assets/channels/weixin.svg";
import type { WorkspaceChannelCatalogEntry } from "./workspaceCloneTypes";

export const WORKSPACE_CHANNEL_CATALOG: WorkspaceChannelCatalogEntry[] = [
  {
    id: "weixin",
    name: "微信",
    description: "微信消息触达与机器人接入",
    icon: channelWeixinIcon,
    implemented: true,
  },
  {
    id: "feishu",
    name: "飞书",
    description: "飞书机器人与消息通知",
    icon: channelFeishuIcon,
    implemented: true,
  },
  {
    id: "wecom",
    name: "企业微信",
    description: "企业微信应用与群机器人",
    icon: channelWecomIcon,
    implemented: false,
  },
  {
    id: "dingtalk",
    name: "钉钉",
    description: "钉钉机器人与工作通知",
    icon: channelDingtalkIcon,
    implemented: false,
  },
  {
    id: "qq",
    name: "QQ",
    description: "QQ群机器人与私聊触达",
    icon: channelQqIcon,
    implemented: false,
  },
  {
    id: "telegram",
    name: "Telegram",
    description: "Bot API 多账号接入",
    icon: channelTelegramIcon,
    implemented: false,
  },
  {
    id: "whatsapp",
    name: "WhatsApp",
    description: "WhatsApp 消息收发与会话接入",
    icon: channelWhatsappIcon,
    implemented: false,
  },
  {
    id: "discord",
    name: "Discord",
    description: "Guild / Channel 事件联动",
    icon: channelDiscordIcon,
    implemented: false,
  },
];

export function resolveWorkspaceChannelName(channelId: WorkspaceChannelId | string) {
  return WORKSPACE_CHANNEL_CATALOG.find((item) => item.id === channelId)?.name || channelId;
}
