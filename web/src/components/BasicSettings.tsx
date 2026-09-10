import { Plus, Trash2, Timer } from 'lucide-react';
import type { HeaderEntry, HttpMethod, MockRule } from '@shared/types';
import { HTTP_METHODS } from '@shared/types';
import { Input, Label, Select } from './ui/input';
import { Switch } from './ui/switch';
import { Button } from './ui/button';
import { ABORT_MODES, COMMON_STATUS_CODES, ENVELOPES } from '@/lib/constants';
import type { AbortMode, EnvelopeType } from '@shared/types';

interface BasicSettingsProps {
  rule: MockRule;
  groups?: string[];
  onChange: (patch: Partial<MockRule>) => void;
}

export function BasicSettings({ rule, groups = [], onChange }: BasicSettingsProps) {
  const updateHeaders = (headers: HeaderEntry[]) => onChange({ headers });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="rule-name">接口名称</Label>
          <Input
            id="rule-name"
            value={rule.name}
            placeholder="例如：用户详情"
            onChange={(event) => onChange({ name: event.target.value })}
          />
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
        <div>
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

      <div className="grid grid-cols-[110px_1fr] gap-3">
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

      <div className="grid grid-cols-[130px_130px_1fr] gap-3">
        <div>
          <Label htmlFor="rule-delay" className="flex items-center gap-1">
            <Timer size={11} /> 延迟 (ms)
          </Label>
          <Input
            id="rule-delay"
            type="number"
            min={0}
            max={60000}
            value={rule.delayMs}
            onChange={(event) =>
              onChange({ delayMs: Math.max(0, Number(event.target.value) || 0) })
            }
          />
        </div>
        <div>
          <Label htmlFor="rule-jitter">随机抖动 (ms)</Label>
          <Input
            id="rule-jitter"
            type="number"
            min={0}
            max={60000}
            value={rule.delayJitterMs}
            onChange={(event) =>
              onChange({ delayJitterMs: Math.max(0, Number(event.target.value) || 0) })
            }
          />
        </div>
        <div>
          <Label htmlFor="rule-status">状态码</Label>
          <Select
            id="rule-status"
            value={String(rule.statusCode)}
            onChange={(event) => onChange({ statusCode: Number(event.target.value) })}
            className="w-full font-mono"
          >
            {[...new Set([...COMMON_STATUS_CODES, rule.statusCode])]
              .sort((a, b) => a - b)
              .map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
          </Select>
        </div>
      </div>

      <div>
        <Label>响应头</Label>
        <div className="space-y-1.5">
          {rule.headers.map((entry, index) => (
            <div key={entry.key + index} className="flex items-center gap-2">
              <Input
                value={entry.key}
                placeholder="X-Request-Id"
                className="font-mono"
                onChange={(event) =>
                  updateHeaders(
                    rule.headers.map((item, i) =>
                      i === index ? { ...item, key: event.target.value } : item,
                    ),
                  )
                }
              />
              <Input
                value={entry.value}
                placeholder="value"
                className="font-mono"
                onChange={(event) =>
                  updateHeaders(
                    rule.headers.map((item, i) =>
                      i === index ? { ...item, value: event.target.value } : item,
                    ),
                  )
                }
              />
              <Button
                variant="ghost"
                size="icon"
                title="删除"
                onClick={() => updateHeaders(rule.headers.filter((_, i) => i !== index))}
              >
                <Trash2 size={13} />
              </Button>
            </div>
          ))}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => updateHeaders([...rule.headers, { key: '', value: '' }])}
          >
            <Plus size={12} /> 添加响应头
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-[1fr_200px_160px_auto] items-end gap-3 border-t border-white/[0.07] pt-3">
        <div>
          <Label htmlFor="rule-content-type">Content-Type（留空自动推断）</Label>
          <Input
            id="rule-content-type"
            value={rule.contentType}
            placeholder="application/json; charset=utf-8"
            className="font-mono"
            onChange={(event) => onChange({ contentType: event.target.value })}
          />
        </div>
        <div>
          <Label htmlFor="rule-envelope">响应信封（仅 JSON / 结构化，JS 响应需自行包装）</Label>
          <Select
            id="rule-envelope"
            value={rule.envelope ?? 'none'}
            onChange={(event) => onChange({ envelope: event.target.value as EnvelopeType })}
            className="w-full"
          >
            {ENVELOPES.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </Select>
        </div>
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
          <span className="text-[11px] uppercase tracking-wider text-muted-300">启用</span>
          <Switch checked={rule.enabled} onCheckedChange={(enabled) => onChange({ enabled })} />
        </div>
      </div>

      {rule.abort !== 'none' ? (
        <p className="rounded-lg border border-amber-400/25 bg-amber-400/10 px-2.5 py-1.5 text-[11.5px] text-amber-200">
          {ABORT_MODES.find((item) => item.value === rule.abort)?.hint}
        </p>
      ) : null}

      <p className="font-mono text-[11px] text-muted-300">
        规则 ID：{rule.id.slice(0, 8)} · 更新于 {new Date(rule.updatedAt).toLocaleString()}
      </p>
    </div>
  );
}
