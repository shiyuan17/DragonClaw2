import { WorkspaceCloneIcon } from "./workspaceCloneIcons";

const PRODUCT_LANDING_SECTIONS = [
  {
    id: "automation",
    title: "自动化任务",
    description: "把周期巡检、日报周报、线索跟进和提醒动作沉淀成可复用的产品化流程。",
    icon: "calendar-clock" as const,
    highlights: ["日报/周报", "提醒跟进", "定时巡检"],
  },
  {
    id: "documents",
    title: "文件整理",
    description: "围绕文档归档、摘要提取、命名规范和资料沉淀建立一套标准化交付入口。",
    icon: "book-open" as const,
    highlights: ["文档归档", "关键信息提取", "命名规范"],
  },
  {
    id: "growth",
    title: "社媒运营",
    description: "把选题、监测、内容生成和发布协同拆成更清晰的产品工作面板。",
    icon: "message-circle" as const,
    highlights: ["内容选题", "舆情监测", "发布协同"],
  },
  {
    id: "lifestyle",
    title: "本地生活",
    description: "为预约、筛选、比价和到店前准备等动作预留统一的能力分区。",
    icon: "radio" as const,
    highlights: ["预约服务", "商品筛选", "路线准备"],
  },
  {
    id: "education",
    title: "教育学习",
    description: "把课程设计、知识总结、练习反馈和学习路径规划组织成可持续迭代的模块。",
    icon: "layout-dashboard" as const,
    highlights: ["学习规划", "课程设计", "反馈总结"],
  },
];

const PRODUCT_LANDING_STEPS = [
  "先选一个能力分区，明确要落地的是任务流、内容流还是服务流。",
  "再补齐目标用户、触发条件、输出格式和验收方式。",
  "最后把真实能力拆到聊天、任务或工具权限模块里逐步接入。",
];

const PRODUCT_LANDING_LIMITS = [
  "当前页是前端工作台骨架，不直接执行真实工作流。",
  "真实执行仍以聊天区、任务抽屉和已接入能力为准。",
  "后续会按模块逐步打通输入、执行、回传和结果沉淀。",
];

interface WorkspaceCloneProductLandingViewProps {
  workspaceModelName: string;
  running: boolean;
  uptimeLabel: string;
}

export function WorkspaceCloneProductLandingView({
  workspaceModelName,
  running,
  uptimeLabel,
}: WorkspaceCloneProductLandingViewProps) {
  return (
    <section className="workspace-product-landing" aria-label="产品落地">
      <div className="workspace-product-landing__hero">
        <div className="workspace-product-landing__hero-copy">
          <span className="workspace-product-landing__eyebrow">产品落地</span>
          <h1>把 DragonClaw 的能力拆成可逐步接入的产品工作台</h1>
          <p>
            这里先开放一个正式入口，用来沉淀各类落地场景的结构、节奏和边界。
            本轮先补前端骨架，后续再按模块逐步接入真实执行能力。
          </p>
        </div>

        <div className="workspace-product-landing__hero-stats" aria-label="产品落地概览">
          <div className="workspace-product-landing__stat">
            <span>能力分区</span>
            <strong>{PRODUCT_LANDING_SECTIONS.length}</strong>
          </div>
          <div className="workspace-product-landing__stat">
            <span>当前模型</span>
            <strong>{workspaceModelName}</strong>
          </div>
          <div className="workspace-product-landing__stat">
            <span>服务状态</span>
            <strong>{running ? `运行中 · ${uptimeLabel}` : "未启动"}</strong>
          </div>
        </div>
      </div>

      <div className="workspace-product-landing__layout">
        <div className="workspace-product-landing__sections">
          {PRODUCT_LANDING_SECTIONS.map((section) => (
            <article key={section.id} className="workspace-product-landing__card">
              <div className="workspace-product-landing__card-head">
                <span className="workspace-product-landing__card-icon" aria-hidden="true">
                  <WorkspaceCloneIcon name={section.icon} size={18} strokeWidth={1.9} />
                </span>
                <div className="workspace-product-landing__card-copy">
                  <h2>{section.title}</h2>
                  <p>{section.description}</p>
                </div>
              </div>

              <div className="workspace-product-landing__chip-row" aria-label={`${section.title} 示例方向`}>
                {section.highlights.map((highlight) => (
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
              <h2>先做结构，再接能力</h2>
            </div>
            <ol className="workspace-product-landing__step-list">
              {PRODUCT_LANDING_STEPS.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          </section>

          <section className="workspace-product-landing__panel workspace-product-landing__panel--muted">
            <div className="workspace-product-landing__panel-head">
              <span className="workspace-product-landing__panel-kicker">当前边界</span>
              <h2>本轮先开放入口</h2>
            </div>
            <ul className="workspace-product-landing__note-list">
              {PRODUCT_LANDING_LIMITS.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>
        </aside>
      </div>
    </section>
  );
}
