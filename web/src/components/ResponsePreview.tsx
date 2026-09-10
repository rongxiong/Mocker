import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Clock,
  Loader2,
  Plus,
  RefreshCw,
  Send,
  Trash2,
} from 'lucide-react';
import type { HeaderEntry, MockRule, PreviewResult } from '@shared/types';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { LazyCodeEditor as CodeEditor } from './LazyCodeEditor';
import { api } from '@/lib/api';
import { buildHttpie, cn, copyText, prettyJson } from '@/lib/utils';
import { toast } from './ui/toast';

interface ResponsePreviewProps {
  rule: MockRule;
  baseUrl: string;
  /** bump to force a refresh, e.g. after saving */
  refreshToken?: number;
}

function statusTone(status: number): string {
  if (status < 300) return 'border-emerald-400/30 bg-emerald-400/15 text-emerald-300';
  if (status < 400) return 'border-sky-400/30 bg-sky-400/15 text-sky-300';
  if (status < 500) return 'border-amber-400/30 bg-amber-400/15 text-amber-300';
  return 'border-rose-400/30 bg-rose-400/15 text-rose-300';
}

function KvRows({
  rows,
  onChange,
  keyPlaceholder,
  valuePlaceholder,
  addLabel,
}: {
  rows: HeaderEntry[];
  onChange: (rows: HeaderEntry[]) => void;
  keyPlaceholder: string;
  valuePlaceholder: string;
  addLabel: string;
}) {
  return (
    <div className="space-y-1">
      {rows.map((row, index) => (
        <div key={index} className="flex items-center gap-1">
          <Input
            value={row.key}
            placeholder={keyPlaceholder}
            className="h-7 font-mono"
            onChange={(event) =>
              onChange(
                rows.map((item, i) => (i === index ? { ...item, key: event.target.value } : item)),
              )
            }
          />
          <Input
            value={row.value}
            placeholder={valuePlaceholder}
            className="h-7 font-mono"
            onChange={(event) =>
              onChange(
                rows.map((item, i) =>
                  i === index ? { ...item, value: event.target.value } : item,
                ),
              )
            }
          />
          <Button
            variant="ghost"
            size="icon"
            title="删除"
            onClick={() => onChange(rows.filter((_, i) => i !== index))}
          >
            <Trash2 size={12} className="text-muted-300" />
          </Button>
        </div>
      ))}
      <Button variant="ghost" size="sm" onClick={() => onChange([...rows, { key: '', value: '' }])}>
        <Plus size={11} />
        {addLabel}
      </Button>
    </div>
  );
}

function parseBody(raw: string): unknown {
  if (!raw.trim()) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

const BODYLESS_METHODS = ['GET', 'HEAD'];

export function ResponsePreview({ rule, baseUrl, refreshToken = 0 }: ResponsePreviewProps) {
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [openRequest, setOpenRequest] = useState(true);

  const pathParams = useMemo(
    () => [...rule.path.matchAll(/:([A-Za-z0-9_]+)/g)].map((match) => match[1]!),
    [rule.path],
  );
  const paramKey = pathParams.join(',');

  const [paramValues, setParamValues] = useState<Record<string, string>>({});
  const [queryRows, setQueryRows] = useState<HeaderEntry[]>([]);
  const [headerRows, setHeaderRows] = useState<HeaderEntry[]>([]);
  const [body, setBody] = useState('');
  const [variantIndex, setVariantIndex] = useState(-1);

  const variants = rule.variants ?? [];
  useEffect(() => {
    setVariantIndex(-1);
  }, [rule.id, variants.length]);

  useEffect(() => {
    setParamValues(
      Object.fromEntries(
        paramKey
          .split(',')
          .filter(Boolean)
          .map((name) => [name, '1']),
      ),
    );
  }, [paramKey]);

  const cleanRows = (rows: HeaderEntry[]) =>
    rows.filter((row) => row.key.trim() !== '') as HeaderEntry[];

  const requestPayload = useMemo(() => {
    const query = Object.fromEntries(cleanRows(queryRows).map((row) => [row.key, row.value]));
    const headers = Object.fromEntries(cleanRows(headerRows).map((row) => [row.key, row.value]));
    return {
      params: paramValues,
      query,
      headers,
      body: parseBody(body),
      variantIndex,
    };
  }, [paramValues, queryRows, headerRows, body, variantIndex]);

  const payloadKey = JSON.stringify(requestPayload);

  const run = useCallback(async () => {
    setLoading(true);
    const result = await api.preview(rule, requestPayload).catch(() => null);
    setPreview(result);
    setLoading(false);
  }, [rule, payloadKey]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void run();
    }, 250);
    return () => clearTimeout(timer);
  }, [run, refreshToken]);

  const resolvedPath = rule.path.replace(
    /:([A-Za-z0-9_]+)/g,
    (match, name: string) => paramValues[name] ?? match,
  );
  const queryString = new URLSearchParams(
    cleanRows(queryRows).map((row) => [row.key, row.value]),
  ).toString();

  const language =
    preview?.contentType.includes('json') ||
    rule.responseType === 'json' ||
    rule.responseType === 'schema'
      ? 'json'
      : rule.responseType === 'html'
        ? 'html'
        : rule.responseType === 'javascript'
          ? 'javascript'
          : 'text';

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-white/[0.07] px-3 py-2">
        <span className="panel-title">响应预览</span>
        <div className="flex items-center gap-1.5">
          {loading ? (
            <Loader2 size={13} className="animate-spin text-brand-300" />
          ) : (
            preview?.durationMs !== undefined && (
              <span className="flex items-center gap-1 font-mono text-[11px] text-muted-300">
                <Clock size={11} />
                {preview.durationMs}ms
              </span>
            )
          )}
          <Button variant="ghost" size="icon" title="重新生成" onClick={() => void run()}>
            <RefreshCw size={13} />
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        <div className="mb-3 rounded-xl border border-white/[0.07] bg-white/[0.02]">
          <button
            type="button"
            onClick={() => setOpenRequest(!openRequest)}
            className="flex w-full cursor-pointer items-center gap-1.5 px-2.5 py-2 text-left"
          >
            {openRequest ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
            <Send size={12} className="text-brand-300" />
            <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-300">
              请求参数
            </span>
          </button>

          {openRequest ? (
            <div className="space-y-2.5 border-t border-white/[0.06] px-2.5 py-2.5">
              {variants.length > 0 ? (
                <div className="flex items-center gap-1.5">
                  <span className="text-[10.5px] uppercase tracking-[0.14em] text-muted-300">
                    序列
                  </span>
                  <div className="flex flex-wrap gap-1">
                    <button
                      type="button"
                      onClick={() => setVariantIndex(-1)}
                      className={cn(
                        'cursor-pointer rounded-md border px-1.5 py-[2px] text-[10.5px] transition-colors',
                        variantIndex === -1
                          ? 'border-brand-500/50 bg-brand-500/20 text-white'
                          : 'border-white/[0.08] text-muted-300 hover:text-muted-100',
                      )}
                    >
                      基准
                    </button>
                    {variants.map((variant, index) => (
                      <button
                        key={variant.id}
                        type="button"
                        title={variant.label || `第 ${index + 1} 次`}
                        onClick={() => setVariantIndex(index)}
                        className={cn(
                          'cursor-pointer rounded-md border px-1.5 py-[2px] text-[10.5px] transition-colors',
                          variantIndex === index
                            ? 'border-accent-400/50 bg-accent-400/20 text-white'
                            : 'border-white/[0.08] text-muted-300 hover:text-muted-100',
                        )}
                      >
                        #{index + 1}
                        {variant.label ? ` ${variant.label}` : ''}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              {pathParams.length > 0 ? (
                <div>
                  <p className="mb-1 text-[10.5px] uppercase tracking-[0.14em] text-muted-300">
                    Path params
                  </p>
                  <div className="space-y-1">
                    {pathParams.map((name) => (
                      <div key={name} className="flex items-center gap-1.5">
                        <span className="w-[74px] shrink-0 truncate font-mono text-[11px] text-accent-300">
                          :{name}
                        </span>
                        <Input
                          value={paramValues[name] ?? ''}
                          className="h-7 font-mono"
                          placeholder="值"
                          onChange={(event) =>
                            setParamValues((current) => ({
                              ...current,
                              [name]: event.target.value,
                            }))
                          }
                        />
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              <div>
                <p className="mb-1 text-[10.5px] uppercase tracking-[0.14em] text-muted-300">
                  Query
                </p>
                <KvRows
                  rows={queryRows}
                  onChange={setQueryRows}
                  keyPlaceholder="key"
                  valuePlaceholder="value"
                  addLabel="添加参数"
                />
              </div>

              <div>
                <p className="mb-1 text-[10.5px] uppercase tracking-[0.14em] text-muted-300">
                  Headers
                </p>
                <KvRows
                  rows={headerRows}
                  onChange={setHeaderRows}
                  keyPlaceholder="X-Token"
                  valuePlaceholder="value"
                  addLabel="添加请求头"
                />
              </div>

              {!BODYLESS_METHODS.includes(rule.method) ? (
                <div>
                  <p className="mb-1 text-[10.5px] uppercase tracking-[0.14em] text-muted-300">
                    Body
                  </p>
                  <CodeEditor
                    value={body}
                    language="json"
                    height="130px"
                    placeholder='{"keyword":"phone","size":3}'
                    onChange={setBody}
                  />
                </div>
              ) : null}

              <p className="break-all font-mono text-[10.5px] text-muted-300">
                {rule.method} {resolvedPath}
                {queryString ? `?${queryString}` : ''}
              </p>
            </div>
          ) : null}
        </div>

        {preview?.error ? (
          <div className="mb-3 flex gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-[12px] text-rose-200">
            <AlertTriangle size={15} className="mt-[1px] shrink-0" />
            <div>
              <p className="font-medium">生成失败</p>
              <p className="mt-1 break-all font-mono text-[11px] text-rose-300">{preview.error}</p>
            </div>
          </div>
        ) : null}

        {!preview && loading ? (
          <div className="space-y-2">
            <div className="skeleton h-6 w-28 rounded-md" />
            <div className="skeleton h-40 w-full rounded-xl" />
          </div>
        ) : null}

        {preview ? (
          <div className="space-y-3 animate-fade-in">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={cn(
                  'rounded-md border px-2 py-0.5 font-mono text-[11.5px] font-semibold',
                  statusTone(preview.status),
                )}
              >
                {preview.status}
              </span>
              <span className="font-mono text-[11px] text-muted-300">{preview.contentType}</span>
              <div className="ml-auto flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    copyText(
                      buildHttpie({
                        method: rule.method,
                        url: `${baseUrl}${resolvedPath}${queryString ? `?${queryString}` : ''}`,
                        headers: Object.fromEntries(
                          cleanRows(headerRows).map((row) => [row.key, row.value]),
                        ),
                        body: rule.method === 'GET' || rule.method === 'HEAD' ? '' : body,
                      }),
                    );
                    toast('已复制 HTTPie 命令', 'info');
                  }}
                  className="cursor-pointer text-[11px] text-muted-300 transition-colors hover:text-brand-300"
                >
                  复制 HTTPie
                </button>
                <button
                  type="button"
                  onClick={() => {
                    copyText(preview.body);
                    toast('响应内容已复制', 'info');
                  }}
                  className="cursor-pointer text-[11px] text-muted-300 transition-colors hover:text-brand-300"
                >
                  复制响应
                </button>
              </div>
            </div>

            <div>
              <p className="mb-1 text-[10.5px] uppercase tracking-[0.14em] text-muted-300">
                Headers
              </p>
              <div className="overflow-hidden rounded-lg border border-white/[0.07]">
                {Object.entries(preview.headers).map(([key, value]) => (
                  <div
                    key={key}
                    className="grid grid-cols-[130px_1fr] gap-2 border-b border-white/[0.05] px-2 py-1 font-mono text-[11px] last:border-b-0"
                  >
                    <span className="truncate text-brand-200">{key}</span>
                    <span className="break-all text-muted-200">{value}</span>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <p className="mb-1 text-[10.5px] uppercase tracking-[0.14em] text-muted-300">Body</p>
              {preview.isBinary && !preview.body.startsWith('{') ? (
                <div className="rounded-xl border border-white/[0.07] bg-ink-900/60 p-3 text-[12px] text-muted-200">
                  二进制响应（{preview.body}），请在文件库中确认文件内容。
                </div>
              ) : (
                <CodeEditor
                  value={language === 'json' ? prettyJson(preview.body) : preview.body}
                  language={language}
                  height="300px"
                  readOnly
                />
              )}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
