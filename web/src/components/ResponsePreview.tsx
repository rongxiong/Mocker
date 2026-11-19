import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import type { HeaderEntry, MockRequestSnapshot, MockRule, PreviewResult } from '@shared/types';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Switch } from './ui/switch';
import { LazyCodeEditor as CodeEditor } from './LazyCodeEditor';
import { api } from '@/lib/api';
import { responseAt } from '@shared/defaults';
import { hasEffectiveConditions } from '@shared/services/conditions';
import { selectResponseIndexes } from '@shared/services/sequence';
import { buildHttpie, cn, copyText, prettyJson } from '@/lib/utils';
import { toast } from './ui/toast';

interface ResponsePreviewProps {
  rule: MockRule;
  baseUrl: string;
  /** bump to force a refresh, e.g. after saving */
  refreshToken?: number;
}

function statusTone(status: number): string {
  if (status < 300) return 'text-ok';
  if (status < 400) return 'text-info';
  if (status < 500) return 'text-warn';
  return 'text-danger';
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
            className="font-mono text-[13px]"
            onChange={(event) =>
              onChange(
                rows.map((item, i) => (i === index ? { ...item, key: event.target.value } : item)),
              )
            }
          />
          <Input
            value={row.value}
            placeholder={valuePlaceholder}
            className="font-mono text-[13px]"
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
            <Trash2 size={16} strokeWidth={1.5} className="text-muted-300" />
          </Button>
        </div>
      ))}
      <Button variant="ghost" size="sm" onClick={() => onChange([...rows, { key: '', value: '' }])}>
        <Plus size={16} strokeWidth={1.5} />
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

/** Real requests parse cookies out of the `cookie` header; mirror that here. */
function parseCookies(raw: string): Record<string, string> {
  const cookies: Record<string, string> = {};
  for (const part of raw.split(';')) {
    const index = part.indexOf('=');
    if (index < 0) continue;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (!key) continue;
    try {
      cookies[key] = decodeURIComponent(value);
    } catch {
      cookies[key] = value;
    }
  }
  return cookies;
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
  const [responseIndex, setResponseIndex] = useState(0);
  const [autoSlot, setAutoSlot] = useState(false);
  const requestSeq = useRef(0);

  // Every slot is a full response; the picker can inspect any of them,
  // including slots that are currently disabled for real requests.
  const slots = rule.responses ?? [];
  const showSlots = slots.length > 1;
  const hasConditionSlots = slots.some(
    (slot) => slot.enabled !== false && hasEffectiveConditions(slot),
  );
  useEffect(() => {
    setResponseIndex(0);
  }, [rule.id, slots.length]);

  // Removing / disabling the last conditional slot hides the toggle; make
  // sure the stale switch cannot silently come back when a condition returns.
  useEffect(() => {
    if (!hasConditionSlots) setAutoSlot(false);
  }, [hasConditionSlots]);

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

  const previewRequest = useMemo<MockRequestSnapshot>(() => {
    const query = Object.fromEntries(cleanRows(queryRows).map((row) => [row.key, row.value]));
    // Express lower-cases incoming header names, mirror that for conditions.
    const headers = Object.fromEntries(
      cleanRows(headerRows).map((row) => [row.key.toLowerCase(), row.value]),
    );
    return {
      method: rule.method,
      path: rule.path,
      params: paramValues,
      query,
      headers,
      cookies: parseCookies(headers.cookie ?? ''),
      body: parseBody(body),
    };
  }, [rule.method, rule.path, paramValues, queryRows, headerRows, body]);

  // The same pure selection the mock route uses, but without advancing its
  // in-memory sequence counter: previews never disturb real requests.
  const autoSelection = useMemo(
    () => selectResponseIndexes(rule, previewRequest),
    [rule, previewRequest],
  );
  const autoIndex = autoSelection.indexes[0] ?? 0;
  const effectiveIndex = autoSlot && hasConditionSlots ? autoIndex : responseIndex;

  const requestPayload = useMemo(
    () => ({ ...previewRequest, responseIndex: effectiveIndex }),
    [previewRequest, effectiveIndex],
  );

  const payloadKey = JSON.stringify(requestPayload);

  const run = useCallback(async () => {
    // Out-of-order responses must not overwrite the newest preview.
    const seq = ++requestSeq.current;
    setLoading(true);
    const result = await api.preview(rule, requestPayload).catch(() => null);
    if (seq !== requestSeq.current) return;
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

  const activeResponse = responseAt(rule, effectiveIndex);
  const autoHint = autoSelection.conditionMatched
    ? `真实请求会命中 #${autoIndex + 1}`
    : autoSelection.indexes.length > 1
      ? `未命中条件档，真实请求在 ${autoSelection.indexes.length} 个无条件档间轮询`
      : `未命中条件档，真实请求兜底 #${autoIndex + 1}`;
  const language =
    preview?.contentType.includes('json') ||
    activeResponse.responseType === 'json' ||
    activeResponse.responseType === 'schema'
      ? 'json'
      : activeResponse.responseType === 'html'
        ? 'html'
        : activeResponse.responseType === 'javascript'
          ? 'javascript'
          : 'text';

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <span className="panel-title">响应预览</span>
        <div className="flex items-center gap-2">
          {loading ? (
            <Loader2 size={16} strokeWidth={1.5} className="animate-spin text-brand-200" />
          ) : (
            preview?.durationMs !== undefined && (
              <span className="mono-line flex items-center gap-1 text-muted-300">
                <Clock size={16} strokeWidth={1.5} />
                {preview.durationMs}ms
              </span>
            )
          )}
          <Button variant="ghost" size="icon" title="重新生成" onClick={() => void run()}>
            <RefreshCw size={16} strokeWidth={1.5} />
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {showSlots ? (
          <div className="mb-3">
            <div className="flex items-center gap-2">
              <span className="text-[13px] text-muted-300">响应</span>
              <div className="flex flex-wrap gap-1">
                {slots.map((slot, index) => (
                  <button
                    key={slot.id}
                    type="button"
                    title={`${slot.label || `第 ${index + 1} 档响应`}${hasEffectiveConditions(slot) ? '（有条件）' : ''}${slot.enabled === false ? '（已停用，仅供查看）' : ''}`}
                    onClick={() => {
                      setAutoSlot(false);
                      setResponseIndex(index);
                    }}
                    className={cn(
                      'cursor-pointer rounded-md border px-2 py-1 font-mono text-[12px] transition-colors duration-150',
                      effectiveIndex === index
                        ? 'border-brand-500/40 bg-brand-500/10 text-fg'
                        : 'border-line text-muted-300 hover:text-muted-100',
                      slot.enabled === false && 'opacity-55 line-through',
                      autoSlot && effectiveIndex === index && 'border-dashed',
                    )}
                  >
                    #{index + 1}
                    {index === 0 ? ' 默认' : ''}
                    {slot.label ? ` ${slot.label}` : ''}
                    {slot.enabled === false ? ' 停用' : ''}
                  </button>
                ))}
              </div>
            </div>
            {hasConditionSlots ? (
              <div className="mt-2 flex flex-wrap items-center gap-2 text-[12px] text-muted-300">
                <Switch
                  title="按请求条件自动选档"
                  aria-label="按请求条件自动选档"
                  checked={autoSlot}
                  onCheckedChange={setAutoSlot}
                />
                <span>按请求条件自动选档</span>
                <span className="font-mono">
                  {autoHint}
                  {autoSlot && !autoSelection.conditionMatched && autoSelection.indexes.length > 1
                    ? `（预览显示 #${autoIndex + 1}）`
                    : ''}
                </span>
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="mb-4 rounded-lg border border-line bg-fill">
          <button
            type="button"
            onClick={() => setOpenRequest(!openRequest)}
            className="flex w-full cursor-pointer items-center gap-2 px-3 py-2.5 text-left"
          >
            {openRequest ? (
              <ChevronDown size={16} strokeWidth={1.5} className="text-muted-300" />
            ) : (
              <ChevronRight size={16} strokeWidth={1.5} className="text-muted-300" />
            )}
            <Send size={16} strokeWidth={1.5} className="text-muted-300" />
            <span className="text-[13px] font-medium text-muted-100">请求参数</span>
          </button>

          {openRequest ? (
            <div className="space-y-3 border-t border-line px-3 py-3">
              {pathParams.length > 0 ? (
                <div>
                  <p className="mb-1 text-[12px] text-muted-300">Path params</p>
                  <div className="space-y-1">
                    {pathParams.map((name) => (
                      <div key={name} className="flex items-center gap-1.5">
                        <span className="w-[74px] shrink-0 truncate font-mono text-[12px] text-brand-200">
                          :{name}
                        </span>
                        <Input
                          value={paramValues[name] ?? ''}
                          className="font-mono text-[13px]"
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
                <p className="mb-1 text-[12px] text-muted-300">Query</p>
                <KvRows
                  rows={queryRows}
                  onChange={setQueryRows}
                  keyPlaceholder="key"
                  valuePlaceholder="value"
                  addLabel="添加参数"
                />
              </div>

              <div>
                <p className="mb-1 text-[12px] text-muted-300">Headers</p>
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
                  <p className="mb-1 text-[12px] text-muted-300">Body</p>
                  <CodeEditor
                    value={body}
                    language="json"
                    height="130px"
                    placeholder='{"keyword":"phone","size":3}'
                    onChange={setBody}
                  />
                </div>
              ) : null}

              <p className="mono-line break-all">
                <span className="text-brand-200">{rule.method}</span> {resolvedPath}
                {queryString ? `?${queryString}` : ''}
              </p>
            </div>
          ) : null}
        </div>

        {preview?.error ? (
          <div className="mb-4 flex gap-2 rounded-lg border border-line bg-fill p-3 text-[13px] text-muted-200">
            <AlertTriangle size={16} strokeWidth={1.5} className="mt-px shrink-0 text-danger" />
            <div>
              <p className="font-medium text-fg">生成失败</p>
              <p className="mt-1 break-all font-mono text-[12px] text-danger">{preview.error}</p>
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
          <div className="space-y-4 animate-fade-in">
            <div className="flex flex-wrap items-center gap-3 rounded-lg border border-line border-l-2 border-l-brand-500 bg-accent-soft px-3 py-3">
              <span
                className={cn(
                  'font-mono text-[24px] font-medium leading-none tabular-nums',
                  statusTone(preview.status),
                )}
              >
                {preview.status}
              </span>
              <span className="mono-line text-muted-300">{preview.contentType}</span>
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
                  className="cursor-pointer text-[13px] text-muted-300 transition-colors hover:text-brand-200"
                >
                  复制 HTTPie
                </button>
                <button
                  type="button"
                  onClick={() => {
                    copyText(preview.body);
                    toast('响应内容已复制', 'info');
                  }}
                  className="cursor-pointer text-[13px] text-muted-300 transition-colors hover:text-brand-200"
                >
                  复制响应
                </button>
              </div>
            </div>

            <div>
              <p className="mb-1 text-[12px] text-muted-300">Headers</p>
              <div className="overflow-hidden rounded-lg border border-line">
                {Object.entries(preview.headers).map(([key, value]) => (
                  <div
                    key={key}
                    className="grid grid-cols-[130px_1fr] gap-2 border-b border-line px-3 py-1.5 font-mono text-[12px] last:border-b-0"
                  >
                    <span className="truncate text-brand-200">{key}</span>
                    <span className="break-all text-muted-200">{value}</span>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <p className="mb-1 text-[12px] text-muted-300">Body</p>
              {preview.isBinary && !preview.body.startsWith('{') ? (
                <div className="rounded-lg border border-line bg-fill p-3 text-[13px] text-muted-200">
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
