import { describe, expect, it } from "vitest";

import {
  FEISHU_LINK_POLICY,
  WEIXIN_LINK_POLICY,
  buildCatalogEntityId,
  buildChannelEntityId,
  resolveAgentOptions,
  resolveChannelAvatarLabel,
  resolveChannelView,
  resolveModalAccountLabel,
  toMessage,
  validateExternalUrl,
} from "./workspaceChannelBindingShared";

describe("workspaceChannelBindingShared", () => {
  it("normalizes unknown errors into readable messages", () => {
    expect(toMessage(new Error("boom"), "fallback")).toBe("boom");
    expect(toMessage(" text ", "fallback")).toBe(" text ");
    expect(toMessage(null, "fallback")).toBe("fallback");
  });

  it("rejects empty, malformed, and non-whitelisted urls", () => {
    expect(validateExternalUrl("", WEIXIN_LINK_POLICY)).toEqual({
      ok: false,
      reason: "链接为空。",
    });
    expect(validateExternalUrl("not a url", WEIXIN_LINK_POLICY)).toEqual({
      ok: false,
      reason: "链接格式无效。",
    });

    const scheme = validateExternalUrl("ftp://weixin.qq.com/a", WEIXIN_LINK_POLICY);
    expect(scheme.ok).toBe(false);
    if (!scheme.ok) {
      expect(scheme.reason).toContain("ftp:");
    }

    const host = validateExternalUrl("https://evil.example.com", FEISHU_LINK_POLICY);
    expect(host.ok).toBe(false);
    if (!host.ok) {
      expect(host.reason).toContain("evil.example.com");
    }
  });

  it("allows localhost http only when policy permits and accepts approved suffixes", () => {
    expect(validateExternalUrl("http://127.0.0.1:1420", WEIXIN_LINK_POLICY)).toEqual({
      ok: true,
      url: new URL("http://127.0.0.1:1420"),
    });

    const feishuLocal = validateExternalUrl("http://127.0.0.1:1420", FEISHU_LINK_POLICY);
    expect(feishuLocal.ok).toBe(false);

    const weixinHost = validateExternalUrl("https://servicewechat.com/path", WEIXIN_LINK_POLICY);
    expect(weixinHost.ok).toBe(true);

    const feishuHost = validateExternalUrl("https://open.feishu.cn", FEISHU_LINK_POLICY);
    expect(feishuHost.ok).toBe(true);
  });

  it("resolves views, labels, and entity ids", () => {
    expect(resolveChannelView("feishu", "placeholder")).toBe("feishu");
    expect(resolveChannelView("weixin")).toBe("wechat");
    expect(resolveChannelView("other", "manual")).toBe("manual");
    expect(resolveModalAccountLabel("default")).toBe("主账号");
    expect(resolveModalAccountLabel(" custom ")).toBe("custom");
    expect(resolveChannelAvatarLabel(" DragonClaw ")).toBe("D");
    expect(buildChannelEntityId("weixin", "main")).toBe("channel:weixin:main");
    expect(buildCatalogEntityId("feishu")).toBe("catalog:feishu");
  });

  it("sorts agent options with default agents first", () => {
    const options = resolveAgentOptions([
      { name: "product", model: "gpt-4", has_sessions: false, is_default: false },
      { name: "main", model: "gpt-5", has_sessions: true, is_default: true },
      { name: "ops", model: "gpt-4.1", has_sessions: true, is_default: false },
    ]);

    expect(options[0]).toMatchObject({ id: "main", isDefault: true });
    expect(options.map((option) => option.id)).toEqual(["main", "ops", "product"]);
  });
});
