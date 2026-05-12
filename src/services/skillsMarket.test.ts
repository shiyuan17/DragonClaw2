import { beforeEach, describe, expect, it, vi } from "vitest";

const skillMarketMocks = vi.hoisted(() => ({
  loadSkillMarketTop: vi.fn(),
  loadSkillMarketByCategory: vi.fn(),
}));

vi.mock("../api/skillMarket", () => ({
  loadSkillMarketTop: skillMarketMocks.loadSkillMarketTop,
  loadSkillMarketByCategory: skillMarketMocks.loadSkillMarketByCategory,
}));

import {
  fetchSkillTop50,
  fetchSkillsByCategory,
  fetchSkillsByKeyword,
} from "./skillsMarket";

describe("skillsMarket service", () => {
  beforeEach(() => {
    skillMarketMocks.loadSkillMarketTop.mockReset();
    skillMarketMocks.loadSkillMarketByCategory.mockReset();
  });

  it("normalizes top-skill responses and backfills defaults", async () => {
    skillMarketMocks.loadSkillMarketTop.mockResolvedValue({
      code: "0",
      data: {
        total: 1,
        skills: [
          {
            category: "developer-tools",
            description: "English",
            description_zh: "中文",
            downloads: "12",
            homepage: "https://example.com/skill",
            installs: 8,
            ownerName: "owner",
            score: "98.5",
            slug: "skill-one",
            stars: "10",
            tags: ["build", 123, "tests"],
            updated_at: "1710000000",
          },
          {
            slug: "skill-two",
          },
        ],
      },
    });

    const result = await fetchSkillTop50();

    expect(result.total).toBe(2);
    expect(result.skills[0]).toMatchObject({
      name: "Unknown Skill",
      downloads: 12,
      installs: 8,
      score: 98.5,
      stars: 10,
      updatedAt: 1710000000,
      tags: ["build", "tests"],
      version: "v1.0.0",
    });
    expect(result.skills[1]).toMatchObject({
      slug: "skill-two",
      name: "Unknown Skill",
      version: "v1.0.0",
    });
  });

  it("normalizes category and keyword requests before invoking the API", async () => {
    skillMarketMocks.loadSkillMarketByCategory.mockResolvedValue({
      code: 0,
      data: { total: 0, skills: [] },
    });

    await fetchSkillsByCategory("developer-tools", {
      page: 0,
      pageSize: 40.8,
    });
    expect(skillMarketMocks.loadSkillMarketByCategory).toHaveBeenNthCalledWith(1, {
      page: 1,
      pageSize: 40,
      sortBy: "score",
      order: "desc",
      category: "developer-tools",
    });

    await fetchSkillsByKeyword("  copilots  ", {
      page: Number.NaN,
      pageSize: undefined,
      sortBy: "downloads",
      order: "asc",
      category: "productivity",
    });
    expect(skillMarketMocks.loadSkillMarketByCategory).toHaveBeenNthCalledWith(2, {
      page: 1,
      pageSize: 80,
      sortBy: "downloads",
      order: "asc",
      category: "productivity",
      keyword: "copilots",
    });
  });

  it("throws when the market API returns a non-zero code", async () => {
    skillMarketMocks.loadSkillMarketTop.mockResolvedValue({
      code: 500,
      message: "backend unavailable",
      data: null,
    });

    await expect(fetchSkillTop50()).rejects.toThrow("backend unavailable");
  });
});
