import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Copy, Link2, Plus, RotateCcw, Save, Terminal, Trash2 } from 'lucide-react';
import type { MockRule, ResponseEntry, RuleConflict } from '@shared/types';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Switch } from './ui/switch';
import { BasicSettings } from './BasicSettings';
import { ResponseEditor } from './ResponseEditor';
import { api } from '@/lib/api';
import { buildHttpie, cn, copyText, isValidJson } from '@/lib/utils';
import { toast } from './ui/toast';
import { createResponseEntry, uid } from '@shared/defaults';
import { nextActiveIndex, removeSlot } from '@/lib/responseSlots';

interface RuleEditorProps {
  rule: MockRule;
  baseUrl: string;
  dirty: boolean;
  saving: boolean;
  conflict: RuleConflict | null;
  nameConflict: boolean;
  groups: string[];
  onChange: (patch: Partial<MockRule>) => void;
  onSave: () => void;
  onDelete: () => void;
}

export function RuleEditor({
  rule,
  baseUrl,
  dirty,
  saving,
  conflict,
  nameConflict,
  groups,
  onChange,
  onSave,
  onDelete,
}: RuleEditorProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  useEffect(() => setActiveIndex(0), [rule.id]);

  const url = useMemo(
    () => `${baseUrl}${rule.path.startsWith('/') ? rule.path : `/${rule.path}`}`,
    [baseUrl, rule.path],
  );

  const responses = rule.responses ?? [];
  const index = Math.min(activeIndex, Math.max(0, responses.length - 1));
  const active: ResponseEntry = responses[index] ?? createResponseEntry();
  const multiple = responses.length > 1;
  const enabledCount = responses.filter((item) => item.enabled !== false).length;
  const cycling = enabledCount > 1;
  const hint =
    enabledCount === 0
      ? '全部档位已停用：仍返回第 1 档作为兜底。'
      : !multiple
        ? '每档都是完整响应配置；添加响应即可组成序列。'
        : !cycling
          ? '只有 1 档启用：每次请求都固定返回这一档，不轮询。'
          : enabledCount < responses.length
            ? `已启用 ${enabledCount}/${responses.length} 档；停用档跳过轮询、配置保留，其余按顺序循环返回。`
            : '每档都是完整配置；按顺序循环返回第 1、2、3… 档，然后重复。';

  const patchResponse = (target: number, patch: Partial<ResponseEntry>) =>
    onChange({
      responses: responses.map((item, position) =>
        position === target ? { ...item, ...patch } : item,
      ),
    });

  const addResponse = () => {
    const copy: ResponseEntry = {
      ...active,
      id: uid(),
      label: '',
      enabled: true,
      headers: active.headers.map((header) => ({ ...header })),
      schema: structuredClone(active.schema),
    };
    onChange({ responses: [...responses, copy] });
    setActiveIndex(responses.length);
  };

  const removeResponse = (target: number) => {
    const next = removeSlot(responses, target);
    if (next === responses) return;
    onChange({ responses: next });
    setActiveIndex((current) => nextActiveIndex(current, target, responses.length));
  };

  // A disabled slot is never served; half-written JSON there must not block
  // saving the rest of the rule.
  const jsonOk = responses.every(
    (item) => item.enabled === false || item.responseType !== 'json' || isValidJson(item.body),
  );

  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="truncate text-[16px] font-medium text-fg">
              {rule.name || '未命名接口'}
            </h2>
            {dirty ? <span className="text-[12px] text-warn">未保存</span> : null}
          </div>
          <button
            type="button"
            onClick={() => {
              copyText(url);
              toast('已复制完整 Mock URL', 'info');
            }}
            className="mt-1 flex min-w-0 cursor-pointer items-center gap-2 font-mono text-[12px] tabular-nums text-muted-300 transition-colors hover:text-brand-200"
          >
            <Link2 size={16} strokeWidth={1.5} className="shrink-0" />
            <span className="truncate">
              {rule.method} {url}
            </span>
            <Copy size={16} strokeWidth={1.5} className="shrink-0" />
          </button>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            title="复制 HTTPie 命令"
            onClick={() => {
              // 响应头/响应体是返回给客户端的内容，不能作为请求内容拼进命令
              copyText(buildHttpie({ method: rule.method, url }));
              toast('已复制 HTTPie 命令', 'info');
            }}
          >
            <Terminal size={16} strokeWidth={1.5} />
            HTTPie
          </Button>
          <Button variant="ghost" onClick={onDelete}>
            <Trash2 size={16} strokeWidth={1.5} />
            删除
          </Button>
          <Button
            variant="primary"
            onClick={onSave}
            disabled={saving || !jsonOk || nameConflict}
            title={nameConflict ? '接口名称与其他规则重复，请先更换名称' : undefined}
          >
            <Save size={16} strokeWidth={1.5} />
            {saving ? '保存中…' : '保存'}
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {conflict ? (
          <div className="mb-4 flex items-start gap-2 rounded-lg border border-line bg-fill px-3 py-2 text-[13px] text-muted-200">
            <AlertTriangle size={16} strokeWidth={1.5} className="mt-px shrink-0 text-warn" />
            <span>
              存在 {conflict.ids.length} 条相同规则{' '}
              <span className="font-mono">{conflict.key}</span>
              ，带条件的规则优先命中，其余按创建时间取最新
              {conflict.activeId === rule.id ? '（当前这条优先）' : '（当前这条被遮蔽）'}。
            </span>
          </div>
        ) : null}

        <div className="glass rounded-xl p-4">
          <p className="panel-title mb-3">基础配置</p>
          <BasicSettings
            rule={rule}
            groups={groups}
            nameConflict={nameConflict}
            onChange={onChange}
          />
        </div>

        <div className="glass mt-4 rounded-xl p-4">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2">
              <p className="panel-title">响应</p>
              <span className="rounded bg-fill px-1.5 font-mono text-[12px] text-muted-300">
                {enabledCount === responses.length
                  ? `${responses.length} 档`
                  : `${enabledCount}/${responses.length} 档启用`}
              </span>
            </div>
          </div>

          <div className="mb-3 flex flex-wrap items-center gap-1.5 border-b border-line pb-3">
            {responses.map((item, position) => {
              const enabled = item.enabled !== false;
              return (
                <button
                  key={item.id}
                  type="button"
                  title={`${item.label || `第 ${position + 1} 档响应`}${enabled ? '' : '（已停用）'}`}
                  onClick={() => setActiveIndex(position)}
                  className={cn(
                    'cursor-pointer rounded-md border px-2 py-1.5 font-mono text-[12px] transition-colors duration-150',
                    position === index
                      ? 'border-brand-500/40 bg-brand-500/10 text-fg'
                      : 'border-line text-muted-300 hover:text-muted-100',
                    !enabled && 'opacity-55 line-through',
                  )}
                >
                  #{position + 1}
                  {position === 0 ? ' 默认' : ''}
                  {item.label ? ` ${item.label}` : ''}
                </button>
              );
            })}
            <Button variant="ghost" size="sm" onClick={addResponse}>
              <Plus size={16} strokeWidth={1.5} /> 添加响应
            </Button>
            {multiple ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  api
                    .resetSequence(rule.id)
                    .then(() => toast('序列计数已重置', 'info'))
                    .catch(() => toast('重置失败', 'error'));
                }}
              >
                <RotateCcw size={16} strokeWidth={1.5} /> 重置计数
              </Button>
            ) : null}
          </div>

          <div className="mb-3 flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2">
              <Switch
                title={active.enabled === false ? '启用该档' : '停用该档（配置保留）'}
                aria-label="当前档启用开关"
                checked={active.enabled !== false}
                onCheckedChange={(value) => patchResponse(index, { enabled: value })}
              />
              <span className="text-[13px] text-muted-200">启用该档</span>
            </div>
            {multiple ? (
              <Button
                variant="ghost"
                size="sm"
                title={index === 0 ? '删除默认档（下一档自动成为默认）' : '删除该档响应'}
                onClick={() => removeResponse(index)}
              >
                <Trash2 size={16} strokeWidth={1.5} /> 删除该档
              </Button>
            ) : null}
            <span className="ml-2 text-[13px] text-muted-300">备注</span>
            <Input
              value={active.label}
              placeholder="首次成功 / 再次失败"
              className="max-w-[280px]"
              onChange={(event) => patchResponse(index, { label: event.target.value })}
            />
          </div>
          <p className="mb-3 text-[12px] leading-relaxed text-muted-300">
            {hint}
            {multiple ? ' 任意档可删；删掉默认档后下一档自动成为默认。' : ''}
          </p>

          <ResponseEditor
            key={active.id}
            response={active}
            onChange={(patch) => patchResponse(index, patch)}
          />
        </div>
      </div>
    </section>
  );
}
