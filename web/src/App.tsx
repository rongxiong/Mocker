import { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import type { MockRule, RuleConflict } from '@shared/types';
import { TopBar } from '@/components/TopBar';
import type { ViewKey } from '@/components/TopBar';
import { RulesPage } from '@/pages/RulesPage';
import { FilesPage } from '@/pages/FilesPage';
import { SettingsPage } from '@/pages/SettingsPage';
import { ToastHost, toast } from '@/components/ui/toast';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import type { ServerInfo } from '@/lib/api';
import { createDefaultRule } from '@shared/defaults';

export default function App() {
  const [view, setView] = useState<ViewKey>('rules');
  const [info, setInfo] = useState<ServerInfo | null>(null);
  const [rules, setRules] = useState<MockRule[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [fileCount, setFileCount] = useState(0);
  const [conflicts, setConflicts] = useState<RuleConflict[]>([]);
  const [autoSave, setAutoSave] = useState(() => localStorage.getItem('mocker:autoSave') === '1');
  const [pendingDelete, setPendingDelete] = useState<MockRule | null>(null);
  const [pendingImport, setPendingImport] = useState<{
    rules: MockRule[];
    files?: unknown[];
  } | null>(null);
  const importInput = useRef<HTMLInputElement>(null);

  const selectedRule = useMemo(
    () => rules.find((rule) => rule.id === selectedId) ?? null,
    [rules, selectedId],
  );

  const groups = useMemo(
    () => [
      ...new Set(
        rules.map((rule) => rule.group).filter((value): value is string => Boolean(value)),
      ),
    ],
    [rules],
  );

  const baseUrl = `${window.location.origin}${info?.mockPrefix ?? '/mock'}`;

  const toggleAutoSave = (next: boolean) => {
    setAutoSave(next);
    localStorage.setItem('mocker:autoSave', next ? '1' : '0');
  };

  const loadInfo = () => {
    api
      .info()
      .then(setInfo)
      .catch(() => toast('无法连接 Mocker 服务端', 'error'));
  };

  const loadRules = () => {
    api
      .listRules()
      .then(({ rules: list, conflicts: found }) => {
        setRules(list);
        setConflicts(found);
        setSelectedId((current) =>
          current && list.some((rule) => rule.id === current) ? current : (list[0]?.id ?? null),
        );
      })
      .catch(() => toast('加载规则失败', 'error'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadInfo();
    loadRules();
    api
      .listFiles()
      .then((files) => setFileCount(files.length))
      .catch(() => setFileCount(0));
  }, []);

  const handleCreate = async () => {
    try {
      const rule = await api.createRule(createDefaultRule({ name: `接口 ${rules.length + 1}` }));
      setRules((current) => [rule, ...current]);
      setSelectedId(rule.id);
      setConflicts(await api.listRules().then((data) => data.conflicts));
      setView('rules');
      toast('已创建新接口', 'success');
    } catch {
      toast('创建失败', 'error');
    }
  };

  const handleSave = async (rule: MockRule) => {
    setSaving(true);
    try {
      const saved = await api.updateRule(rule.id, rule);
      setRules((current) => current.map((item) => (item.id === saved.id ? saved : item)));
      setConflicts(await api.listRules().then((data) => data.conflicts));
      toast('已保存', 'success');
    } catch {
      toast('保存失败', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (rule: MockRule) => {
    try {
      await api.deleteRule(rule.id);
      const next = rules.filter((item) => item.id !== rule.id);
      setRules(next);
      if (selectedId === rule.id) setSelectedId(null);
      setPendingDelete(null);
      setConflicts(await api.listRules().then((data) => data.conflicts));
      toast('已删除', 'success');
    } catch {
      toast('删除失败', 'error');
    }
  };

  const handleDuplicate = async (rule: MockRule) => {
    try {
      const copy = await api.duplicateRule(rule.id);
      setRules((current) => [copy, ...current]);
      setSelectedId(copy.id);
      setConflicts(await api.listRules().then((data) => data.conflicts));
      toast('已复制规则', 'success');
    } catch {
      toast('复制失败', 'error');
    }
  };

  const handleToggle = async (rule: MockRule, enabled: boolean) => {
    setRules((current) =>
      current.map((item) => (item.id === rule.id ? { ...item, enabled } : item)),
    );
    await api.updateRule(rule.id, { enabled }).catch(() => toast('切换启用状态失败', 'error'));
  };

  const handleExport = async () => {
    const data = await api.exportAll().catch(() => null);
    if (!data) {
      toast('导出失败', 'error');
      return;
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `mocker-rules-${Date.now()}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    toast('已导出配置', 'success');
  };

  const handleImportFile = async (file: File) => {
    const text = await file.text();
    try {
      const parsed = JSON.parse(text) as { rules?: MockRule[] };
      if (!Array.isArray(parsed.rules)) throw new Error('缺少 rules 字段');
      setPendingImport({
        rules: parsed.rules,
        files: Array.isArray((parsed as { files?: unknown }).files)
          ? ((parsed as { files: unknown[] }).files as never)
          : undefined,
      });
    } catch {
      toast('导入失败：不是有效的 Mocker 配置', 'error');
    }
  };

  const applyImport = async (mode: 'merge' | 'replace') => {
    if (!pendingImport) return;
    try {
      const result = await api.importRules({ ...pendingImport, files: pendingImport.files }, mode);
      const overwritten = result.updated > 0 ? `，覆盖 ${result.updated} 条` : '';
      toast(`已导入 ${result.imported} 条规则${overwritten}`, 'success');
      setPendingImport(null);
      loadRules();
    } catch {
      toast('导入失败', 'error');
    }
  };

  return (
    <div className="flex h-full flex-col">
      <TopBar
        view={view}
        onViewChange={setView}
        baseUrl={baseUrl}
        ruleCount={rules.length}
        fileCount={fileCount}
        autoSave={autoSave}
        onAutoSaveChange={toggleAutoSave}
        onNewRule={() => void handleCreate()}
        onExport={() => void handleExport()}
        onImportFile={(file) => void handleImportFile(file)}
      />

      <main className="min-h-0 flex-1 pt-14">
        {loading ? (
          <div className="flex h-full items-center justify-center gap-2 text-muted-300">
            <Loader2 size={16} className="animate-spin" />
            正在加载规则…
          </div>
        ) : (
          <>
            {view === 'rules' ? (
              <RulesPage
                rules={rules}
                selectedRule={selectedRule}
                baseUrl={baseUrl}
                saving={saving}
                autoSave={autoSave}
                conflicts={conflicts}
                groups={groups}
                onSelect={setSelectedId}
                onCreate={() => void handleCreate()}
                onDelete={setPendingDelete}
                onDuplicate={(rule) => void handleDuplicate(rule)}
                onToggle={(rule, enabled) => void handleToggle(rule, enabled)}
                onSave={(rule) => void handleSave(rule)}
              />
            ) : null}
            {view === 'files' ? <FilesPage /> : null}
            {view === 'settings' ? (
              <SettingsPage
                info={info}
                ruleCount={rules.length}
                onExport={() => void handleExport()}
                onImportClick={() => importInput.current?.click()}
                onImported={() => {
                  loadRules();
                  setView('rules');
                }}
              />
            ) : null}
          </>
        )}
      </main>

      <input
        ref={importInput}
        type="file"
        accept="application/json"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void handleImportFile(file);
          event.target.value = '';
        }}
      />

      <Dialog
        open={Boolean(pendingDelete)}
        title="删除接口规则"
        description={`确定删除「${pendingDelete?.name ?? ''}」吗？该操作不可撤销。`}
        onClose={() => setPendingDelete(null)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setPendingDelete(null)}>
              取消
            </Button>
            <Button
              variant="danger"
              onClick={() => pendingDelete && void handleDelete(pendingDelete)}
            >
              删除
            </Button>
          </>
        }
      />

      <Dialog
        open={Boolean(pendingImport)}
        title="导入配置"
        description={`文件包含 ${pendingImport?.rules.length ?? 0} 条规则，请选择导入方式。`}
        onClose={() => setPendingImport(null)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setPendingImport(null)}>
              取消
            </Button>
            <Button variant="secondary" onClick={() => void applyImport('merge')}>
              合并追加
            </Button>
            <Button variant="primary" onClick={() => void applyImport('replace')}>
              覆盖全部
            </Button>
          </>
        }
      />

      <ToastHost />
    </div>
  );
}
