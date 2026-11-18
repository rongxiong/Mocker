import { useEffect, useRef, useState } from 'react';
import { Check, FileCode2, Info, Maximize2, Plus, Timer, Trash2, Upload } from 'lucide-react';
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
import { Dialog } from './ui/dialog';

interface ResponseEditorProps {
  response: ResponseEntry;
  onChange: (patch: Partial<ResponseEntry>) => void;
}

/** Edits one full response slot: status/headers/type/body are all per-slot. */
export function ResponseEditor({ response, onChange }: ResponseEditorProps) {
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [expanded, setExpanded] = useState(false);
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

  // File responses have no editable body, so there is nothing to enlarge.
  const canExpand = response.responseType !== 'file';
  const typeLabel =
    RESPONSE_TYPES.find((item) => item.value === response.responseType)?.label ?? '';

  /** Shared by the inline panel and the enlarged window dialog. */
  const renderBody = (editorHeight: string) => {
    if (response.responseType === 'json') {
      return (
        <div className="space-y-2">
          <CodeEditor
            value={response.body}
            language="json"
            height={editorHeight}
            onChange={(value) => onChange({ body: value })}
          />
          <div className="flex items-center gap-2 text-[13px]">
            {jsonOk ? (
              <span className="flex items-center gap-2 text-ok">
                <Check size={16} strokeWidth={1.5} /> JSON 合法
              </span>
            ) : (
              <span className="text-danger">JSON 解析失败，保存后仍会原样返回</span>
            )}
          </div>
        </div>
      );
    }

    if (response.responseType === 'html') {
      return (
        <CodeEditor
          value={response.body}
          language="html"
          height={editorHeight}
          onChange={(value) => onChange({ body: value })}
        />
      );
    }

    if (response.responseType === 'javascript') {
      return (
        <div className="space-y-2">
          <CodeEditor
            value={response.body}
            language="javascript"
            height={editorHeight}
            onChange={(value) => onChange({ body: value })}
          />
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-fill px-3 py-2 text-[13px] text-muted-200">
            <Info size={16} strokeWidth={1.5} className="text-muted-300" />
            <span>
              可用变量：<code className="font-mono text-fg">req</code>（method / path / params /
              query / headers / cookies / body）、
              <code className="font-mono text-fg">console</code>、
              <code className="font-mono text-fg">faker</code>、
              <code className="font-mono text-fg">RandExp</code>、
              <code className="font-mono text-fg">uuid()</code>、
              <code className="font-mono text-fg">require()</code>
            </span>
            <span className="text-muted-300">
              require 白名单：faker, randexp, uuid, path, url, util, crypto, querystring
            </span>
          </div>
        </div>
      );
    }

    if (response.responseType === 'schema') {
      return (
        <SchemaEditor
          fields={response.schema ?? []}
          onChange={(schema) => onChange({ schema })}
          root={response.schemaRoot ?? 'object'}
          rootMin={response.schemaRootMin ?? 2}
          rootMax={response.schemaRootMax ?? 5}
          onRootChange={(patch) => onChange(patch)}
        />
      );
    }

    return (
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
          <Button variant="secondary" onClick={() => fileInput.current?.click()}>
            <Upload size={16} strokeWidth={1.5} />
            上传文件
          </Button>
        </div>
        {response.fileId ? (
          <p className="text-[13px] text-muted-300">
            将按文件扩展名自动推断 Content-Type；可到「文件库」页面下载或替换。
          </p>
        ) : (
          <div className="flex items-center gap-2 rounded-lg border border-line bg-fill p-4 text-[13px] text-muted-300">
            <FileCode2 size={16} strokeWidth={1.5} />
            还没有选择文件，上传后即可作为响应体返回（支持二进制）。
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
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
          <Label htmlFor="response-delay" className="flex items-center gap-2">
            <Timer size={16} strokeWidth={1.5} /> 延迟 (ms)
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
                <Trash2 size={16} strokeWidth={1.5} />
              </Button>
            </div>
          ))}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => patchHeaders([...response.headers, { key: '', value: '' }])}
          >
            <Plus size={16} strokeWidth={1.5} /> 添加响应头
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_240px]">
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
          <div className="flex items-center gap-2">
            {canExpand ? (
              <Button
                variant="ghost"
                size="sm"
                title="在大窗口中编辑响应内容"
                onClick={() => setExpanded(true)}
              >
                <Maximize2 size={16} strokeWidth={1.5} /> 窗口编辑
              </Button>
            ) : null}
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
        </div>

        <p className="mb-3 flex items-center gap-2 text-[13px] text-muted-300">
          <Info size={16} strokeWidth={1.5} />
          {RESPONSE_TYPES.find((item) => item.value === response.responseType)?.hint}
        </p>

        {renderBody('300px')}
      </div>

      <Dialog
        open={expanded}
        title={`响应内容 · ${typeLabel}`}
        description="大窗口模式下编辑，内容与表单实时同步，关闭后无需额外保存（仍需点击页面上的保存）。"
        width="max-w-5xl"
        onClose={() => setExpanded(false)}
      >
        {renderBody('62vh')}
      </Dialog>
    </div>
  );
}
