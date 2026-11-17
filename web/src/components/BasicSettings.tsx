import { useState } from 'react';
import { ChevronDown, ChevronRight, Filter, Plus, Trash2 } from 'lucide-react';
import type {
  AbortMode,
  ConditionOperator,
  ConditionSource,
  HttpMethod,
  MockRule,
  RuleCondition,
} from '@shared/types';
import { HTTP_METHODS } from '@shared/types';
import { Input, Label, Select } from './ui/input';
import { Switch } from './ui/switch';
import { Button } from './ui/button';
import { ABORT_MODES, CONDITION_OPERATORS, CONDITION_SOURCES } from '@/lib/constants';
import { uid } from '@shared/defaults';

function newCondition(): RuleCondition {
  return { id: uid(), source: 'query', key: '', op: 'eq', value: '' };
}

interface BasicSettingsProps {
  rule: MockRule;
  groups?: string[];
  /** another rule already uses the current (trimmed) name */
  nameConflict?: boolean;
  onChange: (patch: Partial<MockRule>) => void;
}

export function BasicSettings({
  rule,
  groups = [],
  nameConflict = false,
  onChange,
}: BasicSettingsProps) {
  const [openConditions, setOpenConditions] = useState((rule.conditions ?? []).length > 0);

  const conditions = rule.conditions ?? [];
  const conditionsEnabled = rule.conditionsEnabled !== false;

  const patchCondition = (id: string, patch: Partial<RuleCondition>) =>
    onChange({
      conditions: conditions.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="rule-name">接口名称</Label>
          <Input
            id="rule-name"
            value={rule.name}
            placeholder="例如：用户详情"
            className={nameConflict ? 'border-danger focus:border-danger' : undefined}
            onChange={(event) => onChange({ name: event.target.value })}
          />
          {nameConflict ? (
            <p className="mt-1 text-[12px] text-danger">已存在同名接口，请更换名称后再保存</p>
          ) : null}
        </div>
        <div>
          <Label htmlFor="rule-desc">备注</Label>
          <Input
            id="rule-desc"
            value={rule.description}
            placeholder="这个接口返回什么？"
            onChange={(event) => onChange({ description: event.target.value })}
          />
        </div>
        <div className="sm:col-span-2">
          <Label htmlFor="rule-group">分组</Label>
          <Input
            id="rule-group"
            list="group-options"
            value={rule.group ?? ''}
            placeholder="例如：订单 / 用户"
            onChange={(event) => onChange({ group: event.target.value })}
          />
          <datalist id="group-options">
            {groups.map((group) => (
              <option key={group} value={group} />
            ))}
          </datalist>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[130px_1fr]">
        <div>
          <Label htmlFor="rule-method">HTTP 方法</Label>
          <Select
            id="rule-method"
            value={rule.method}
            onChange={(event) => onChange({ method: event.target.value as HttpMethod })}
            className="w-full font-mono"
          >
            {HTTP_METHODS.map((method) => (
              <option key={method} value={method}>
                {method}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="rule-path">路径（支持 :param）</Label>
          <Input
            id="rule-path"
            value={rule.path}
            placeholder="/api/users/:id"
            className="font-mono"
            onChange={(event) => onChange({ path: event.target.value })}
          />
        </div>
      </div>

      <div className="grid grid-cols-[1fr_auto] items-end gap-3 border-t border-line pt-3">
        <div>
          <Label htmlFor="rule-abort">连接行为</Label>
          <Select
            id="rule-abort"
            value={rule.abort ?? 'none'}
            onChange={(event) => onChange({ abort: event.target.value as AbortMode })}
            className="w-full"
          >
            {ABORT_MODES.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex items-center gap-2 pb-1">
          <span className="text-[13px] text-muted-300">启用</span>
          <Switch checked={rule.enabled} onCheckedChange={(enabled) => onChange({ enabled })} />
        </div>
      </div>

      {rule.abort !== 'none' ? (
        <p className="rounded-lg border border-line bg-fill px-3 py-2 text-[13px] text-muted-200">
          {ABORT_MODES.find((item) => item.value === rule.abort)?.hint}
        </p>
      ) : null}

      <div className="border-t border-line pt-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setOpenConditions(!openConditions)}
            className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-left"
          >
            {openConditions && conditionsEnabled ? (
              <ChevronDown size={16} strokeWidth={1.5} />
            ) : (
              <ChevronRight size={16} strokeWidth={1.5} />
            )}
            <Filter size={16} strokeWidth={1.5} className="text-muted-300" />
            <span className="text-[14px] font-medium text-fg">条件匹配</span>
            {conditions.length > 0 ? (
              <span className="rounded bg-fill px-1.5 font-mono text-[12px] text-muted-300">
                {conditions.length}
              </span>
            ) : null}
          </button>
          <span className="hidden truncate text-[12px] text-muted-300 md:inline">
            {conditionsEnabled ? '全部满足才命中该规则' : '不参与匹配'}
          </span>
          <Switch
            title="启用条件匹配"
            checked={conditionsEnabled}
            onCheckedChange={(value) => onChange({ conditionsEnabled: value })}
          />
        </div>

        {conditionsEnabled && openConditions ? (
          <div className="mt-2 space-y-1.5">
            {conditions.length === 0 ? (
              <p className="text-[13px] text-muted-300">
                无条件是默认命中。添加条件后，可让同一路径按 query / header / body 返回不同内容。
              </p>
            ) : null}
            {conditions.map((condition) => (
              <div key={condition.id} className="flex items-center gap-1.5">
                <Select
                  value={condition.source}
                  className="w-[86px] font-mono"
                  onChange={(event) =>
                    patchCondition(condition.id, {
                      source: event.target.value as ConditionSource,
                    })
                  }
                >
                  {CONDITION_SOURCES.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </Select>
                <Input
                  value={condition.key}
                  placeholder={condition.source === 'body' ? 'user.type' : 'key'}
                  className="w-[130px] font-mono"
                  onChange={(event) => patchCondition(condition.id, { key: event.target.value })}
                />
                <Select
                  value={condition.op}
                  className="w-[78px]"
                  onChange={(event) =>
                    patchCondition(condition.id, { op: event.target.value as ConditionOperator })
                  }
                >
                  {CONDITION_OPERATORS.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </Select>
                <Input
                  value={condition.value}
                  placeholder={condition.op === 'exists' ? '无需填值' : 'value'}
                  className="flex-1 font-mono"
                  disabled={condition.op === 'exists'}
                  onChange={(event) => patchCondition(condition.id, { value: event.target.value })}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() =>
                    onChange({
                      conditions: conditions.filter((item) => item.id !== condition.id),
                    })
                  }
                >
                  <Trash2 size={16} strokeWidth={1.5} className="text-muted-300" />
                </Button>
              </div>
            ))}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onChange({ conditions: [...conditions, newCondition()] })}
            >
              <Plus size={16} strokeWidth={1.5} /> 添加条件
            </Button>
          </div>
        ) : null}

        {conditionsEnabled ? null : (
          <p className="mt-2 text-[13px] text-muted-300">
            已关闭：规则不再检查任何请求条件，所有请求都返回默认响应。已填条件会保留，重新打开开关即恢复。
          </p>
        )}
      </div>

      <p className="font-mono text-[12px] text-muted-300">
        规则 ID：{rule.id.slice(0, 8)} · 更新于 {new Date(rule.updatedAt).toLocaleString()}
      </p>
    </div>
  );
}
