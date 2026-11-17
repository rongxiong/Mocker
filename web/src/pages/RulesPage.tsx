import { useEffect, useMemo, useState } from 'react';
import { PanelBottomClose, Plus, Radio, X } from 'lucide-react';
import type { MockRule, RuleConflict } from '@shared/types';
import { RuleList } from '@/components/RuleList';
import { RuleEditor } from '@/components/RuleEditor';
import { ResponsePreview } from '@/components/ResponsePreview';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { deepEqual } from '@/lib/utils';

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
    if (!selectedRule) {
      setDraft(null);
      return;
    }
    // Saving or toggling replaces the selected rule object. Keep the current
    // draft in that case and only sync server-owned metadata; a real rule
    // switch (different id) still loads a fresh draft.
    setDraft((current) =>
      current && current.id === selectedRule.id
        ? {
            ...current,
            enabled: selectedRule.enabled,
            createdAt: selectedRule.createdAt,
            updatedAt: selectedRule.updatedAt,
          }
        : { ...selectedRule },
    );
  }, [selectedRule]);

  const dirty = useMemo(() => {
    if (!draft || !selectedRule) return false;
    // Key order differs between a freshly created rule and the same rule read
    // back from the DB, so compare values rather than JSON strings.
    return !deepEqual(draft, selectedRule);
  }, [draft, selectedRule]);

  // Another rule already uses this name (blank names are exempt). The server
  // rejects such saves with 409; mirror the rule locally for instant feedback.
  const nameConflict = useMemo(() => {
    if (!draft) return false;
    const name = draft.name.trim();
    if (!name) return false;
    return rules.some((rule) => rule.id !== draft.id && rule.name.trim() === name);
  }, [draft, rules]);

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
        if (draft && dirty && !nameConflict) onSave(draft);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [draft, dirty, nameConflict, onSave]);

  // Optional auto-save, 1.2s after the last edit. Skipped while the name
  // collides, otherwise the debounce would fire a doomed request on every edit.
  useEffect(() => {
    if (!autoSave || !dirty || nameConflict || !draft || saving) return undefined;
    const timer = setTimeout(() => onSave(draft), 1200);
    return () => clearTimeout(timer);
  }, [autoSave, dirty, nameConflict, draft, saving, onSave]);

  return (
    <div className="flex h-full min-h-0 flex-col lg:flex-row">
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
            nameConflict={nameConflict}
            groups={groups}
            onChange={(patch) =>
              setDraft((current) => (current ? { ...current, ...patch } : current))
            }
            onSave={() => {
              onSave(draft);
              setRefreshToken((token) => token + 1);
            }}
            onDelete={() => onDelete(draft)}
          />
          <div className="hidden w-[380px] shrink-0 border-l border-line bg-ink-800 xl:block">
            <ResponsePreview rule={draft} baseUrl={baseUrl} refreshToken={refreshToken} />
          </div>

          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            className="fixed bottom-5 right-5 z-30 flex cursor-pointer items-center gap-2 rounded-lg border border-line bg-ink-800 px-4 py-2 text-[14px] font-medium text-muted-100 shadow-panel transition-colors hover:bg-fill xl:hidden"
          >
            <PanelBottomClose size={16} strokeWidth={1.5} />
            响应预览
          </button>

          {drawerOpen ? (
            <div className="fixed inset-0 z-40 xl:hidden">
              <button
                type="button"
                aria-label="关闭预览"
                onClick={() => setDrawerOpen(false)}
                className="absolute inset-0 cursor-default bg-ink-900/70 animate-fade-in-fast"
              />
              <div className="glass-strong absolute inset-x-0 bottom-0 flex h-[72vh] animate-slide-up flex-col rounded-t-xl">
                <div className="flex items-center justify-between border-b border-line px-4 py-3">
                  <span className="panel-title">响应预览</span>
                  <Button variant="ghost" size="icon" onClick={() => setDrawerOpen(false)}>
                    <X size={16} strokeWidth={1.5} />
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
          <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-line bg-fill">
            <Radio size={16} strokeWidth={1.5} className="text-muted-300" />
          </div>
          <h2 className="text-[16px] font-medium text-fg">还没有选中接口</h2>
          <p className="max-w-[340px] text-[13px] leading-relaxed text-muted-200">
            从左侧选择一个接口编辑，或者新建一个 Mock 接口：设置方法、路径、延迟与响应内容，
            保存后即可通过 Base URL 立即访问。
          </p>
          <Button variant="primary" onClick={onCreate}>
            <Plus size={16} strokeWidth={1.5} />
            新建接口
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
