import { WorkspaceCloneIcon, type WorkspaceCloneIconName } from "./workspaceCloneIcons";

type ProductLandingTone = "ocean" | "violet" | "indigo" | "emerald" | "amber" | "rose" | "coral" | "teal";

type ProductLandingCard = {
  id: string;
  title: string;
  description: string;
  icon: WorkspaceCloneIconName;
  tone: ProductLandingTone;
  highlights: string[];
};

const HERO_CHIPS = ["内容交付", "社媒素材", "站点与应用", "前端规划入口"];

const PRODUCT_LANDING_CARDS: ProductLandingCard[] = [
  {
    id: "standalone-site",
    title: "独立站制作",
    description: "搭建品牌官网与营销落地页，支持多语言内容展示、线索收集和交付页搭建。",
    icon: "globe",
    tone: "ocean",
    highlights: ["品牌官网", "营销落地页", "线索收集"],
  },
  {
    id: "picture-book",
    title: "绘本制作",
    description: "从故事脚本到分镜插画，快速整理出适合发布的数字绘本和视觉叙事内容。",
    icon: "book-open",
    tone: "violet",
    highlights: ["故事脚本", "分镜插画", "数字出版"],
  },
  {
    id: "presentation",
    title: "PPT 制作",
    description: "自动整理内容结构并生成演示稿，适配路演、汇报、提案等高频展示场景。",
    icon: "layout-dashboard",
    tone: "indigo",
    highlights: ["路演提案", "结构整理", "演示输出"],
  },
  {
    id: "mini-program",
    title: "小程序制作",
    description: "覆盖需求拆解、页面结构和交互入口设计，帮助更快进入小程序交付节奏。",
    icon: "panel",
    tone: "emerald",
    highlights: ["需求拆解", "页面设计", "交互入口"],
  },
  {
    id: "game",
    title: "游戏原型",
    description: "把玩法构思、世界观设定和轻量原型组织成可测试的首版体验与演示资产。",
    icon: "wand",
    tone: "amber",
    highlights: ["玩法设定", "原型验证", "测试版本"],
  },
  {
    id: "video-generation",
    title: "短视频生成",
    description: "围绕脚本、镜头和素材清单整理批量化短视频方案，适配内容分发与投放。",
    icon: "voice",
    tone: "rose",
    highlights: ["脚本分镜", "素材编排", "分发投放"],
  },
  {
    id: "xiaohongshu-image-post",
    title: "小红书图文",
    description: "围绕选题生成封面、标题和正文结构，提升种草内容的产出效率与统一性。",
    icon: "palette",
    tone: "coral",
    highlights: ["封面生成", "标题优化", "种草发布"],
  },
  {
    id: "wechat-official-article",
    title: "公众号文章",
    description: "按品牌语气组织长文结构，补齐摘要、小标题和配图建议，方便进入公众号交付。",
    icon: "notebook",
    tone: "teal",
    highlights: ["长文结构", "摘要小标题", "配图建议"],
  },
];

const PRODUCT_LANDING_STEPS = [
  "先明确交付物类型，判断是站点、内容、社媒还是应用类输出。",
  "再补齐目标受众、输入素材、交付格式和验收节点，让卡片能落到执行计划。",
  "最后把真实能力按模块接入聊天、任务或技能市场，而不是在一个入口里一次性做完。",
];

const PRODUCT_LANDING_NOTES = [
  "主卡片已同步 DragonClaw 原版产品落地页的 8 个交付方向。",
  "本轮重点是优化排版、层级和信息密度，不直接接通真实执行流。",
  "后续若要落地单项能力，应继续拆分到聊天、任务或专属页面中逐步接入。",
];

export function WorkspaceCloneProductLandingView() {
  return (
    <section className="workspace-product-landing" aria-label="产品落地">
      <div className="workspace-product-landing__hero">
        <div className="workspace-product-landing__hero-copy">
          <span className="workspace-product-landing__eyebrow">产品落地</span>
          <h1>把常见交付类型整理成更像正式入口的产品工作台</h1>
          <p>
            这里同步了 DragonClaw 原版产品落地页中的核心交付项，并把页面重组为更清晰的概览、矩阵和说明结构。
            当前先提供可浏览、可规划的前端骨架，后续再按模块逐步接入真实能力。
          </p>

          <div className="workspace-product-landing__hero-chip-row" aria-label="产品落地覆盖范围">
            {HERO_CHIPS.map((item) => (
              <span key={item} className="workspace-product-landing__hero-chip">
                {item}
              </span>
            ))}
          </div>
        </div>

        <div className="workspace-product-landing__hero-stats" aria-label="产品落地概览">
          <div className="workspace-product-landing__stat">
            <span>交付方向</span>
            <strong>{String(PRODUCT_LANDING_CARDS.length).padStart(2, "0")}</strong>
          </div>
          <div className="workspace-product-landing__stat">
            <span>同步来源</span>
            <strong>DragonClaw 原版卡片</strong>
          </div>
          <div className="workspace-product-landing__stat">
            <span>当前状态</span>
            <strong>前端规划入口，后续逐步接入</strong>
          </div>
        </div>
      </div>

      <div className="workspace-product-landing__layout">
        <div className="workspace-product-landing__sections">
          <section className="workspace-product-landing__panel workspace-product-landing__panel--section-intro">
            <div className="workspace-product-landing__panel-head">
              <span className="workspace-product-landing__panel-kicker">同步自 DragonClaw</span>
              <h2>常见产品交付项</h2>
              <p>从站点、内容到社媒与应用原型，先把高频交付方向组织成稳定可读的入口卡片。</p>
            </div>
          </section>

          {PRODUCT_LANDING_CARDS.map((card) => (
            <article key={card.id} className="workspace-product-landing__card" data-tone={card.tone}>
              <div className="workspace-product-landing__card-head">
                <span className="workspace-product-landing__card-icon" aria-hidden="true">
                  <WorkspaceCloneIcon name={card.icon} size={20} strokeWidth={1.9} />
                </span>
                <div className="workspace-product-landing__card-copy">
                  <h2>{card.title}</h2>
                  <p>{card.description}</p>
                </div>
              </div>

              <div className="workspace-product-landing__chip-row" aria-label={`${card.title} 覆盖方向`}>
                {card.highlights.map((highlight) => (
                  <span key={highlight} className="workspace-product-landing__chip">
                    {highlight}
                  </span>
                ))}
              </div>
            </article>
          ))}
        </div>

        <aside className="workspace-product-landing__sidebar">
          <section className="workspace-product-landing__panel">
            <div className="workspace-product-landing__panel-head">
              <span className="workspace-product-landing__panel-kicker">推荐推进方式</span>
              <h2>先定交付，再接能力</h2>
              <p>把“做什么”说清楚，比一开始就接复杂流程更重要。</p>
            </div>
            <ol className="workspace-product-landing__step-list">
              {PRODUCT_LANDING_STEPS.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          </section>

          <section className="workspace-product-landing__panel workspace-product-landing__panel--muted">
            <div className="workspace-product-landing__panel-head">
              <span className="workspace-product-landing__panel-kicker">本轮同步内容</span>
              <h2>页面先像正式入口</h2>
              <p>先把信息架构做完整，再决定哪些模块需要真接入。</p>
            </div>
            <ul className="workspace-product-landing__note-list">
              {PRODUCT_LANDING_NOTES.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>
        </aside>
      </div>
    </section>
  );
}
