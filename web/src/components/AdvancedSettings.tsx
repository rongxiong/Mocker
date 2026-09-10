import { useState } from 'react';
import { ChevronDown, ChevronRight, Filter, Plus, Repeat, RotateCcw, Trash2 } from 'lucide-react';
import type {
  ConditionOperator,
  ConditionSource,
  MockRule,
  ResponseVariant,
  RuleCondition,
} from '@shared/types';
import { Button } from './ui/button';
import { Input, Select } from './ui/input';
import { LazyCodeEditor as CodeEditor } from './LazyCodeEditor';
import { CONDITION_OPERATORS, CONDITION_SOURCES } from '@/lib/constants';
import { api } from '@/lib/api';
import { uid } from '@shared/defaults';
import { toast } from './ui/toast';

interface AdvancedSettingsProps {
  rule: MockRule;
  onChange: (patch: Partial<MockRule>) => void;
}

function newCondition(): RuleCondition {
  return { id: uid(), source: 'query', key: '', op: 'eq', value: '' };
}

function newVariant(): ResponseVariant {
  return { id: uid(), label: '', statusCode: '', delayMs: '', body: '' };
}

export function AdvancedSettings({ rule, onChange }: AdvancedSettingsProps) {
  const [openConditions, setOpenConditions] = useState((rule.conditions ?? []).length > 0);
  const [openVariants, setOpenVariants] = useState((rule.variants ?? []).length > 0);

  const conditions = rule.conditions ?? [];
  const variants = rule.variants ?? [];

  const patchCondition = (id: string, patch: Partial<RuleCondition>) =>
    onChange({
      conditions: conditions.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    });

  const patchVariant = (id: string, patch: Partial<ResponseVariant>) =>
    onChange({ variants: variants.map((item) => (item.id === id ? { ...item, ...patch } : item)) });

  return (
    <div className="glass mt-4 rounded-2xl p-4">
      <p className="panel-title mb-3">高级</p>

      <div className="rounded-xl border border-white/[0.07] bg-white/[0.02]">
        <button
          type="button"
          onClick={() => setOpenConditions(!openConditions)}
          className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left"
        >
          {openConditions ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          <Filter size={12} className="text-brand-300" />
          <span className="text-[12px] font-medium text-muted-100">条件匹配</span>
          {conditions.length > 0 ? (
            <span className="rounded-md bg-brand-500/20 px-1.5 text-[10.5px] text-brand-200">
              {conditions.length}
            </span>
          ) : null}
          <span className="ml-auto text-[11px] text-muted-300">全部满足才命中该规则</span>
        </button>

        {openConditions ? (
          <div className="space-y-1.5 border-t border-white/[0.06] p-3">
            {conditions.length === 0 ? (
              <p className="text-[11.5px] text-muted-300">
                无条件是默认命中。添加条件后，可让同一路径按 query / header / body 返回不同内容。
              </p>
            ) : null}
            {conditions.map((condition) => (
              <div key={condition.id} className="flex items-center gap-1.5">
                <Select
                  value={condition.source}
                  className="w-[86px] font-mono"
                  onChange={(event) =>
                    patchCondition(condition.id, { source: event.target.value as ConditionSource })
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
                  className="h-8 w-[130px] font-mono"
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
                  placeholder={condition.op === 'exists' ? '（无需填值）' : 'value'}
                  className="h-8 flex-1 font-mono"
                  disabled={condition.op === 'exists'}
                  onChange={(event) => patchCondition(condition.id, { value: event.target.value })}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() =>
                    onChange({ conditions: conditions.filter((item) => item.id !== condition.id) })
                  }
                >
                  <Trash2 size={12} className="text-muted-300" />
                </Button>
              </div>
            ))}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onChange({ conditions: [...conditions, newCondition()] })}
            >
              <Plus size={12} /> 添加条件
            </Button>
          </div>
        ) : null}
      </div>

      <div className="mt-2 rounded-xl border border-white/[0.07] bg-white/[0.02]">
        <button
          type="button"
          onClick={() => setOpenVariants(!openVariants)}
          className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left"
        >
          {openVariants ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          <Repeat size={12} className="text-accent-300" />
          <span className="text-[12px] font-medium text-muted-100">响应序列</span>
          {variants.length > 0 ? (
            <span className="rounded-md bg-accent-400/20 px-1.5 text-[10.5px] text-accent-300">
              {variants.length}
            </span>
          ) : null}
          <span className="ml-auto text-[11px] text-muted-300">
            按顺序循环返回，用于模拟首次成功/再次失败
          </span>
        </button>

        {openVariants ? (
          <div className="space-y-2 border-t border-white/[0.06] p-3">
            {variants.length === 0 ? (
              <p className="text-[11.5px] text-muted-300">
                留空的字段沿用规则本身的配置，只覆盖填写的项。
              </p>
            ) : null}
            {variants.map((variant, index) => (
              <div key={variant.id} className="rounded-lg border border-white/[0.06] p-2">
                <div className="flex items-center gap-1.5">
                  <span className="w-[34px] shrink-0 font-mono text-[11px] text-accent-300">
                    #{index + 1}
                  </span>
                  <Input
                    value={variant.label}
                    placeholder="备注（如：首次成功）"
                    className="h-7 flex-1"
                    onChange={(event) => patchVariant(variant.id, { label: event.target.value })}
                  />
                  <Input
                    value={variant.statusCode}
                    placeholder="状态码"
                    className="h-7 w-[78px] font-mono"
                    onChange={(event) =>
                      patchVariant(variant.id, { statusCode: event.target.value })
                    }
                  />
                  <Input
                    value={variant.delayMs}
                    placeholder="延迟 ms"
                    className="h-7 w-[78px] font-mono"
                    onChange={(event) => patchVariant(variant.id, { delayMs: event.target.value })}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() =>
                      onChange({ variants: variants.filter((item) => item.id !== variant.id) })
                    }
                  >
                    <Trash2 size={12} className="text-muted-300" />
                  </Button>
                </div>
                <div className="mt-1.5">
                  <CodeEditor
                    value={variant.body}
                    language={rule.responseType === 'html' ? 'html' : 'json'}
                    height="110px"
                    placeholder="覆盖响应体（留空则使用规则内容）"
                    onChange={(value) => patchVariant(variant.id, { body: value })}
                  />
                </div>
              </div>
            ))}
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onChange({ variants: [...variants, newVariant()] })}
              >
                <Plus size={12} /> 添加一档
              </Button>
              {variants.length > 0 ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    api
                      .resetVariants(rule.id)
                      .then(() => toast('序列计数已重置', 'info'))
                      .catch(() => toast('重置失败', 'error'));
                  }}
                >
                  <RotateCcw size={12} /> 重置计数
                </Button>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
