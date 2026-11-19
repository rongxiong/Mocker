import { useState } from 'react';
import { ChevronDown, ChevronRight, Filter, Plus, Trash2 } from 'lucide-react';
import type { ConditionOperator, ConditionSource, RuleCondition } from '@shared/types';
import { Input, Select } from './ui/input';
import { Switch } from './ui/switch';
import { Button } from './ui/button';
import { CONDITION_OPERATORS, CONDITION_SOURCES } from '@/lib/constants';
import { uid } from '@shared/defaults';

function newCondition(): RuleCondition {
  return { id: uid(), source: 'query', key: '', op: 'eq', value: '' };
}

interface ConditionEditorProps {
  conditions: RuleCondition[];
  conditionsEnabled: boolean;
  onChange: (conditions: RuleCondition[]) => void;
  onEnabledChange: (enabled: boolean) => void;
  title: string;
  /** short hint on the right of the header while the switch is on */
  activeHint: string;
  emptyHint: string;
  disabledHint: string;
  /** top divider when the panel sits below other sections (default) */
  divider?: boolean;
}

/** Shared by rule-level conditions in BasicSettings and per-slot conditions. */
export function ConditionEditor({
  conditions,
  conditionsEnabled,
  onChange,
  onEnabledChange,
  title,
  activeHint,
  emptyHint,
  disabledHint,
  divider = true,
}: ConditionEditorProps) {
  const [open, setOpen] = useState(conditions.length > 0);

  const patchCondition = (id: string, patch: Partial<RuleCondition>) =>
    onChange(conditions.map((item) => (item.id === id ? { ...item, ...patch } : item)));

  return (
    <div className={divider ? 'border-t border-line pt-3' : undefined}>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-left"
        >
          {open && conditionsEnabled ? (
            <ChevronDown size={16} strokeWidth={1.5} />
          ) : (
            <ChevronRight size={16} strokeWidth={1.5} />
          )}
          <Filter size={16} strokeWidth={1.5} className="text-muted-300" />
          <span className="text-[14px] font-medium text-fg">{title}</span>
          {conditions.length > 0 ? (
            <span className="rounded bg-fill px-1.5 font-mono text-[12px] text-muted-300">
              {conditions.length}
            </span>
          ) : null}
        </button>
        <span className="hidden truncate text-[12px] text-muted-300 md:inline">
          {conditionsEnabled ? activeHint : '不参与匹配'}
        </span>
        <Switch
          title="启用条件匹配"
          aria-label={`${title}开关`}
          checked={conditionsEnabled}
          onCheckedChange={onEnabledChange}
        />
      </div>

      {conditionsEnabled && open ? (
        <div className="mt-2 space-y-1.5">
          {conditions.length === 0 ? (
            <p className="text-[13px] text-muted-300">{emptyHint}</p>
          ) : null}
          {conditions.map((condition) => (
            <div key={condition.id} className="flex flex-wrap items-center gap-1.5">
              <Select
                value={condition.source}
                className="w-[104px] shrink-0 font-mono"
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
                className="w-[130px] shrink-0 font-mono"
                onChange={(event) => patchCondition(condition.id, { key: event.target.value })}
              />
              <Select
                value={condition.op}
                className="w-[84px] shrink-0"
                onChange={(event) =>
                  patchCondition(condition.id, {
                    op: event.target.value as ConditionOperator,
                  })
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
                className="min-w-[140px] flex-1 font-mono"
                disabled={condition.op === 'exists'}
                onChange={(event) => patchCondition(condition.id, { value: event.target.value })}
              />
              <Button
                variant="ghost"
                size="icon"
                className="shrink-0"
                onClick={() => onChange(conditions.filter((item) => item.id !== condition.id))}
              >
                <Trash2 size={16} strokeWidth={1.5} className="text-muted-300" />
              </Button>
            </div>
          ))}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onChange([...conditions, newCondition()])}
          >
            <Plus size={16} strokeWidth={1.5} /> 添加条件
          </Button>
        </div>
      ) : null}

      {conditionsEnabled ? null : <p className="mt-2 text-[13px] text-muted-300">{disabledHint}</p>}
    </div>
  );
}
