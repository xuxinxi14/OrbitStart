import { useState, useCallback } from "react";
import {
  X,
  Sparkles,
  ScanSearch,
  Bookmark,
  CheckCircle2,
  ChevronRight,
  ArrowRight,
  Zap,
  SkipForward
} from "lucide-react";
import {
  SCENARIO_TEMPLATES,
  type OnboardingState,
  type OnboardingStep,
  type ScenarioTag,
  type ScenarioGroup,
  DEFAULT_ONBOARDING_STATE,
  shouldShowOnboarding,
  completeOnboarding,
  skipOnboarding,
  selectTemplate,
  markShortcutScanDone,
  markBookmarkScanDone,
  areBothScansDone
} from "../lib/onboarding";

interface OnboardingWizardProps {
  /** Called when user selects a template and tags are created. Receives the new tags and groups. */
  onTemplateSelected: (tags: ScenarioTag[], groups: ScenarioGroup[]) => void;
  /** Called when user clicks "scan shortcuts" button. */
  onScanShortcuts: () => void | Promise<void>;
  /** Called when user clicks "scan bookmarks" button. */
  onScanBookmarks: () => void | Promise<void>;
  /** Called when onboarding is fully completed or skipped. */
  onComplete: () => void;
}

/**
 * OnboardingWizard — Multi-step first-launch wizard.
 *
 * Step flow:
 *   template-select → [user picks scenario] → tags-created → [scans] → done
 *
 * The wizard renders as a full-screen overlay with backdrop.
 * A "skip" button is always available in the top-right.
 */
export function OnboardingWizard({
  onTemplateSelected,
  onScanShortcuts,
  onScanBookmarks,
  onComplete
}: OnboardingWizardProps) {
  const [state, setState] = useState<OnboardingState>(DEFAULT_ONBOARDING_STATE);
  const [isTransitioning, setIsTransitioning] = useState(false);

  /** Navigate to next step with transition animation */
  const goToStep = useCallback((nextStep: OnboardingStep) => {
    setIsTransitioning(true);
    setTimeout(() => {
      setState((prev) => ({ ...prev, step: nextStep }));
      setIsTransitioning(false);
    }, 280);
  }, []);

  /** Handle template card selection */
  const handleSelectTemplate = useCallback((templateId: string) => {
    const result = selectTemplate(templateId);
    setState(result);
    onTemplateSelected(result.newTags, result.newGroups);
    goToStep("tags-created");
  }, [onTemplateSelected, goToStep]);

  /** Handle skip */
  const handleSkip = useCallback(() => {
    skipOnboarding();
    onComplete();
  }, [onComplete]);

  /** Handle scan shortcuts click */
  const handleScanShortcuts = useCallback(async () => {
    await onScanShortcuts();
    const updated = markShortcutScanDone();
    setState(updated);
    if (updated.completed) {
      setTimeout(() => onComplete(), 400);
    }
  }, [onScanShortcuts, onComplete]);

  /** Handle scan bookmarks click */
  const handleScanBookmarks = useCallback(async () => {
    await onScanBookmarks();
    const updated = markBookmarkScanDone();
    setState(updated);
    if (updated.completed) {
      setTimeout(() => onComplete(), 400);
    }
  }, [onScanBookmarks, onComplete]);

  /** Handle finish (both scans done) */
  const handleFinish = useCallback(() => {
    completeOnboarding();
    onComplete();
  }, [onComplete]);

  // ---- Render helpers ----

  const step = state.step;
  const bothDone = areBothScansDone(state);

  return (
    <section className="onboarding-backdrop" role="dialog" aria-modal="true">
      <div className={`onboarding-wizard ${isTransitioning ? "transitioning" : ""}`}>
        {/* Header — always visible */}
        <div className="onboarding-header">
          <div className="onboarding-brand">
            <Sparkles size={22} />
            <span>欢迎使用 OrbitStart</span>
          </div>
          <button type="button" className="onboarding-skip" onClick={handleSkip}>
            <SkipForward size={15} />
            跳过引导
          </button>
        </div>

        {/* Progress dots */}
        <div className="onboarding-progress">
          <span className={step === "template-select" ? "active" : state.selectedTemplateId ? "done" : ""} />
          <span className={(step === "tags-created" || bothDone) && state.selectedTemplateId ? "active" : state.selectedTemplateId ? "done" : ""} />
        </div>

        {/* ===== STEP 1: Template Selection ===== */}
        {step === "template-select" && (
          <div className="onboarding-step step-template-select">
            <h2>选择一个场景模板</h2>
            <p>第一次打开 OrbitStart 时，让我们帮你快速上手。选择最符合你使用场景的模板，系统将自动创建示例工作区。</p>

            <div className="template-grid">
              {SCENARIO_TEMPLATES.map((tpl) => (
                <button
                  type="button"
                  key={tpl.id}
                  className="template-card"
                  onClick={() => handleSelectTemplate(tpl.id)}
                  style={{ borderColor: `${tpl.accent}33`, background: "transparent" }}
                  data-tpl-accent={tpl.accent}
                >
                  <span className="template-icon" style={{ color: tpl.accent }}>
                    {/* Simple emoji/icon placeholder per category — using first letter + icon */}
                    {tpl.id === "student" && "🎓"}
                    {tpl.id === "editor" && "🎬"}
                    {tpl.id === "developer" && "💻"}
                    {tpl.id === "researcher" && "🔬"}
                    {tpl.id === "data-analyst" && "📊"}
                    {tpl.id === "general" && "✨"}
                  </span>
                  <div className="template-info">
                    <strong>{tpl.title}</strong>
                    <small>{tpl.subtitle}</small>
                  </div>
                  <span className="template-arrow"><ChevronRight size={16} /></span>
                </button>
              ))}
            </div>

            <p className="onboarding-hint">不知道选哪个？「我只是想整理电脑」适合大多数人</p>
          </div>
        )}

        {/* ===== STEP 2: Tags Created + Scans ===== */}
        {(step === "tags-created") && (
          <div className="onboarding-step step-tags-created">
            <div className="success-badge">
              <CheckCircle2 size={20} />
              <span>场景模板已应用</span>
            </div>

            <h2>接下来，让我们导入你的资源</h2>
            <p>OrbitStart 通过扫描本地程序和浏览器书签来建立你的资源库。建议两步都执行以获得最佳体验。</p>

            <div className="scan-steps">
              <button
                type="button"
                className={`scan-btn ${state.shortcutScanDone ? "done" : ""}`}
                onClick={handleScanShortcuts}
                disabled={state.shortcutScanDone}
              >
                <span className="scan-icon-wrap">
                  <ScanSearch size={22} />
                </span>
                <div className="scan-info">
                  <strong>{state.shortcutScanDone ? "已完成扫描" : "开始扫描本地程序"}</strong>
                  <small>从桌面和开始菜单导入快捷方式</small>
                </div>
                {state.shortcutScanDone && <CheckCircle2 className="check-icon" size={18} />}
              </button>

              <button
                type="button"
                className={`scan-btn ${state.bookmarkScanDone ? "done" : ""}`}
                onClick={handleScanBookmarks}
                disabled={state.bookmarkScanDone}
              >
                <span className="scan-icon-wrap">
                  <Bookmark size={22} />
                </span>
                <div className="scan-info">
                  <strong>{state.bookmarkScanDone ? "已完成扫描" : "开始扫描浏览器书签"}</strong>
                  <small>从 Edge / Chrome 导入书签</small>
                </div>
                {state.bookmarkScanDone && <CheckCircle2 className="check-icon" size={18} />}
              </button>
            </div>

            {bothDone && (
              <button type="button" className="primary-action finish-btn" onClick={handleFinish}>
                <Zap size={18} />
                开始使用 OrbitStart
                <ArrowRight size={16} />
              </button>
            )}

            {!bothDone && (
              <p className="onboarding-hint">完成上方两个步骤后即可进入主界面</p>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
