import type { AbortMode, HttpMethod, MockRule } from '@shared/types';
import { HTTP_METHODS } from '@shared/types';
import { Input, Label, Select } from './ui/input';
import { Switch } from './ui/switch';
import { ABORT_MODES } from '@/lib/constants';
import { ConditionEditor } from './ConditionEditor';

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
  const conditions = rule.conditions ?? [];
  const conditionsEnabled = rule.conditionsEnabled !== false;

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

      <ConditionEditor
        key={rule.id}
        conditions={conditions}
        conditionsEnabled={conditionsEnabled}
        onChange={(next) => onChange({ conditions: next })}
        onEnabledChange={(value) => onChange({ conditionsEnabled: value })}
        title="条件匹配"
        activeHint="全部满足才命中该规则"
        emptyHint="无条件是默认命中。添加条件后，可让同一路径按 query / header / body 返回不同内容。"
        disabledHint="已关闭：规则不再检查任何请求条件，所有请求都返回默认响应。已填条件会保留，重新打开开关即恢复。"
      />

      <p className="font-mono text-[12px] text-muted-300">
        规则 ID：{rule.id.slice(0, 8)} · 更新于 {new Date(rule.updatedAt).toLocaleString()}
      </p>
    </div>
  );
}
