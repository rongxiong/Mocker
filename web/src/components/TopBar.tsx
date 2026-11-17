import { useRef } from 'react';
import {
  Boxes,
  Copy,
  Database,
  Download,
  FileStack,
  Monitor,
  Moon,
  Plus,
  Radio,
  Sun,
  Upload,
} from 'lucide-react';
import { Button } from './ui/button';
import { Switch } from './ui/switch';
import { cn, copyText } from '@/lib/utils';
import { THEME_CYCLE, THEME_LABEL, useTheme } from '@/lib/theme';
import type { ThemeMode } from '@/lib/theme';
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

const THEME_ICON: Record<ThemeMode, typeof Sun> = {
  system: Monitor,
  light: Sun,
  dark: Moon,
};

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
  const { mode, setThemeMode } = useTheme();
  const ThemeIcon = THEME_ICON[mode];

  const counts: Record<ViewKey, number> = { rules: ruleCount, files: fileCount, settings: 0 };

  return (
    <header className="fixed inset-x-0 top-0 z-40 h-14 border-b border-line bg-ink-900">
      <div className="flex h-full items-center gap-2 px-3 sm:gap-4 sm:px-4">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-500">
            <Boxes size={16} strokeWidth={1.5} className="text-on-brand" />
          </div>
          <div className="leading-tight">
            <div className="text-[16px] font-medium text-fg">Mocker</div>
            <div className="hidden text-[12px] text-muted-300 sm:block">本地 Mock 服务</div>
          </div>
        </div>

        <button
          type="button"
          onClick={() => {
            copyText(baseUrl);
            toast(`已复制 Base URL: ${baseUrl}`, 'info');
          }}
          title="点击复制"
          className="group hidden cursor-pointer items-center gap-2 rounded-lg border border-line bg-ink-800 px-2.5 py-1.5 font-mono text-[12px] text-muted-200 transition-colors hover:border-line-strong hover:text-fg md:flex"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-ok" />
          {baseUrl}
          <Copy
            size={16}
            strokeWidth={1.5}
            className="opacity-0 transition-opacity group-hover:opacity-100"
          />
        </button>

        <nav className="ml-1 flex items-center gap-0.5 sm:ml-2 sm:gap-1">
          {NAV.map((item) => {
            const Icon = item.icon;
            const active = view === item.key;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => onViewChange(item.key)}
                aria-label={item.label}
                className={cn(
                  'flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-[14px] transition-colors duration-150 sm:px-3',
                  active
                    ? 'bg-fill text-fg shadow-panel'
                    : 'text-muted-200 hover:bg-fill hover:text-muted-100',
                )}
              >
                <Icon size={16} strokeWidth={1.5} />
                <span className="hidden sm:inline">{item.label}</span>
                {counts[item.key] > 0 ? (
                  <span className="hidden rounded bg-fill-strong px-1 font-mono text-[12px] text-muted-200 sm:inline">
                    {counts[item.key]}
                  </span>
                ) : null}
              </button>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-1.5 sm:gap-3">
          <label
            className="hidden cursor-pointer items-center gap-2 text-[13px] text-muted-300 lg:flex"
            title="停止编辑 1.2 秒后自动保存（也可用 Cmd/Ctrl+S）"
          >
            <Switch checked={autoSave} onCheckedChange={onAutoSaveChange} />
            自动保存
          </label>
          <button
            type="button"
            onClick={() => setThemeMode(THEME_CYCLE[mode])}
            title={`主题：${THEME_LABEL[mode]}（点击切换）`}
            aria-label={`主题：${THEME_LABEL[mode]}`}
            className="flex h-8 cursor-pointer items-center gap-2 rounded-lg border border-line bg-ink-800 px-2 text-[13px] text-muted-200 transition-colors hover:bg-fill hover:text-muted-100"
          >
            <ThemeIcon size={16} strokeWidth={1.5} />
            <span className="hidden 2xl:inline">{THEME_LABEL[mode]}</span>
          </button>
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
          <Button
            variant="ghost"
            className="hidden md:inline-flex"
            onClick={() => fileInput.current?.click()}
          >
            <Upload size={16} strokeWidth={1.5} />
            导入
          </Button>
          <Button variant="ghost" className="hidden md:inline-flex" onClick={onExport}>
            <Download size={16} strokeWidth={1.5} />
            导出
          </Button>
          <Button variant="primary" aria-label="新建接口" onClick={onNewRule}>
            <Plus size={16} strokeWidth={1.5} />
            <span className="hidden sm:inline">新建接口</span>
          </Button>
        </div>
      </div>
    </header>
  );
}
