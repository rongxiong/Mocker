import { useState } from 'react';
import { FileJson, Loader2, Plus, Sparkles } from 'lucide-react';
import type { MockRule, SchemaField, SchemaRootType } from '@shared/types';
import { Button } from './ui/button';
import { Dialog } from './ui/dialog';
import { Tabs } from './ui/tabs';
import { SchemaFieldRow } from './SchemaFieldRow';
import { LazyCodeEditor as CodeEditor } from './LazyCodeEditor';
import { Input } from './ui/input';
import { api } from '@/lib/api';
import { createDefaultField } from '@shared/defaults';
import { inferSchema } from '@shared/schemaInfer';
import type { StringInferMode } from '@shared/schemaInfer';
import { toast } from './ui/toast';

interface SchemaEditorProps {
  fields: SchemaField[];
  onChange: (next: SchemaField[]) => void;
  root?: SchemaRootType;
  rootMin?: number;
  rootMax?: number;
  onRootChange?: (patch: Partial<MockRule>) => void;
}

const SAMPLE_INPUT = `{
  "id": 1001,
  "name": "Ada Lovelace",
  "phone": "13800138000",
  "email": "ada@example.com",
  "orderNo": "NO202601010001",
  "score": 9.5,
  "vip": true,
  "createdAt": "2026-01-01T08:00:00.000Z",
  "tags": ["admin", "beta"]
}`;

const STRING_MODES: Array<{ value: StringInferMode; label: string; hint: string }> = [
  { value: 'smart', label: '智能', hint: '识别手机号/订单号/日期/UUID，其余保留原值' },
  { value: 'faker', label: 'Faker', hint: '字符串统一用 faker 随机生成' },
  { value: 'const', label: '原值', hint: '字符串统一使用示例中的固定值' },
];

export function SchemaEditor({
  fields,
  onChange,
  root = 'object',
  rootMin = 2,
  rootMax = 5,
  onRootChange,
}: SchemaEditorProps) {
  const [sample, setSample] = useState('');
  const [loading, setLoading] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState('');
  const [stringMode, setStringMode] = useState<StringInferMode>('smart');
  const [importError, setImportError] = useState('');

  const generate = async () => {
    setLoading(true);
    const preview = await api
      .preview({ responseType: 'schema', schema: fields, method: 'GET', path: '/preview' })
      .catch(() => null);
    setSample(preview?.error ? `生成失败：${preview.error}` : (preview?.body ?? ''));
    setLoading(false);
  };

  const applyImport = (mode: 'append' | 'replace') => {
    setImportError('');
    let parsed: unknown;
    try {
      parsed = JSON.parse(importText);
    } catch {
      setImportError('JSON 解析失败，请检查示例内容');
      return;
    }
    const inferred = inferSchema(parsed, stringMode);
    if (inferred.length === 0) {
      setImportError('未能推断出字段，请提供一个 JSON 对象（或对象数组）示例');
      return;
    }
    onChange(mode === 'replace' ? inferred : [...fields, ...inferred]);
    setImportOpen(false);
    setImportText('');
    setSample('');
    toast(`已生成 ${inferred.length} 个字段`, 'success');
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <p className="text-[11.5px] text-muted-300">
            用字段树描述 JSON 结构，每次请求都会按规则随机生成（正则 / faker / 枚举）。
          </p>
          <span className="text-[11.5px] text-muted-300">根节点：</span>
          <Tabs
            value={root}
            onChange={(value: SchemaRootType) => onRootChange?.({ schemaRoot: value })}
            items={[
              { value: 'object', label: '对象', hint: '返回 { ... }' },
              { value: 'array', label: '数组', hint: '返回 [ { ... }, ... ]' },
            ]}
          />
          {root === 'array' ? (
            <span className="flex items-center gap-1 text-[11.5px] text-muted-300">
              数量
              <Input
                type="number"
                min={0}
                value={rootMin}
                className="h-7 w-[64px] font-mono"
                onChange={(event) => onRootChange?.({ schemaRootMin: Number(event.target.value) })}
              />
              ~
              <Input
                type="number"
                min={0}
                value={rootMax}
                className="h-7 w-[64px] font-mono"
                onChange={(event) => onRootChange?.({ schemaRootMax: Number(event.target.value) })}
              />
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="md" onClick={() => setImportOpen(true)}>
            <FileJson size={13} />
            导入 JSON 示例
          </Button>
          <Button variant="outline" size="md" onClick={() => void generate()} disabled={loading}>
            {loading ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
            生成样例
          </Button>
        </div>
      </div>

      <div className="space-y-1.5 rounded-xl border border-white/[0.07] bg-ink-900/40 p-2">
        {fields.length === 0 ? (
          <p className="py-6 text-center text-[12px] text-muted-300">
            还没有字段，可点击「添加字段」或「导入 JSON 示例」自动生成
          </p>
        ) : (
          fields.map((field) => (
            <SchemaFieldRow
              key={field.id}
              field={field}
              onChange={(next) =>
                onChange(fields.map((item) => (item.id === field.id ? next : item)))
              }
              onRemove={() => onChange(fields.filter((item) => item.id !== field.id))}
            />
          ))
        )}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onChange([...fields, createDefaultField('string', '')])}
        >
          <Plus size={12} /> 添加字段
        </Button>
      </div>

      {sample ? (
        <div className="animate-fade-in">
          <p className="mb-1 text-[10.5px] uppercase tracking-[0.14em] text-muted-300">随机样例</p>
          <CodeEditor value={sample} language="json" height="220px" readOnly />
        </div>
      ) : null}

      <Dialog
        open={importOpen}
        title="从 JSON 示例生成结构"
        description="粘贴一段 JSON 示例，自动推断字段类型；顶层为数组时取第一个元素作为模板。"
        width="max-w-2xl"
        onClose={() => setImportOpen(false)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setImportOpen(false)}>
              取消
            </Button>
            <Button variant="secondary" onClick={() => applyImport('append')}>
              追加到末尾
            </Button>
            <Button variant="primary" onClick={() => applyImport('replace')}>
              替换现有字段
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <CodeEditor
            value={importText}
            language="json"
            height="260px"
            placeholder={SAMPLE_INPUT}
            onChange={(value) => {
              setImportText(value);
              setImportError('');
            }}
          />

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11.5px] text-muted-300">字符串处理：</span>
            <Tabs
              value={stringMode}
              onChange={setStringMode}
              items={STRING_MODES.map((item) => ({
                value: item.value,
                label: item.label,
                hint: item.hint,
              }))}
            />
            <span className="text-[11px] text-muted-300">
              {STRING_MODES.find((item) => item.value === stringMode)?.hint}
            </span>
          </div>

          <button
            type="button"
            className="cursor-pointer text-[11.5px] text-brand-300 hover:underline"
            onClick={() => setImportText(SAMPLE_INPUT)}
          >
            填入示例
          </button>

          {importError ? <p className="text-[12px] text-rose-300">{importError}</p> : null}
        </div>
      </Dialog>
    </div>
  );
}
