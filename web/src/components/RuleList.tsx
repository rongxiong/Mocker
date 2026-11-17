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
import { primaryResponse } from '@shared/defaults';
import { Button } from './ui/button';
import { Input, Select } from './ui/input';
import { Switch } from './ui/switch';
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
    const first = primaryResponse(rule);
    const enabledCount = rule.responses.filter((item) => item.enabled !== false).length;
    const meta = [TYPE_LABEL.get(first.responseType) ?? first.responseType];
    if (rule.responses.length > 1) {
      meta.push(enabledCount === 0 ? '档位全停' : `${enabledCount}/${rule.responses.length} 档`);
    }
    if (first.delayMs > 0 || first.delayJitterMs > 0) {
      meta.push(`${first.delayMs}${first.delayJitterMs > 0 ? `+${first.delayJitterMs}` : ''}ms`);
    }
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
            'group cursor-pointer rounded-lg border border-l-[3px] border-l-transparent p-3 transition-colors duration-150',
            active
              ? 'border-brand-500/40 border-l-brand-500 bg-brand-500/[0.08]'
              : 'border-transparent hover:border-line hover:bg-fill',
            !rule.enabled && 'opacity-55',
          )}
        >
          <div className="flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate text-[14px] font-medium text-fg">
              {rule.name || '未命名'}
            </span>
            {conflictIds.has(rule.id) ? (
              <span
                title="存在重复的方法 + 路径，只有最新一条会被命中"
                className="flex shrink-0 items-center gap-1 text-[12px] text-warn"
              >
                <AlertTriangle size={16} strokeWidth={1.5} />
                重复
              </span>
            ) : null}
            <Switch
              checked={rule.enabled}
              onCheckedChange={(next) => onToggle(rule, next)}
              title={rule.enabled ? '已启用' : '已停用'}
            />
          </div>

          <div className="mt-2 truncate font-mono text-[12px] tabular-nums">
            <span className="text-brand-200">{rule.method}</span>{' '}
            <span className="text-muted-200">{rule.path}</span>
          </div>

          <div className="mt-2 flex items-center justify-between gap-2">
            <span className="truncate font-mono text-[12px] text-muted-300">
              {meta.join(' · ')}
            </span>
            <div
              className={cn(
                'flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100',
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
                className="cursor-pointer rounded p-1 text-muted-300 transition-colors hover:bg-fill-strong hover:text-fg"
              >
                <Copy size={16} strokeWidth={1.5} />
              </button>
              <button
                type="button"
                title="删除"
                onClick={(event) => {
                  event.stopPropagation();
                  onDelete(rule);
                }}
                className="cursor-pointer rounded p-1 text-muted-300 transition-colors hover:bg-fill-strong hover:text-danger"
              >
                <Trash2 size={16} strokeWidth={1.5} />
              </button>
            </div>
          </div>
        </div>
      </li>
    );
  };

  return (
    <aside className="flex max-h-[45vh] w-full shrink-0 flex-col border-b border-line bg-ink-800 lg:h-full lg:max-h-none lg:w-[264px] lg:border-b-0 lg:border-r">
      <div className="space-y-3 border-b border-line p-4">
        <div className="flex items-center justify-between">
          <span className="panel-title">接口规则</span>
          <Button variant="ghost" size="icon" title="新建接口" onClick={onCreate}>
            <Plus size={16} strokeWidth={1.5} />
          </Button>
        </div>
        <div className="relative">
          <Search
            size={16}
            strokeWidth={1.5}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-300"
          />
          <Input
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            placeholder="搜索接口"
            className="pl-9"
          />
        </div>
        <div className="flex flex-wrap gap-1">
          {['ALL', ...HTTP_METHODS].map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setMethod(item)}
              className={cn(
                'cursor-pointer rounded-md border px-1.5 py-1 font-mono text-[12px] transition-colors duration-150',
                method === item
                  ? 'border-brand-500/40 bg-brand-500/10 text-fg'
                  : 'border-line bg-fill text-muted-300 hover:text-muted-100',
              )}
            >
              {item === 'ALL' ? '全部' : item}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={group}
            onChange={(event) => setGroup(event.target.value)}
            className="h-8 w-full text-[13px]"
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
            className="h-8 flex-1 text-[13px]"
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
              'flex h-8 cursor-pointer items-center justify-center rounded-lg border px-2 transition-colors',
              grouped
                ? 'border-brand-500/40 bg-brand-500/10 text-fg'
                : 'border-line text-muted-300 hover:text-muted-100',
            )}
          >
            <FolderTree size={16} strokeWidth={1.5} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {filtered.length === 0 ? (
          <p className="px-3 py-8 text-center text-[13px] leading-relaxed text-muted-300">
            没有匹配的规则
            <br />
            点击右上角 + 新建一个接口
          </p>
        ) : (
          sections.map((section) => {
            const isCollapsed = collapsed[section.key] ?? false;
            return (
              <div key={section.key || 'all'} className="mb-2">
                {section.label ? (
                  <button
                    type="button"
                    onClick={() =>
                      setCollapsed((current) => ({ ...current, [section.key]: !isCollapsed }))
                    }
                    className="mb-1 flex w-full cursor-pointer items-center gap-2 px-1 py-1 text-left"
                  >
                    {isCollapsed ? (
                      <ChevronRight size={16} strokeWidth={1.5} />
                    ) : (
                      <ChevronDown size={16} strokeWidth={1.5} />
                    )}
                    <span className="text-[12px] text-muted-300">{section.label}</span>
                    <span className="font-mono text-[12px] text-muted-300">
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

      <div className="flex items-center justify-between border-t border-line px-4 py-2 text-[12px] text-muted-300">
        <span>共 {filtered.length} 条</span>
        {conflicts.length > 0 ? (
          <span className="flex items-center gap-1 text-warn">
            <AlertTriangle size={16} strokeWidth={1.5} />
            {conflicts.length} 处重复
          </span>
        ) : null}
      </div>
    </aside>
  );
}
