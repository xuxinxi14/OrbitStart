import type { OrbitPlugin, OrbitPluginContext } from "./orbitstart-plugin-api";

let commandDisposers = [];

async function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForCondition(ctx, cond) {
  const type = cond.type;
  const val = cond.value;
  const timeoutMs = cond.timeoutMs || 30000;
  const start = Date.now();

  ctx.ui.toast(`等待条件：${type} -> ${val} (超时：${timeoutMs / 1000}秒)...`);

  while (Date.now() - start < timeoutMs) {
    let met = false;
    try {
      if (type === "time") {
        const ms = parseInt(val) || 0;
        await delay(ms);
        return true;
      } else if (type === "process") {
        met = await ctx.launcher.checkProcessRunning(val);
      } else if (type === "port") {
        met = await ctx.launcher.checkPortOpen(val);
      } else if (type === "path") {
        met = await ctx.launcher.checkPathExists(val);
      } else if (type === "url") {
        met = await ctx.launcher.checkUrlAccessible(val);
      }
    } catch (e) {
      // Keep polling on error
    }

    if (met) {
      return true;
    }
    await delay(1000);
  }

  return false;
}

async function restoreWindowPositionBackground(ctx, title, windowLayout) {
  if (!windowLayout) return;
  const start = Date.now();
  const maxWait = 10000;
  
  while (Date.now() - start < maxWait) {
    try {
      const success = await ctx.launcher.applyWindowLayout(windowLayout);
      if (success) {
        ctx.ui.toast(`[窗口] 成功恢复「${title}」窗口位置`);
        return;
      }
    } catch (err) {
      // Continue polling
    }
    await delay(500);
  }
}

async function runWorkspace(ctx, workspaceId) {
  const startTime = Date.now();
  let successSteps = 0;
  let failedSteps = 0;
  const errors = [];
  
  try {
    const workspaces = (await ctx.storage.get("workspaces")) || [];
    const workspace = workspaces.find((ws) => ws.id === workspaceId);
    if (!workspace) {
      ctx.ui.toast(`未找到工作区：${workspaceId}`);
      return;
    }

    const allSteps = (await ctx.storage.get("steps")) || [];
    const steps = allSteps
      .filter((step) => step.workspaceId === workspaceId && step.enabled)
      .sort((a, b) => a.order - b.order);

    ctx.ui.toast(`正在启动工作区「${workspace.name}」...`);
    
    await ctx.storage.set("active_launch", {
      workspaceId,
      workspaceName: workspace.name,
      totalSteps: steps.length,
      currentStepIndex: 0,
      currentStepTitle: "初始化中...",
      status: "running"
    });

    const stepStatuses = {};
    let currentIdx = 0;

    for (const step of steps) {
      if (step.dependsOn && step.dependsOn.length > 0) {
        const met = step.dependsOn.every((depId) => stepStatuses[depId] === true);
        if (!met) {
          stepStatuses[step.id] = "skipped";
          failedSteps++;
          errors.push({ stepTitle: step.title, errorMsg: "依赖步骤未满足，跳过步骤" });
          ctx.ui.toast(`依赖未满足，跳过步骤「${step.title}」`);
          currentIdx++;
          continue;
        }
      }

      await ctx.storage.set("active_launch", {
        workspaceId,
        workspaceName: workspace.name,
        totalSteps: steps.length,
        currentStepIndex: currentIdx,
        currentStepTitle: step.delayMs ? `延迟中: ${step.title}` : `启动中: ${step.title}`,
        status: "running"
      });

      if (step.delayMs && step.delayMs > 0) {
        ctx.ui.toast(`等待延迟 ${step.delayMs / 1000} 秒...`);
        await delay(step.delayMs);
      }

      if (step.type === "wait" || step.waitCondition) {
        const cond = step.waitCondition || { type: "time", value: String(step.delayMs || 0) };
        const ok = await waitForCondition(ctx, cond);
        if (!ok) {
          stepStatuses[step.id] = false;
          failedSteps++;
          errors.push({ stepTitle: step.title, errorMsg: `等待条件超时: ${cond.type} -> ${cond.value}` });
          ctx.ui.toast(`等待超时：${step.title}`);
          if (step.failurePolicy === "stop") {
            ctx.ui.toast(`启动中止：步骤「${step.title}」等待超时。`);
            break;
          }
          currentIdx++;
          continue;
        }
      }

      let success = false;
      let alreadyRunning = false;

      if (step.windowLayout && workspace.preventDuplicate !== false) {
        try {
          const applied = await ctx.launcher.applyWindowLayout(step.windowLayout);
          if (applied) {
            success = true;
            alreadyRunning = true;
            ctx.ui.toast(`[窗口] 检测到「${step.title}」已在运行，已直接移动到指定位置`);
          }
        } catch (e) {
          // Ignore and launch
        }
      }

      if (!alreadyRunning) {
        try {
          if (step.type === "script") {
            const cfg = step.scriptConfig || { type: "bat", content: "", useFile: false };
            success = await ctx.launcher.runScript(
              cfg.type,
              cfg.useFile ? cfg.filePath : null,
              cfg.useFile ? null : cfg.content
            );
          } else if (step.itemId) {
            if (step.arguments || step.workingDirectory) {
              success = await ctx.launcher.launchTarget(step.target, step.arguments, step.workingDirectory);
            } else {
              success = await ctx.launcher.launchItem(step.itemId);
            }
          } else if (step.target) {
            success = await ctx.launcher.launchTarget(step.target, step.arguments, step.workingDirectory);
          } else {
            success = true;
          }
        } catch (err) {
          errors.push({ stepTitle: step.title, errorMsg: String(err) });
        }
      }

      if (success) {
        stepStatuses[step.id] = true;
        successSteps++;
        if (step.windowLayout && !alreadyRunning) {
          restoreWindowPositionBackground(ctx, step.title, step.windowLayout);
        }
      } else {
        stepStatuses[step.id] = false;
        failedSteps++;
        if (errors.filter((e) => e.stepTitle === step.title).length === 0) {
          errors.push({ stepTitle: step.title, errorMsg: "启动失败" });
        }
        ctx.ui.toast(`启动失败：${step.title}`);
        if (step.failurePolicy === "stop") {
          ctx.ui.toast(`启动被中止：步骤「${step.title}」执行失败。`);
          break;
        }
      }
      currentIdx++;
    }

    await ctx.storage.set("active_launch", {
      status: "done"
    });

    const updatedWorkspaces = workspaces.map((ws) => {
      if (ws.id === workspaceId) {
        return {
          ...ws,
          launchCount: (ws.launchCount || 0) + 1,
          lastLaunchedAt: new Date().toISOString(),
        };
      }
      return ws;
    });
    await ctx.storage.set("workspaces", updatedWorkspaces);

    const durationMs = Date.now() - startTime;
    const log = {
      id: "log_" + Math.random().toString(36).substr(2, 9),
      workspaceId,
      workspaceName: workspace.name,
      launchedAt: new Date().toISOString(),
      totalSteps: steps.length,
      successSteps,
      failedSteps,
      durationMs,
      status: failedSteps === 0 ? "success" : (successSteps > 0 ? "partial" : "failed"),
      errors
    };
    
    const existingLogs = (await ctx.storage.get("logs")) || [];
    await ctx.storage.set("logs", [log, ...existingLogs].slice(0, 100));

    ctx.ui.toast(`工作区「${workspace.name}」启动完成！`);
  } catch (error) {
    ctx.ui.toast(`启动工作区失败：${String(error)}`);
    await ctx.storage.set("active_launch", {
      status: "done"
    });
  }
}

async function registerWorkspaceCommands(ctx) {
  // Dispose previous workspace commands
  for (const dispose of commandDisposers) {
    try {
      dispose();
    } catch (e) {
      // Ignore
    }
  }
  commandDisposers = [];

  const workspaces = (await ctx.storage.get("workspaces")) || [];
  for (const ws of workspaces) {
    if (!ws.enabled) continue;
    const dispose = ctx.commands.registerCommand({
      id: `run-workspace-${sanitizeCommandId(ws.id)}`,
      title: `启动工作区：${ws.name}`,
      subtitle: ws.description || "一键启动工作区环境",
      icon: ws.icon || "Briefcase",
      keywords: ["workspace", "工作区", ws.name],
      run: () => {
        runWorkspace(ctx, ws.id);
      },
    });
    commandDisposers.push(dispose);
  }
}

// Helper to sanitize workspace ID to be a valid Command ID
function sanitizeCommandId(id) {
  return id.replace(/[^a-zA-Z0-9_\-\.]/g, "_");
}

class WorkspacesPlugin {
  constructor() {
    this.searchProviderDisposer = null;
    this.reloadCommandDisposer = null;
  }

  async activate(ctx) {
    // 1. Register workspaces reload command (so the UI can trigger command list update)
    this.reloadCommandDisposer = ctx.commands.registerCommand({
      id: "reload",
      title: "重新加载工作区配置",
      subtitle: "从存储载入最新的工作区启动项",
      icon: "RefreshCw",
      keywords: ["reload", "refresh", "sync", "同步"],
      run: async () => {
        await registerWorkspaceCommands(ctx);
        ctx.ui.toast("工作区启动命令已同步");
      },
    });

    // 2. Register initial workspace commands
    await registerWorkspaceCommands(ctx);

    // 3. Register Command Bar Search Provider
    this.searchProviderDisposer = ctx.search.registerProvider(
      "search-workspaces",
      async (query) => {
        const queryLower = query.toLowerCase().trim();
        if (!queryLower) return [];

        const workspaces = (await ctx.storage.get("workspaces")) || [];
        return workspaces
          .filter((ws) => ws.enabled && ws.name.toLowerCase().includes(queryLower))
          .map((ws) => ({
            id: `workspace-${ws.id}`,
            title: `启动工作区：${ws.name}`,
            subtitle: ws.description || "一键启动工作区环境",
            icon: ws.icon || "Briefcase",
            source: "workspaces",
            actionLabel: "启动工作区",
            run: () => {
              runWorkspace(ctx, ws.id);
            },
          }));
      }
    );
  }

  deactivate() {
    for (const dispose of commandDisposers) {
      try {
        dispose();
      } catch (e) {
        // Ignore
      }
    }
    commandDisposers = [];

    if (this.searchProviderDisposer) {
      try {
        this.searchProviderDisposer();
      } catch (e) {
        // Ignore
      }
      this.searchProviderDisposer = null;
    }

    if (this.reloadCommandDisposer) {
      try {
        this.reloadCommandDisposer();
      } catch (e) {
        // Ignore
      }
      this.reloadCommandDisposer = null;
    }
  }
}

const workspacesPlugin = new WorkspacesPlugin();
export default workspacesPlugin;
