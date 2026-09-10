import { useState } from 'react';
import { ChevronDown, ChevronRight, Plus, Trash2 } from 'lucide-react';
import type { SchemaField, SchemaFieldType, StringGenMode } from '@shared/types';
import { Input, Select } from './ui/input';
import { Button } from './ui/button';
import {
  DATE_FORMATS,
  FAKER_PRESETS,
  FIELD_TYPES,
  REGEX_PRESETS,
  STRING_GEN_MODES,
} from '@/lib/constants';
import { cn } from '@/lib/utils';
import { createDefaultField } from '@shared/defaults';

interface SchemaFieldRowProps {
  field: SchemaField;
  onChange: (next: SchemaField) => void;
  onRemove?: () => void;
  depth?: number;
  /** array item definition hides the name input */
  isItem?: boolean;
}

function splitValues(raw: string): string[] {
  return raw
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

export function SchemaFieldRow({
  field,
  onChange,
  onRemove,
  depth = 0,
  isItem = false,
}: SchemaFieldRowProps) {
  const [open, setOpen] = useState(true);
  const expandable = field.type === 'object' || field.type === 'array';

  const patch = (next: Partial<SchemaField>) => onChange({ ...field, ...next });

  const changeType = (type: SchemaFieldType) => {
    const fresh = createDefaultField(type, field.name);
    onChange({ ...fresh, id: field.id });
  };

  const renderParams = () => {
    switch (field.type) {
      case 'string': {
        const mode = field.stringGen ?? 'regex';
        return (
          <div className="flex flex-wrap items-center gap-1.5">
            <Select
              value={mode}
              onChange={(event) => patch({ stringGen: event.target.value as StringGenMode })}
              className="w-[92px]"
            >
              {STRING_GEN_MODES.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </Select>
            {mode === 'regex' ? (
              <>
                <Input
                  value={field.pattern ?? ''}
                  placeholder="^1[3-9]\d{9}$"
                  className="w-[190px] font-mono"
                  onChange={(event) => patch({ pattern: event.target.value })}
                />
                <Select
                  value=""
                  className="w-[110px]"
                  onChange={(event) => {
                    if (event.target.value) patch({ pattern: event.target.value });
                  }}
                >
                  <option value="">正则模板…</option>
                  {REGEX_PRESETS.map((preset) => (
                    <option key={preset.label} value={preset.pattern}>
                      {preset.label}
                    </option>
                  ))}
                </Select>
              </>
            ) : null}
            {mode === 'faker' ? (
              <>
                <Input
                  value={field.fakerTemplate ?? ''}
                  placeholder="person.fullName"
                  list="faker-presets"
                  className="w-[180px] font-mono"
                  onChange={(event) => patch({ fakerTemplate: event.target.value })}
                />
                <datalist id="faker-presets">
                  {FAKER_PRESETS.map((preset) => (
                    <option key={preset} value={preset} />
                  ))}
                </datalist>
              </>
            ) : null}
            {mode === 'enum' ? (
              <Input
                value={(field.values ?? []).join(', ')}
                placeholder="active, pending, archived"
                className="w-[220px]"
                onChange={(event) => patch({ values: splitValues(event.target.value) })}
              />
            ) : null}
            {mode === 'const' ? (
              <Input
                value={field.constValue ?? ''}
                placeholder="固定值"
                className="w-[180px]"
                onChange={(event) => patch({ constValue: event.target.value })}
              />
            ) : null}
          </div>
        );
      }
      case 'int':
      case 'number':
        return (
          <div className="flex items-center gap-1.5">
            <Input
              type="number"
              value={field.min ?? 0}
              className="w-[86px] font-mono"
              onChange={(event) => patch({ min: Number(event.target.value) })}
            />
            <span className="text-muted-300">~</span>
            <Input
              type="number"
              value={field.max ?? 100}
              className="w-[86px] font-mono"
              onChange={(event) => patch({ max: Number(event.target.value) })}
            />
            {field.type === 'number' ? (
              <span className="flex items-center gap-1 text-[11px] text-muted-300">
                小数位
                <Input
                  type="number"
                  min={0}
                  max={8}
                  value={field.precision ?? 2}
                  className="w-[62px] font-mono"
                  onChange={(event) => patch({ precision: Number(event.target.value) })}
                />
              </span>
            ) : null}
          </div>
        );
      case 'boolean':
        return (
          <span className="flex items-center gap-1.5 text-[11.5px] text-muted-300">
            true 概率
            <Input
              type="number"
              step={0.1}
              min={0}
              max={1}
              value={field.trueRatio ?? 0.5}
              className="w-[70px] font-mono"
              onChange={(event) => patch({ trueRatio: Number(event.target.value) })}
            />
          </span>
        );
      case 'date':
        return (
          <div className="flex items-center gap-1.5">
            <Select
              value={field.dateFormat ?? 'iso'}
              className="w-[110px]"
              onChange={(event) =>
                patch({ dateFormat: event.target.value as SchemaField['dateFormat'] })
              }
            >
              {DATE_FORMATS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </Select>
            {field.dateFormat === 'custom' ? (
              <Input
                value={field.dateCustom ?? ''}
                placeholder="YYYY-MM-DD HH:mm:ss"
                className="w-[170px] font-mono"
                onChange={(event) => patch({ dateCustom: event.target.value })}
              />
            ) : null}
          </div>
        );
      case 'enum':
        return (
          <Input
            value={(field.values ?? []).join(', ')}
            placeholder="可选值，英文逗号分隔"
            className="w-[260px]"
            onChange={(event) => patch({ values: splitValues(event.target.value) })}
          />
        );
      case 'array':
        return (
          <span className="flex items-center gap-1.5 text-[11.5px] text-muted-300">
            元素数量
            <Input
              type="number"
              min={0}
              value={field.itemCountMin ?? 1}
              className="w-[64px] font-mono"
              onChange={(event) => patch({ itemCountMin: Number(event.target.value) })}
            />
            <span>~</span>
            <Input
              type="number"
              min={0}
              value={field.itemCountMax ?? 3}
              className="w-[64px] font-mono"
              onChange={(event) => patch({ itemCountMax: Number(event.target.value) })}
            />
          </span>
        );
      default:
        return (
          <span className="text-[11.5px] text-muted-300">
            {field.type === 'object'
              ? `${(field.children ?? []).length} 个子字段`
              : '自动生成随机值'}
          </span>
        );
    }
  };

  return (
    <div className={cn(depth > 0 && 'relative pl-5')}>
      {depth > 0 ? (
        <span className="absolute left-[6px] top-0 h-full w-px bg-white/[0.09]" aria-hidden />
      ) : null}
      <div className="group rounded-xl border border-white/[0.06] bg-white/[0.02] p-2 transition-colors hover:border-white/[0.12] hover:bg-white/[0.04]">
        <div className="flex flex-wrap items-center gap-1.5">
          {expandable ? (
            <button
              type="button"
              onClick={() => setOpen(!open)}
              className="cursor-pointer rounded p-0.5 text-muted-300 transition-colors hover:bg-white/10 hover:text-muted-100"
            >
              {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
            </button>
          ) : (
            <span className="w-[18px]" />
          )}

          {isItem ? (
            <span className="rounded-md border border-accent-400/30 bg-accent-400/10 px-1.5 py-[1px] font-mono text-[10.5px] text-accent-300">
              item
            </span>
          ) : (
            <Input
              value={field.name}
              placeholder="字段名"
              className="w-[130px] font-mono"
              onChange={(event) => patch({ name: event.target.value })}
            />
          )}

          <Select
            value={field.type}
            onChange={(event) => changeType(event.target.value as SchemaFieldType)}
            className="w-[104px] font-mono"
          >
            {FIELD_TYPES.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </Select>

          {!isItem ? (
            <span className="flex items-center gap-1 text-[11px] text-muted-300">
              <button
                type="button"
                onClick={() => patch({ optional: !field.optional })}
                className={cn(
                  'cursor-pointer rounded-md border px-1.5 py-[1px] transition-colors',
                  field.optional
                    ? 'border-warn/40 bg-warn/15 text-warn'
                    : 'border-white/[0.08] text-muted-300 hover:text-muted-100',
                )}
                title="可选字段按概率出现"
              >
                可选
              </button>
              {field.optional ? (
                <Input
                  type="number"
                  step={0.1}
                  min={0}
                  max={1}
                  value={field.optionalRatio ?? 0.5}
                  className="h-7 w-[62px] font-mono"
                  title="出现概率 0~1"
                  onChange={(event) => patch({ optionalRatio: Number(event.target.value) })}
                />
              ) : null}
            </span>
          ) : null}

          {renderParams()}

          {onRemove ? (
            <Button
              variant="ghost"
              size="icon"
              className="ml-auto opacity-0 transition-opacity group-hover:opacity-100"
              title="删除字段"
              onClick={onRemove}
            >
              <Trash2 size={13} className="text-muted-300 hover:text-rose-300" />
            </Button>
          ) : null}
        </div>

        {expandable && open ? (
          <div className="mt-2 space-y-1.5 border-t border-white/[0.06] pt-2">
            {field.type === 'object' ? (
              <>
                {(field.children ?? []).map((child) => (
                  <SchemaFieldRow
                    key={child.id}
                    field={child}
                    depth={depth + 1}
                    onChange={(next) =>
                      patch({
                        children: (field.children ?? []).map((item) =>
                          item.id === child.id ? next : item,
                        ),
                      })
                    }
                    onRemove={() =>
                      patch({
                        children: (field.children ?? []).filter((item) => item.id !== child.id),
                      })
                    }
                  />
                ))}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    patch({
                      children: [...(field.children ?? []), createDefaultField('string', '')],
                    })
                  }
                >
                  <Plus size={12} /> 子字段
                </Button>
              </>
            ) : (
              <SchemaFieldRow
                isItem
                depth={depth + 1}
                field={field.item ?? createDefaultField('string', 'item')}
                onChange={(next) => patch({ item: next })}
              />
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
