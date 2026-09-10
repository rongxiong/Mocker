import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Copy,
  FolderTree,
  Plus,
  Search,
  Trash2,
} from 'lucide-react';
import type { MockRule, RuleConflict } from '@shared/types';
import { Button } from './ui/button';
import { Input, Select } from './ui/input';
import { Switch } from './ui/switch';
import { MethodBadge } from './ui/badge';
import { cn } from '@/lib/utils';
import { HTTP_METHODS, RESPONSE_TYPES } from '@/lib/constants';

interface RuleListProps {
  rules: MockRule[];
  selectedId: string | null;
  conflicts: RuleConflict[];
  groups: string[];
  onSelect: (id: string) => void;
  onCreate: () => void;
  onToggle: (rule: MockRule, enabled: boolean) => void;
  onDelete: (rule: MockRule) => void;
  onDuplicate: (rule: MockRule) => void;
}

const TYPE_LABEL = new Map(RESPONSE_TYPES.map((item) => [item.value, item.label]));

export function RuleList({
  rules,
  selectedId,
  conflicts,
  groups,
  onSelect,
  onCreate,
  onToggle,
  onDelete,
  onDuplicate,
}: RuleListProps) {
  const [keyword, setKeyword] = useState('');
  const [method, setMethod] = useState<string>('ALL');
  const [group, setGroup] = useState<string>('ALL');
  const [sortBy, setSortBy] = useState<'recent' | 'path' | 'name'>('recent');
  const [grouped, setGrouped] = useState(groups.length > 0);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const conflictIds = new Set(conflicts.flatMap((item) => item.ids));

  const filtered = useMemo(() => {
    const text = keyword.trim().toLowerCase();
    const list = rules.filter((rule) => {
      if (method !== 'ALL' && rule.method !== method) return false;
      if (group === 'NONE' && rule.group) return false;
      if (group !== 'ALL' && group !== 'NONE' && rule.group !== group) return false;
      if (!text) return true;
      return (
        rule.name.toLowerCase().includes(text) ||
        rule.path.toLowerCase().includes(text) ||
        rule.description.toLowerCase().includes(text) ||
        rule.group.toLowerCase().includes(text)
      );
    });

    return [...list].sort((a, b) => {
      if (sortBy === 'path') {
        return a.path.localeCompare(b.path) || a.method.localeCompare(b.method);
      }
      if (sortBy === 'name') return a.name.localeCompare(b.name);
      return b.createdAt - a.createdAt;
    });
  }, [rules, keyword, method, group, sortBy]);

  const sections = useMemo(() => {
    if (!grouped) return [{ key: '', label: '', items: filtered }];
    const map = new Map<string, MockRule[]>();
    for (const rule of filtered) {
      const key = rule.group || '未分组';
      map.set(key, [...(map.get(key) ?? []), rule]);
    }
    return [...map.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([label, items]) => ({ key: label, label, items }));
  }, [filtered, grouped]);

  const renderRule = (rule: MockRule) => {
    const active = rule.id === selectedId;
    return (
      <li key={rule.id}>
        <div
          role="button"
          tabIndex={0}
          onClick={() => onSelect(rule.id)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') onSelect(rule.id);
          }}
          className={cn(
            'group relative w-full cursor-pointer rounded-xl border p-2.5 transition-all duration-200',
            active
              ? 'border-brand-500/50 bg-brand-500/[0.12] shadow-[0_10px_30px_-18px_rgba(124,92,255,.9)]'
              : 'border-transparent bg-white/[0.02] hover:-translate-y-[1px] hover:border-white/10 hover:bg-white/[0.05]',
            !rule.enabled && 'opacity-55',
          )}
        >
          <div className="flex items-center gap-2">
            <MethodBadge method={rule.method} />
            <span className="truncate text-[12.5px] font-medium text-muted-100">
              {rule.name || '未命名'}
            </span>
            {conflictIds.has(rule.id) ? (
              <span
                title="存在重复的方法 + 路径，只有最新一条会被命中"
                className="flex items-center gap-0.5 rounded border border-amber-400/30 bg-amber-400/10 px-1 text-[10px] text-amber-300"
              >
                <AlertTriangle size={9} />
                重复
              </span>
            ) : null}
          </div>

          <div className="mt-1.5 flex items-center gap-1.5">
            <span className="truncate font-mono text-[11px] text-muted-200">{rule.path}</span>
          </div>

          <div className="mt-2 flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-[10.5px] text-muted-300">
              <span className="rounded border border-white/[0.07] px-1 py-[1px]">
                {TYPE_LABEL.get(rule.responseType) ?? rule.responseType}
              </span>
              {rule.delayMs > 0 || rule.delayJitterMs > 0 ? (
                <span className="rounded border border-amber-400/25 bg-amber-400/10 px-1 py-[1px] text-amber-300">
                  {rule.delayMs}
                  {rule.delayJitterMs > 0 ? `+${rule.delayJitterMs}` : ''}ms
                </span>
              ) : null}
            </div>
            <div className="flex items-center gap-1">
              <div
                className={cn(
                  'flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100',
                  active && 'opacity-100',
                )}
              >
                <button
                  type="button"
                  title="复制"
                  onClick={(event) => {
                    event.stopPropagation();
                    onDuplicate(rule);
                  }}
                  className="cursor-pointer rounded p-1 text-muted-300 hover:bg-white/10 hover:text-muted-100"
                >
                  <Copy size={12} />
                </button>
                <button
                  type="button"
                  title="删除"
                  onClick={(event) => {
                    event.stopPropagation();
                    onDelete(rule);
                  }}
                  className="cursor-pointer rounded p-1 text-muted-300 hover:bg-rose-500/20 hover:text-rose-300"
                >
                  <Trash2 size={12} />
                </button>
              </div>
              <Switch
                checked={rule.enabled}
                onCheckedChange={(next) => onToggle(rule, next)}
                title={rule.enabled ? '已启用' : '已停用'}
              />
            </div>
          </div>
        </div>
      </li>
    );
  };

  return (
    <aside className="flex h-full w-[290px] shrink-0 flex-col border-r border-white/[0.07] bg-ink-800/40">
      <div className="space-y-2.5 border-b border-white/[0.07] p-3">
        <div className="flex items-center justify-between">
          <span className="panel-title">接口规则</span>
          <Button variant="ghost" size="icon" title="新建接口" onClick={onCreate}>
            <Plus size={15} />
          </Button>
        </div>
        <div className="relative">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-300" />
          <Input
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            placeholder="搜索名称 / 路径 / 分组"
            className="pl-7"
          />
        </div>
        <div className="flex flex-wrap gap-1">
          {['ALL', ...HTTP_METHODS].map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setMethod(item)}
              className={cn(
                'cursor-pointer rounded-md border px-1.5 py-[2px] font-mono text-[10px] font-semibold transition-all',
                method === item
                  ? 'border-brand-500/50 bg-brand-500/20 text-white'
                  : 'border-white/[0.07] bg-white/[0.03] text-muted-300 hover:text-muted-100',
              )}
            >
              {item === 'ALL' ? '全部' : item}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1.5">
          <Select
            value={group}
            onChange={(event) => setGroup(event.target.value)}
            className="h-7 flex-1 text-[11.5px]"
          >
            <option value="ALL">全部分组</option>
            {groups.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
            <option value="NONE">未分组</option>
          </Select>
          <Select
            value={sortBy}
            onChange={(event) => setSortBy(event.target.value as 'recent' | 'path' | 'name')}
            className="h-7 w-[92px] text-[11.5px]"
          >
            <option value="recent">最近创建</option>
            <option value="path">按路径</option>
            <option value="name">按名称</option>
          </Select>
          <button
            type="button"
            title={grouped ? '关闭分组视图' : '按分组显示'}
            onClick={() => setGrouped(!grouped)}
            className={cn(
              'flex h-7 cursor-pointer items-center justify-center rounded-lg border px-2 transition-colors',
              grouped
                ? 'border-brand-500/50 bg-brand-500/20 text-white'
                : 'border-white/[0.08] text-muted-300 hover:text-muted-100',
            )}
          >
            <FolderTree size={12} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {filtered.length === 0 ? (
          <p className="px-3 py-8 text-center text-[12px] leading-relaxed text-muted-300">
            没有匹配的规则
            <br />
            点击右上角 + 新建一个接口
          </p>
        ) : (
          sections.map((section) => {
            const isCollapsed = collapsed[section.key] ?? false;
            return (
              <div key={section.key || 'all'} className="mb-1">
                {section.label ? (
                  <button
                    type="button"
                    onClick={() =>
                      setCollapsed((current) => ({ ...current, [section.key]: !isCollapsed }))
                    }
                    className="mb-1 flex w-full cursor-pointer items-center gap-1.5 px-1 py-1 text-left"
                  >
                    {isCollapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
                    <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-300">
                      {section.label}
                    </span>
                    <span className="rounded bg-white/[0.06] px-1 text-[10px] text-muted-300">
                      {section.items.length}
                    </span>
                  </button>
                ) : null}
                {isCollapsed ? null : (
                  <ul className="space-y-1">{section.items.map(renderRule)}</ul>
                )}
              </div>
            );
          })
        )}
      </div>

      <div className="flex items-center justify-between border-t border-white/[0.07] px-3 py-2 text-[11px] text-muted-300">
        <span>共 {filtered.length} 条</span>
        {conflicts.length > 0 ? (
          <span className="flex items-center gap-1 text-amber-300">
            <AlertTriangle size={11} />
            {conflicts.length} 处重复
          </span>
        ) : null}
      </div>
    </aside>
  );
}
