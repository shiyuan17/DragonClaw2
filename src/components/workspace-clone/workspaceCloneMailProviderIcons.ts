import gmailMailIcon from "../../../src-tauri/icons/mail/gmail-mail.png";
import otherMailIcon from "../../../src-tauri/icons/mail/other-mail.png";
import outlookMailIcon from "../../../src-tauri/icons/mail/outlook-mail.png";
import qqMailIcon from "../../../src-tauri/icons/mail/qq-mail.png";
import sohuMailIcon from "../../../src-tauri/icons/mail/sh-mail.png";
import neteaseMailIcon from "../../../src-tauri/icons/mail/wy-mail.png";
import sinaMailIcon from "../../../src-tauri/icons/mail/xinlang-mail.png";

const WORKSPACE_MAIL_PROVIDER_ICON_MAP: Record<string, string> = {
  qq: qqMailIcon,
  "163": neteaseMailIcon,
  gmail: gmailMailIcon,
  outlook: outlookMailIcon,
  sina: sinaMailIcon,
  sohu: sohuMailIcon,
  custom: otherMailIcon,
};

export function resolveWorkspaceMailProviderIcon(provider: string) {
  return WORKSPACE_MAIL_PROVIDER_ICON_MAP[provider] || otherMailIcon;
}
