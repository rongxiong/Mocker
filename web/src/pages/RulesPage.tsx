import { useEffect, useMemo, useState } from 'react';
import { PanelBottomClose, Radio, Sparkles, X } from 'lucide-react';
import type { MockRule, RuleConflict } from '@shared/types';
import { RuleList } from '@/components/RuleList';
import { RuleEditor } from '@/components/RuleEditor';
import { ResponsePreview } from '@/components/ResponsePreview';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';

interface RulesPageProps {
  rules: MockRule[];
  selectedRule: MockRule | null;
  baseUrl: string;
  saving: boolean;
  autoSave: boolean;
  conflicts: RuleConflict[];
  groups: string[];
  onSelect: (id: string) => void;
  onCreate: () => void;
  onDelete: (rule: MockRule) => void;
  onDuplicate: (rule: MockRule) => void;
  onToggle: (rule: MockRule, enabled: boolean) => void;
  onSave: (rule: MockRule) => void;
}

export function RulesPage({
  rules,
  selectedRule,
  baseUrl,
  saving,
  autoSave,
  conflicts,
  groups,
  onSelect,
  onCreate,
  onDelete,
  onDuplicate,
  onToggle,
  onSave,
}: RulesPageProps) {
  const [draft, setDraft] = useState<MockRule | null>(selectedRule);
  const [refreshToken, setRefreshToken] = useState(0);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);

  useEffect(() => {
    setDraft(selectedRule ? { ...selectedRule } : null);
  }, [selectedRule]);

  const dirty = useMemo(() => {
    if (!draft || !selectedRule) return false;
    return JSON.stringify(draft) !== JSON.stringify(selectedRule);
  }, [draft, selectedRule]);

  /** Never drop unsaved edits silently. */
  const guard = (action: () => void) => {
    if (dirty) {
      setPendingAction(() => action);
      return;
    }
    action();
  };

  const conflict =
    conflicts.find((item) => selectedRule && item.ids.includes(selectedRule.id)) ?? null;

  // Cmd/Ctrl+S saves the current draft.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        if (draft && dirty) onSave(draft);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [draft, dirty, onSave]);

  // Optional auto-save, 1.2s after the last edit.
  useEffect(() => {
    if (!autoSave || !dirty || !draft || saving) return undefined;
    const timer = setTimeout(() => onSave(draft), 1200);
    return () => clearTimeout(timer);
  }, [autoSave, dirty, draft, saving, onSave]);

  return (
    <div className="flex h-full min-h-0">
      <RuleList
        rules={rules}
        selectedId={selectedRule?.id ?? null}
        conflicts={conflicts}
        groups={groups}
        onSelect={(id) => guard(() => onSelect(id))}
        onCreate={() => guard(onCreate)}
        onToggle={onToggle}
        onDelete={onDelete}
        onDuplicate={onDuplicate}
      />

      {draft ? (
        <>
          <RuleEditor
            rule={draft}
            baseUrl={baseUrl}
            dirty={dirty}
            saving={saving}
            conflict={conflict}
            groups={groups}
            onChange={(patch) => setDraft({ ...draft, ...patch })}
            onSave={() => {
              onSave(draft);
              setRefreshToken((token) => token + 1);
            }}
            onDelete={() => onDelete(draft)}
          />
          <div className="hidden w-[400px] shrink-0 border-l border-white/[0.07] bg-ink-800/40 xl:block">
            <ResponsePreview rule={draft} baseUrl={baseUrl} refreshToken={refreshToken} />
          </div>

          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            className="fixed bottom-5 right-5 z-30 flex cursor-pointer items-center gap-1.5 rounded-full bg-brand-gradient px-4 py-2.5 text-[12.5px] font-medium text-ink-900 shadow-[0_12px_30px_-10px_rgba(124,92,255,.9)] transition-transform hover:scale-105 xl:hidden"
          >
            <PanelBottomClose size={14} />
            响应预览
          </button>

          {drawerOpen ? (
            <div className="fixed inset-0 z-40 xl:hidden">
              <button
                type="button"
                aria-label="关闭预览"
                onClick={() => setDrawerOpen(false)}
                className="absolute inset-0 cursor-default bg-ink-900/70 backdrop-blur-sm animate-fade-in-fast"
              />
              <div className="glass-strong absolute inset-x-0 bottom-0 flex h-[72vh] animate-slide-up flex-col rounded-t-2xl">
                <div className="flex items-center justify-between border-b border-white/[0.07] px-3 py-2">
                  <span className="panel-title">响应预览</span>
                  <Button variant="ghost" size="icon" onClick={() => setDrawerOpen(false)}>
                    <X size={14} />
                  </Button>
                </div>
                <div className="min-h-0 flex-1">
                  <ResponsePreview rule={draft} baseUrl={baseUrl} refreshToken={refreshToken} />
                </div>
              </div>
            </div>
          ) : null}
        </>
      ) : (
        <section className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-gradient/20 shadow-glow">
            <Radio size={24} className="text-brand-300" />
          </div>
          <h2 className="text-[15px] font-semibold text-muted-100">还没有选中接口</h2>
          <p className="max-w-[340px] text-[12.5px] leading-relaxed text-muted-200">
            从左侧选择一个接口编辑，或者新建一个 Mock 接口：设置方法、路径、延迟与响应内容，
            保存后即可通过 Base URL 立即访问。
          </p>
          <Button variant="primary" size="lg" onClick={onCreate}>
            <Sparkles size={14} />
            新建第一个接口
          </Button>
        </section>
      )}

      <Dialog
        open={Boolean(pendingAction)}
        title="放弃未保存的修改？"
        description={`「${selectedRule?.name ?? ''}」有尚未保存的改动，切换后会丢失。`}
        onClose={() => setPendingAction(null)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setPendingAction(null)}>
              继续编辑
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                if (draft) onSave(draft);
                setPendingAction(null);
                pendingAction?.();
              }}
            >
              保存并继续
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                pendingAction?.();
                setPendingAction(null);
              }}
            >
              放弃修改
            </Button>
          </>
        }
      />
    </div>
  );
}
