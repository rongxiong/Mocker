import { useRef } from 'react';
import { Boxes, Copy, Database, Download, FileStack, Plus, Radio, Upload } from 'lucide-react';
import { Button } from './ui/button';
import { Switch } from './ui/switch';
import { cn, copyText } from '@/lib/utils';
import { toast } from './ui/toast';

export type ViewKey = 'rules' | 'files' | 'settings';

interface TopBarProps {
  view: ViewKey;
  onViewChange: (view: ViewKey) => void;
  baseUrl: string;
  ruleCount: number;
  fileCount: number;
  autoSave: boolean;
  onAutoSaveChange: (value: boolean) => void;
  onNewRule: () => void;
  onExport: () => void;
  onImportFile: (file: File) => void;
}

const NAV: Array<{ key: ViewKey; label: string; icon: typeof Radio }> = [
  { key: 'rules', label: '接口规则', icon: Radio },
  { key: 'files', label: '文件库', icon: FileStack },
  { key: 'settings', label: '设置', icon: Database },
];

export function TopBar({
  view,
  onViewChange,
  baseUrl,
  ruleCount,
  fileCount,
  autoSave,
  onAutoSaveChange,
  onNewRule,
  onExport,
  onImportFile,
}: TopBarProps) {
  const fileInput = useRef<HTMLInputElement>(null);

  const counts: Record<ViewKey, number> = { rules: ruleCount, files: fileCount, settings: 0 };

  return (
    <header className="fixed inset-x-0 top-0 z-40 h-14 border-b border-white/[0.07] bg-ink-900/80 backdrop-blur-xl">
      <div className="flex h-full items-center gap-4 px-4">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-brand-gradient shadow-[0_8px_22px_-8px_rgba(124,92,255,.95)]">
            <Boxes size={17} className="text-ink-900" />
          </div>
          <div className="leading-tight">
            <div className="text-[15px] font-semibold tracking-tight">
              Mocker<span className="gradient-text">.</span>
            </div>
            <div className="text-[10px] uppercase tracking-[0.18em] text-muted-300">
              mock console
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={() => {
            copyText(baseUrl);
            toast(`已复制 Base URL: ${baseUrl}`, 'info');
          }}
          title="Click to copy"
          className="group hidden cursor-pointer items-center gap-2 rounded-lg border border-white/[0.07] bg-white/[0.04] px-2.5 py-1.5 font-mono text-[11.5px] text-muted-200 transition-all hover:border-brand-500/40 hover:text-white md:flex"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-ok shadow-[0_0_8px_#34D399]" />
          {baseUrl}
          <Copy size={12} className="opacity-0 transition-opacity group-hover:opacity-100" />
        </button>

        <nav className="ml-2 flex items-center gap-1">
          {NAV.map((item) => {
            const Icon = item.icon;
            const active = view === item.key;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => onViewChange(item.key)}
                className={cn(
                  'flex cursor-pointer items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12.5px] font-medium transition-all duration-200',
                  active
                    ? 'bg-white/[0.08] text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,.08)]'
                    : 'text-muted-200 hover:bg-white/[0.05] hover:text-muted-100',
                )}
              >
                <Icon size={14} />
                {item.label}
                {counts[item.key] > 0 ? (
                  <span className="rounded-md bg-white/10 px-1 text-[10px] text-muted-200">
                    {counts[item.key]}
                  </span>
                ) : null}
              </button>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <label
            className="hidden cursor-pointer items-center gap-1.5 text-[11.5px] text-muted-300 lg:flex"
            title="停止编辑 1.2 秒后自动保存（也可用 Cmd/Ctrl+S）"
          >
            <Switch checked={autoSave} onCheckedChange={onAutoSaveChange} />
            自动保存
          </label>
          <input
            ref={fileInput}
            type="file"
            accept="application/json"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) onImportFile(file);
              event.target.value = '';
            }}
          />
          <Button variant="ghost" size="md" onClick={() => fileInput.current?.click()}>
            <Upload size={14} />
            导入
          </Button>
          <Button variant="ghost" size="md" onClick={onExport}>
            <Download size={14} />
            导出
          </Button>
          <Button variant="primary" size="md" onClick={onNewRule}>
            <Plus size={14} />
            新建接口
          </Button>
        </div>
      </div>
    </header>
  );
}
