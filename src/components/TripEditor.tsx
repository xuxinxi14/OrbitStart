import { Eye, EyeOff, Pin, Save, X } from "lucide-react";
import { useState } from "react";
import { renderMarkdown } from "../lib/markdown";
import { tripCategoryLabels, tripTemplates } from "../lib/tripTemplates";
import type { OrbitItem, Trip, TripCategory, TripStatus, TripUpdateInput } from "../types";

interface TripEditorProps {
  item: OrbitItem;
  trip?: Trip | null;
  onSave: (input: TripUpdateInput) => void | Promise<void>;
  onCancel: () => void;
}

const statusLabels: Record<TripStatus, string> = {
  todo: "待处理",
  "in-progress": "进行中",
  done: "已完成",
  "needs-update": "需更新"
};

export function TripEditor({ item, trip, onSave, onCancel }: TripEditorProps) {
  const [title, setTitle] = useState(trip?.title ?? "");
  const [content, setContent] = useState(trip?.content ?? "");
  const [category, setCategory] = useState<TripCategory>(trip?.category ?? "note");
  const [status, setStatus] = useState<TripStatus>((trip?.status as TripStatus | null) ?? "todo");
  const [tags, setTags] = useState((trip?.tags ?? []).join(", "));
  const [pinned, setPinned] = useState(Boolean(trip?.pinned));
  const [preview, setPreview] = useState(false);

  const applyTemplate = (templateId: string) => {
    const template = tripTemplates.find((candidate) => candidate.id === templateId);
    if (!template) return;
    setCategory(template.category);
    if (!content.trim()) setContent(template.content);
    if (!title.trim()) setTitle(template.label);
  };

  const submit = async () => {
    const cleanTitle = title.trim();
    if (!cleanTitle) return;
    await onSave({
      title: cleanTitle,
      content,
      category,
      status: category === "status" ? status : null,
      tags: tags.split(",").map((tag) => tag.trim()).filter(Boolean),
      pinned
    });
  };

  return (
    <section className="palette-backdrop centered-backdrop" role="dialog" aria-modal="true" onClick={(event) => { if (event.target === event.currentTarget) onCancel(); }}>
      <div className="trip-editor">
        <header className="trip-editor-head">
          <div>
            <p className="eyebrow">{trip ? "Edit Trip" : "New Trip"}</p>
            <h3>{item.title}</h3>
          </div>
          <button type="button" className="icon-action" title="关闭" onClick={onCancel}>
            <X size={18} />
          </button>
        </header>

        {!trip && (
          <div className="trip-template-row">
            {tripTemplates.map((template) => (
              <button type="button" key={template.id} onClick={() => applyTemplate(template.id)}>
                {template.label}
              </button>
            ))}
          </div>
        )}

        <label className="trip-field">
          <span>标题</span>
          <input value={title} maxLength={50} onChange={(event) => setTitle(event.target.value)} placeholder="如：导出设置" />
        </label>

        <div className="trip-form-grid">
          <label className="trip-field">
            <span>分类</span>
            <select value={category} onChange={(event) => setCategory(event.target.value as TripCategory)}>
              {Object.entries(tripCategoryLabels).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>
          {category === "status" && (
            <label className="trip-field">
              <span>状态</span>
              <select value={status} onChange={(event) => setStatus(event.target.value as TripStatus)}>
                {Object.entries(statusLabels).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </label>
          )}
          <label className="trip-pin-toggle">
            <input type="checkbox" checked={pinned} onChange={(event) => setPinned(event.target.checked)} />
            <Pin size={15} />
            <span>置顶</span>
          </label>
        </div>

        <div className="trip-editor-toolbar">
          <button type="button" onClick={() => setPreview((current) => !current)}>
            {preview ? <EyeOff size={15} /> : <Eye size={15} />}
            <span>{preview ? "编辑" : "预览"}</span>
          </button>
          <span>{content.length}/4000</span>
        </div>

        {preview ? (
          <div className="trip-markdown" dangerouslySetInnerHTML={{ __html: renderMarkdown(content) }} />
        ) : (
          <textarea value={content} maxLength={4000} rows={12} onChange={(event) => setContent(event.target.value)} placeholder="支持 Markdown 子集：标题、列表、表格、代码块。" />
        )}

        <label className="trip-field">
          <span>标签</span>
          <input value={tags} onChange={(event) => setTags(event.target.value)} placeholder="用逗号分隔，如：导出, 参数, 快捷键" />
        </label>

        <footer className="trip-editor-actions">
          <button type="button" className="secondary-action" onClick={onCancel}>取消</button>
          <button type="button" className="primary-action" onClick={() => void submit()} disabled={!title.trim()}>
            <Save size={16} />
            保存
          </button>
        </footer>
      </div>
    </section>
  );
}
