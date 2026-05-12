import { describe, expect, it } from "vitest";

import {
  buildCachedAgentsResult,
  parseCachedMessagesJson,
  sanitizeAgentsResult,
  serializeCachedMessages,
  sortSessionsByUpdatedAt,
  toAgentCachePayload,
} from "./session-cache";

describe("session-cache", () => {
  it("parses cached messages defensively", () => {
    expect(parseCachedMessagesJson("")).toEqual([]);
    expect(parseCachedMessagesJson("{bad json")).toEqual([]);
    expect(parseCachedMessagesJson('["one", {"two": 2}]')).toEqual(["one", { two: 2 }]);
  });

  it("serializes cached messages and falls back on stringify failure", () => {
    expect(serializeCachedMessages([{ id: 1 }])).toBe('[{"id":1}]');

    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(serializeCachedMessages([circular])).toBe("[]");
  });

  it("builds cached agent results while filtering legacy demo agents", () => {
    const result = buildCachedAgentsResult([
      {
        agentId: "ops",
        name: "运营协作 Agent",
        isDefault: true,
        scope: "workspace",
        identityJson: null,
        cachedAt: 1,
      },
      {
        agentId: "main",
        name: " Main Agent ",
        isDefault: true,
        scope: "workspace",
        identityJson: '{"emoji":"M"}',
        cachedAt: 2,
      },
      {
        agentId: "assistant",
        name: "Assistant",
        isDefault: false,
        scope: "workspace",
        identityJson: '{"name":"Assistant"}',
        cachedAt: 3,
      },
    ]);

    expect(result).toMatchObject({
      defaultId: "main",
      mainKey: "agent:main:main",
      scope: "workspace",
    });
    expect(result?.agents.map((agent) => agent.id)).toEqual(["main", "assistant"]);
    expect(result?.agents[0]?.identity).toEqual({ emoji: "M" });
  });

  it("returns null when every cached agent is filtered out", () => {
    const result = buildCachedAgentsResult([
      {
        agentId: "ops",
        name: "ops",
        isDefault: true,
        scope: "workspace",
        identityJson: null,
        cachedAt: 1,
      },
    ]);

    expect(result).toBeNull();
  });

  it("sanitizes agent results and cache payloads consistently", () => {
    const sanitized = sanitizeAgentsResult({
      defaultId: "ops",
      mainKey: "agent:ops:main",
      scope: "workspace",
      agents: [
        { id: "ops", name: "ops", identity: { name: "ops" } },
        { id: "assistant", name: "Assistant", identity: { emoji: "A" } },
      ],
    });

    expect(sanitized.defaultId).toBe("assistant");
    expect(sanitized.mainKey).toBe("agent:assistant:main");
    expect(sanitized.agents.map((agent) => agent.id)).toEqual(["assistant"]);

    expect(toAgentCachePayload(sanitized)).toEqual([
      {
        agentId: "assistant",
        name: "Assistant",
        identityJson: '{"emoji":"A"}',
      },
    ]);
  });

  it("sorts sessions by most recent update first", () => {
    const sessions = sortSessionsByUpdatedAt([
      { key: "older", kind: "direct", updatedAt: 10 },
      { key: "newest", kind: "direct", updatedAt: 30 },
      { key: "middle", kind: "direct", updatedAt: 20 },
    ]);

    expect(sessions.map((session) => session.key)).toEqual(["newest", "middle", "older"]);
  });
});
