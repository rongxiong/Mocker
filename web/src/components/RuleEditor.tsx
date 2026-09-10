import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Check,
  Copy,
  FileCode2,
  Info,
  Link2,
  Save,
  Terminal,
  Trash2,
  Upload,
  Wand2,
} from 'lucide-react';
import type { MockRule, ResponseType, RuleConflict, UploadedFile } from '@shared/types';
import { Button } from './ui/button';
import { Tabs } from './ui/tabs';
import { LazyCodeEditor as CodeEditor } from './LazyCodeEditor';
import { BasicSettings } from './BasicSettings';
import { AdvancedSettings } from './AdvancedSettings';
import { SchemaEditor } from './SchemaEditor';
import { Select } from './ui/input';
import { RESPONSE_TYPES, bodyForType } from '@/lib/constants';
import { api } from '@/lib/api';
import { buildHttpie, copyText, isValidJson } from '@/lib/utils';
import { toast } from './ui/toast';

interface RuleEditorProps {
  rule: MockRule;
  baseUrl: string;
  dirty: boolean;
  saving: boolean;
  conflict: RuleConflict | null;
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
  groups,
  onChange,
  onSave,
  onDelete,
}: RuleEditorProps) {
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);

  const loadFiles = () => {
    api
      .listFiles()
      .then(setFiles)
      .catch(() => setFiles([]));
  };

  useEffect(() => {
    if (rule.responseType === 'file') loadFiles();
  }, [rule.responseType]);

  const url = useMemo(
    () => `${baseUrl}${rule.path.startsWith('/') ? rule.path : `/${rule.path}`}`,
    [baseUrl, rule.path],
  );

  const jsonOk = rule.responseType !== 'json' || isValidJson(rule.body);

  return (
    <section className="flex h-full min-w-0 flex-1 flex-col">
      <div className="flex items-center gap-2 border-b border-white/[0.07] px-4 py-2.5">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="truncate text-[15px] font-semibold text-muted-100">
              {rule.name || '未命名接口'}
            </h2>
            {dirty ? (
              <span className="rounded-md border border-amber-400/30 bg-amber-400/10 px-1.5 py-[1px] text-[10.5px] text-amber-300">
                未保存
              </span>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => {
              copyText(url);
              toast('已复制完整 Mock URL', 'info');
            }}
            className="mt-0.5 flex cursor-pointer items-center gap-1 font-mono text-[11.5px] text-muted-300 transition-colors hover:text-brand-300"
          >
            <Link2 size={11} />
            {rule.method} {url}
            <Copy size={11} />
          </button>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="md"
            title="复制 HTTPie 命令"
            onClick={() => {
              // rule.headers / rule.body 是响应头和响应体，不能作为请求内容拼进命令
              copyText(buildHttpie({ method: rule.method, url }));
              toast('已复制 HTTPie 命令', 'info');
            }}
          >
            <Terminal size={13} />
            HTTPie
          </Button>
          <Button variant="ghost" size="md" onClick={onDelete}>
            <Trash2 size={13} />
            删除
          </Button>
          <Button variant="primary" size="md" onClick={onSave} disabled={saving || !jsonOk}>
            <Save size={13} />
            {saving ? '保存中…' : '保存'}
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {conflict ? (
          <div className="mb-3 flex items-start gap-2 rounded-xl border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-[12px] text-amber-200">
            <AlertTriangle size={14} className="mt-[1px] shrink-0" />
            <span>
              存在 {conflict.ids.length} 条相同规则{' '}
              <span className="font-mono">{conflict.key}</span>
              ，带条件的规则优先命中，其余按创建时间取最新
              {conflict.activeId === rule.id ? '（当前这条优先）' : '（当前这条被遮蔽）'}。
            </span>
          </div>
        ) : null}

        <div className="glass rounded-2xl p-4">
          <p className="panel-title mb-3">基础配置</p>
          <BasicSettings rule={rule} groups={groups} onChange={onChange} />
        </div>

        <div className="glass mt-4 rounded-2xl p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <p className="panel-title">响应配置</p>
            <Tabs
              value={rule.responseType}
              onChange={(value: ResponseType) =>
                onChange({
                  responseType: value,
                  body: bodyForType(rule.responseType, value, rule.body),
                })
              }
              items={RESPONSE_TYPES.map((item) => ({
                value: item.value,
                label: item.label,
                hint: item.hint,
              }))}
            />
          </div>

          <p className="mb-3 flex items-center gap-1.5 text-[11.5px] text-muted-300">
            <Info size={12} />
            {RESPONSE_TYPES.find((item) => item.value === rule.responseType)?.hint}
          </p>

          {rule.responseType === 'json' ? (
            <div className="space-y-2">
              <CodeEditor
                value={rule.body}
                language="json"
                height="360px"
                onChange={(value) => onChange({ body: value })}
              />
              <div className="flex items-center gap-2 text-[11.5px]">
                {jsonOk ? (
                  <span className="flex items-center gap-1 text-emerald-300">
                    <Check size={12} /> JSON 合法
                  </span>
                ) : (
                  <span className="text-rose-300">JSON 解析失败，保存后仍会原样返回</span>
                )}
              </div>
            </div>
          ) : null}

          {rule.responseType === 'html' ? (
            <CodeEditor
              value={rule.body}
              language="html"
              height="360px"
              onChange={(value) => onChange({ body: value })}
            />
          ) : null}

          {rule.responseType === 'javascript' ? (
            <div className="space-y-2">
              <CodeEditor
                value={rule.body}
                language="javascript"
                height="360px"
                onChange={(value) => onChange({ body: value })}
              />
              <div className="flex flex-wrap items-center gap-2 rounded-xl border border-brand-500/20 bg-brand-500/[0.07] px-3 py-2 text-[11.5px] text-muted-200">
                <Wand2 size={12} className="text-brand-300" />
                <span>
                  可用变量：<code className="font-mono text-brand-200">req</code>（method / path /
                  params / query / headers / cookies / body）、
                  <code className="font-mono text-brand-200">console</code>、
                  <code className="font-mono text-brand-200">faker</code>、
                  <code className="font-mono text-brand-200">RandExp</code>、
                  <code className="font-mono text-brand-200">uuid()</code>、
                  <code className="font-mono text-brand-200">require()</code>
                </span>
                <span className="text-muted-300">
                  require 白名单：faker, randexp, uuid, path, url, util, crypto, querystring
                </span>
              </div>
            </div>
          ) : null}

          {rule.responseType === 'schema' ? (
            <SchemaEditor
              fields={rule.schema ?? []}
              onChange={(schema) => onChange({ schema })}
              root={rule.schemaRoot ?? 'object'}
              rootMin={rule.schemaRootMin ?? 2}
              rootMax={rule.schemaRootMax ?? 5}
              onRootChange={(patch) => onChange(patch)}
            />
          ) : null}

          {rule.responseType === 'file' ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Select
                  value={rule.fileId}
                  className="w-full max-w-[420px]"
                  onChange={(event) => onChange({ fileId: event.target.value })}
                >
                  <option value="">选择一个文件…</option>
                  {files.map((file) => (
                    <option key={file.id} value={file.id}>
                      {file.name} · {file.mime}
                    </option>
                  ))}
                </Select>
                <input
                  ref={fileInput}
                  type="file"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) {
                      api
                        .uploadFile(file)
                        .then((uploaded) => {
                          onChange({ fileId: uploaded.id });
                          loadFiles();
                          toast(`已上传 ${uploaded.name}`, 'success');
                        })
                        .catch(() => toast('上传失败', 'error'));
                    }
                    event.target.value = '';
                  }}
                />
                <Button variant="secondary" size="md" onClick={() => fileInput.current?.click()}>
                  <Upload size={13} />
                  上传文件
                </Button>
              </div>
              {rule.fileId ? (
                <p className="text-[11.5px] text-muted-300">
                  将按文件扩展名自动推断 Content-Type；可到「文件库」页面下载或替换。
                </p>
              ) : (
                <div className="flex items-center gap-2 rounded-xl border border-white/[0.07] bg-ink-900/50 p-4 text-[12px] text-muted-300">
                  <FileCode2 size={15} />
                  还没有选择文件，上传后即可作为响应体返回（支持二进制）。
                </div>
              )}
            </div>
          ) : null}
        </div>

        <AdvancedSettings rule={rule} onChange={onChange} />
      </div>
    </section>
  );
}
