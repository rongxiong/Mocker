import { useEffect, useRef, useState } from 'react';
import { Check, FileCode2, Info, Plus, Timer, Trash2, Upload, Wand2 } from 'lucide-react';
import type {
  EnvelopeType,
  HeaderEntry,
  ResponseEntry,
  ResponseType,
  UploadedFile,
} from '@shared/types';
import { Button } from './ui/button';
import { Input, Label, Select } from './ui/input';
import { Tabs } from './ui/tabs';
import { LazyCodeEditor as CodeEditor } from './LazyCodeEditor';
import { SchemaEditor } from './SchemaEditor';
import { COMMON_STATUS_CODES, ENVELOPES, RESPONSE_TYPES, bodyForType } from '@/lib/constants';
import { api } from '@/lib/api';
import { isValidJson } from '@/lib/utils';
import { toast } from './ui/toast';

interface ResponseEditorProps {
  response: ResponseEntry;
  onChange: (patch: Partial<ResponseEntry>) => void;
}

/** Edits one full response slot: status/headers/type/body are all per-slot. */
export function ResponseEditor({ response, onChange }: ResponseEditorProps) {
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);

  const loadFiles = () => {
    api
      .listFiles()
      .then(setFiles)
      .catch(() => setFiles([]));
  };

  useEffect(() => {
    if (response.responseType === 'file') loadFiles();
  }, [response.responseType]);

  const jsonOk = response.responseType !== 'json' || isValidJson(response.body);

  const patchHeaders = (headers: HeaderEntry[]) => onChange({ headers });

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-[130px_130px_1fr] gap-3">
        <div>
          <Label htmlFor="response-status" className="flex items-center gap-1">
            状态码
          </Label>
          <Select
            id="response-status"
            value={String(response.statusCode)}
            onChange={(event) => onChange({ statusCode: Number(event.target.value) })}
            className="w-full font-mono"
          >
            {[...new Set([...COMMON_STATUS_CODES, response.statusCode])]
              .sort((a, b) => a - b)
              .map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="response-delay" className="flex items-center gap-1">
            <Timer size={11} /> 延迟 (ms)
          </Label>
          <Input
            id="response-delay"
            type="number"
            min={0}
            max={60000}
            value={response.delayMs}
            onChange={(event) =>
              onChange({ delayMs: Math.max(0, Number(event.target.value) || 0) })
            }
          />
        </div>
        <div>
          <Label htmlFor="response-jitter">随机抖动 (ms)</Label>
          <Input
            id="response-jitter"
            type="number"
            min={0}
            max={60000}
            value={response.delayJitterMs}
            onChange={(event) =>
              onChange({ delayJitterMs: Math.max(0, Number(event.target.value) || 0) })
            }
          />
        </div>
      </div>

      <div>
        <Label>响应头</Label>
        <div className="space-y-1.5">
          {response.headers.map((entry, index) => (
            <div key={entry.key + index} className="flex items-center gap-2">
              <Input
                value={entry.key}
                placeholder="X-Request-Id"
                className="font-mono"
                onChange={(event) =>
                  patchHeaders(
                    response.headers.map((item, i) =>
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
                  patchHeaders(
                    response.headers.map((item, i) =>
                      i === index ? { ...item, value: event.target.value } : item,
                    ),
                  )
                }
              />
              <Button
                variant="ghost"
                size="icon"
                title="删除"
                onClick={() => patchHeaders(response.headers.filter((_, i) => i !== index))}
              >
                <Trash2 size={13} />
              </Button>
            </div>
          ))}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => patchHeaders([...response.headers, { key: '', value: '' }])}
          >
            <Plus size={12} /> 添加响应头
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-[1fr_240px] gap-3">
        <div>
          <Label htmlFor="response-content-type">Content-Type（留空自动推断）</Label>
          <Input
            id="response-content-type"
            value={response.contentType}
            placeholder="application/json; charset=utf-8"
            className="font-mono"
            onChange={(event) => onChange({ contentType: event.target.value })}
          />
        </div>
        <div>
          <Label htmlFor="response-envelope">响应信封（仅 JSON / 结构化）</Label>
          <Select
            id="response-envelope"
            value={response.envelope ?? 'none'}
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
      </div>

      <div className="border-t border-line pt-3">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <p className="panel-title">响应内容</p>
          <Tabs
            value={response.responseType}
            onChange={(value: ResponseType) =>
              onChange({
                responseType: value,
                body: bodyForType(response.responseType, value, response.body),
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
          {RESPONSE_TYPES.find((item) => item.value === response.responseType)?.hint}
        </p>

        {response.responseType === 'json' ? (
          <div className="space-y-2">
            <CodeEditor
              value={response.body}
              language="json"
              height="300px"
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

        {response.responseType === 'html' ? (
          <CodeEditor
            value={response.body}
            language="html"
            height="300px"
            onChange={(value) => onChange({ body: value })}
          />
        ) : null}

        {response.responseType === 'javascript' ? (
          <div className="space-y-2">
            <CodeEditor
              value={response.body}
              language="javascript"
              height="300px"
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

        {response.responseType === 'schema' ? (
          <SchemaEditor
            fields={response.schema ?? []}
            onChange={(schema) => onChange({ schema })}
            root={response.schemaRoot ?? 'object'}
            rootMin={response.schemaRootMin ?? 2}
            rootMax={response.schemaRootMax ?? 5}
            onRootChange={(patch) => onChange(patch)}
          />
        ) : null}

        {response.responseType === 'file' ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Select
                value={response.fileId}
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
            {response.fileId ? (
              <p className="text-[11.5px] text-muted-300">
                将按文件扩展名自动推断 Content-Type；可到「文件库」页面下载或替换。
              </p>
            ) : (
              <div className="flex items-center gap-2 rounded-xl border border-line bg-ink-900/50 p-4 text-[12px] text-muted-300">
                <FileCode2 size={15} />
                还没有选择文件，上传后即可作为响应体返回（支持二进制）。
              </div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
