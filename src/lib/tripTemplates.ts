import type { TripCategory } from "../types";

export interface TripTemplate {
  id: string;
  label: string;
  category: TripCategory;
  content: string;
}

export const tripTemplates: TripTemplate[] = [
  {
    id: "shortcut",
    label: "快捷键速查",
    category: "shortcut",
    content: "## 常用快捷键\n\n| 按键 | 功能 |\n|------|------|\n|  |  |\n"
  },
  {
    id: "workflow",
    label: "操作流程",
    category: "workflow",
    content: "## 步骤\n\n1. \n2. \n3. \n\n## 注意事项\n\n- \n"
  },
  {
    id: "reference",
    label: "参数说明",
    category: "reference",
    content: "## 参数\n\n| 参数 | 说明 | 默认值 |\n|------|------|--------|\n|  |  |  |\n"
  },
  {
    id: "status",
    label: "状态记录",
    category: "status",
    content: "## 当前状态\n\n\n## 下一步计划\n\n"
  },
  {
    id: "note",
    label: "自由笔记",
    category: "note",
    content: ""
  }
];

export const tripCategoryLabels: Record<TripCategory, string> = {
  shortcut: "快捷键",
  workflow: "流程",
  note: "笔记",
  status: "状态",
  reference: "参考"
};
