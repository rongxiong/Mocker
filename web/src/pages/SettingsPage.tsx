import { useEffect, useRef, useState } from 'react';
import {
  Activity,
  Database,
  Download,
  FileJson,
  Globe,
  RefreshCw,
  Server,
  Trash2,
  Upload,
} from 'lucide-react';
import type { MockRule, RequestLogEntry } from '@shared/types';
import { importOpenApi } from '@shared/openapiImport';
import { api } from '@/lib/api';
import type { ServerInfo } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MethodBadge } from '@/components/ui/badge';
import { Dialog } from '@/components/ui/dialog';
import { formatDateTime, formatTime, prettyJson } from '@/lib/utils';
import { toast } from '@/components/ui/toast';

interface SettingsPageProps {
  info: ServerInfo | null;
  ruleCount: number;
  onExport: () => void;
  onImportClick: () => void;
  onImported: () => void;
}

export function SettingsPage({
  info,
  ruleCount,
  onExport,
  onImportClick,
  onImported,
}: SettingsPageProps) {
  const [logs, setLogs] = useState<RequestLogEntry[]>([]);
  const [proxyTarget, setProxyTarget] = useState(info?.proxyTarget ?? '');
  const [saving, setSaving] = useState(false);
  const [activeLog, setActiveLog] = useState<RequestLogEntry | null>(null);
  const [openApi, setOpenApi] = useState<{ rules: Partial<MockRule>[]; warnings: string[] } | null>(
    null,
  );
  const [importing, setImporting] = useState(false);
  const openApiInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setProxyTarget(info?.proxyTarget ?? '');
  }, [info?.proxyTarget]);

  const handleOpenApiFile = async (file: File) => {
    try {
      const parsed = JSON.parse(await file.text());
      setOpenApi(importOpenApi(parsed));
    } catch {
      toast('解析失败：不是有效的 JSON 文档', 'error');
    }
  };

  const confirmOpenApiImport = async () => {
    if (!openApi) return;
    setImporting(true);
    try {
      const result = await api.importRules({ rules: openApi.rules }, 'merge');
      toast(`已从 OpenAPI 导入 ${result.imported} 条规则`, 'success');
      setOpenApi(null);
      onImported();
    } catch {
      toast('导入失败', 'error');
    } finally {
      setImporting(false);
    }
  };

  const loadLogs = () => {
    api
      .logs()
      .then(setLogs)
      .catch(() => setLogs([]));
  };

  useEffect(() => {
    loadLogs();
    const timer = setInterval(loadLogs, 4000);
    return () => clearInterval(timer);
  }, []);

  const rows: Array<{ label: string; value: string }> = [
    { label: '服务地址', value: info?.urls?.[0] ?? '-' },
    { label: '监听', value: `${info?.host ?? '-'}${info?.loopbackOnly ? '（仅本机）' : ''}` },
    { label: 'Mock 前缀', value: info?.mockPrefix || '/' },
    { label: '管理 API', value: `${info?.adminPrefix ?? '/__api'}/rules` },
    { label: '数据库', value: info?.dbFile ?? '-' },
    { label: 'SQLite 驱动', value: info?.dbDriver ?? '-' },
    { label: 'Node 版本', value: info?.node ?? '-' },
    { label: '脚本超时', value: `${info?.scriptTimeoutMs ?? 2000} ms` },
    { label: '最大延迟', value: `${info?.maxDelayMs ?? 60000} ms` },
  ];

  return (
    <div className="h-full overflow-y-auto p-4">
      <div className="mx-auto grid max-w-[1100px] gap-4 lg:grid-cols-2">
        <div className="glass min-w-0 rounded-xl p-4">
          <p className="panel-title mb-3 flex items-center gap-2">
            <Server size={16} strokeWidth={1.5} className="text-muted-300" /> 运行信息
          </p>
          <dl>
            {rows.map((row) => (
              <div
                key={row.label}
                className="grid grid-cols-[96px_minmax(0,1fr)] gap-2 border-b border-line py-2 last:border-b-0"
              >
                <dt className="text-[13px] text-muted-300">{row.label}</dt>
                <dd className="break-all font-mono text-[12px] text-muted-100">{row.value}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="glass min-w-0 rounded-xl p-4">
          <p className="panel-title mb-3 flex items-center gap-2">
            <Database size={16} strokeWidth={1.5} className="text-muted-300" /> 配置导入导出
          </p>
          <p className="mb-3 text-[13px] leading-relaxed text-muted-200">
            当前共 {ruleCount} 条规则。导出为 JSON 便于备份或团队共享；导入时可选择「合并」追加，
            或「覆盖」清空后重建。
          </p>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onExport}>
              <Download size={16} strokeWidth={1.5} />
              导出 JSON
            </Button>
            <Button variant="secondary" onClick={onImportClick}>
              <Upload size={16} strokeWidth={1.5} />
              导入 JSON
            </Button>
          </div>
          <p className="mt-2 text-[12px] text-muted-300">
            导出内容包含规则的完整配置、上传文件的二进制（base64）与运行设置，可在另一台机器上一键还原。
          </p>
          <div className="mt-3 border-t border-line pt-3">
            <p className="panel-title mb-2">OpenAPI / Swagger</p>
            <p className="mb-2 text-[13px] leading-relaxed text-muted-200">
              导入 OpenAPI 3 的 JSON 文档，自动按 path + method 生成规则，并把响应 schema 转成
              可视化字段树（保留 format、enum、pattern、必填项）。
            </p>
            <input
              ref={openApiInput}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void handleOpenApiFile(file);
                event.target.value = '';
              }}
            />
            <Button variant="secondary" onClick={() => openApiInput.current?.click()}>
              <FileJson size={16} strokeWidth={1.5} />
              导入 OpenAPI
            </Button>
          </div>
        </div>

        <div className="glass min-w-0 rounded-xl p-4">
          <p className="panel-title mb-3 flex items-center gap-2">
            <Globe size={16} strokeWidth={1.5} className="text-muted-300" /> 代理透传
          </p>
          <p className="mb-3 text-[13px] leading-relaxed text-muted-200">
            未命中任何规则时，请求会转发到下面的目标地址（例如
            <code className="mx-1 font-mono text-fg">https://api.example.com</code>
            ），便于只 mock 部分接口、其余走真实后端。留空则关闭。
          </p>
          <div className="flex gap-2">
            <Input
              value={proxyTarget}
              placeholder="https://api.example.com"
              onChange={(event) => setProxyTarget(event.target.value)}
              className="font-mono text-[13px]"
            />
            <Button
              variant="primary"
              disabled={saving}
              onClick={() => {
                setSaving(true);
                api
                  .updateSettings({ proxyTarget })
                  .then(() => toast('代理目标已保存', 'success'))
                  .catch(() => toast('保存失败', 'error'))
                  .finally(() => setSaving(false));
              }}
            >
              保存
            </Button>
          </div>
        </div>

        <div className="glass min-w-0 rounded-xl p-4 lg:col-span-2">
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="panel-title flex items-center gap-2 whitespace-nowrap">
              <Activity size={16} strokeWidth={1.5} className="text-muted-300" /> 最近请求
            </p>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" title="刷新" onClick={loadLogs}>
                <RefreshCw size={16} strokeWidth={1.5} />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                title="清空"
                onClick={() => {
                  api.clearLogs().then(() => {
                    setLogs([]);
                    toast('已清空请求日志', 'info');
                  });
                }}
              >
                <Trash2 size={16} strokeWidth={1.5} className="text-muted-300" />
              </Button>
            </div>
          </div>

          {logs.length === 0 ? (
            <p className="py-8 text-center text-[13px] text-muted-300">
              还没有请求记录，访问一次 Mock 接口后这里会出现命中日志
            </p>
          ) : (
            <div className="max-h-[420px] overflow-auto">
              <table className="w-full min-w-[640px] text-left font-mono text-[12px] tabular-nums">
                <thead className="sticky top-0 bg-ink-800">
                  <tr className="text-[12px] text-muted-300">
                    <th className="px-3 py-2 font-medium">时间</th>
                    <th className="px-3 py-2 font-medium">方法</th>
                    <th className="px-3 py-2 font-medium">路径</th>
                    <th className="px-3 py-2 font-medium">命中规则</th>
                    <th className="px-3 py-2 font-medium">状态</th>
                    <th className="px-3 py-2 font-medium">耗时</th>
                    <th className="px-3 py-2 text-right font-medium">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log) => (
                    <tr key={log.id} className="border-t border-line hover:bg-fill">
                      <td className="px-3 py-2 text-muted-300">{formatTime(log.at)}</td>
                      <td className="px-3 py-2">
                        <MethodBadge method={log.method} />
                      </td>
                      <td className="px-3 py-2 text-muted-100">{log.path}</td>
                      <td className={`px-3 py-2 ${log.matched ? 'text-muted-200' : 'text-danger'}`}>
                        {log.matched ? log.ruleName : '未匹配'}
                      </td>
                      <td
                        className={`px-3 py-2 ${
                          log.status >= 500
                            ? 'text-rose-300'
                            : log.status >= 400
                              ? 'text-amber-300'
                              : 'text-emerald-300'
                        }`}
                      >
                        {log.status}
                      </td>
                      <td className="px-3 py-2 text-muted-300">{log.durationMs}ms</td>
                      <td className="px-3 py-2 text-right">
                        <button
                          type="button"
                          onClick={() => setActiveLog(log)}
                          className="cursor-pointer text-[13px] text-brand-200 hover:underline"
                        >
                          详情
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <Dialog
        open={Boolean(openApi)}
        title="导入 OpenAPI 文档"
        description={`解析到 ${openApi?.rules.length ?? 0} 个接口，将作为新规则追加（不会覆盖现有规则）。`}
        width="max-w-2xl"
        onClose={() => setOpenApi(null)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpenApi(null)}>
              取消
            </Button>
            <Button
              variant="primary"
              onClick={() => void confirmOpenApiImport()}
              disabled={importing}
            >
              {importing ? '导入中…' : `导入 ${openApi?.rules.length ?? 0} 条`}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          {openApi && openApi.warnings.length > 0 ? (
            <ul className="space-y-1 rounded-lg border border-line bg-fill p-3 text-[13px] text-muted-200">
              {openApi.warnings.map((warning) => (
                <li key={warning}>· {warning}</li>
              ))}
            </ul>
          ) : null}
          <div className="max-h-[46vh] overflow-auto rounded-lg border border-line">
            <table className="w-full min-w-[480px] text-left font-mono text-[12px]">
              <thead className="sticky top-0 bg-ink-800">
                <tr className="text-[12px] text-muted-300">
                  <th className="px-3 py-2 font-medium">方法</th>
                  <th className="px-3 py-2 font-medium">路径</th>
                  <th className="px-3 py-2 font-medium">分组</th>
                  <th className="px-3 py-2 font-medium">来源</th>
                </tr>
              </thead>
              <tbody>
                {(openApi?.rules ?? []).map((rule, index) => (
                  <tr key={index} className="border-t border-line">
                    <td className="px-3 py-2">
                      <MethodBadge method={rule.method ?? 'GET'} />
                    </td>
                    <td className="px-3 py-2 text-muted-100">{rule.path}</td>
                    <td className="px-3 py-2 text-muted-300">{rule.group || '—'}</td>
                    <td className="px-3 py-2 text-brand-200">
                      {rule.responses?.[0]?.responseType === 'schema' ? 'schema' : 'json'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </Dialog>

      <Dialog
        open={Boolean(activeLog)}
        title="请求详情"
        description={
          activeLog
            ? `${activeLog.method} ${activeLog.path} · ${formatDateTime(activeLog.at)} · ${activeLog.durationMs}ms`
            : ''
        }
        width="max-w-2xl"
        onClose={() => setActiveLog(null)}
        footer={
          <Button variant="ghost" onClick={() => setActiveLog(null)}>
            关闭
          </Button>
        }
      >
        {activeLog ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-[13px]">
              <MethodBadge method={activeLog.method} />
              <span className="font-mono text-muted-200">{activeLog.path}</span>
              <span className="text-muted-300">
                命中：{activeLog.matched ? activeLog.ruleName : '未匹配'}
              </span>
              <span className={activeLog.status >= 400 ? 'text-rose-300' : 'text-emerald-300'}>
                {activeLog.status || '—'}
              </span>
            </div>
            <div>
              <p className="mb-1 text-[12px] text-muted-300">请求体</p>
              <pre className="max-h-52 overflow-auto rounded-lg border border-line bg-fill p-3 font-mono text-[12px] text-muted-200">
                {prettyJson(activeLog.requestBody || '（空）')}
              </pre>
            </div>
            <div>
              <p className="mb-1 text-[12px] text-muted-300">响应体</p>
              <pre className="max-h-64 overflow-auto rounded-lg border border-line bg-fill p-3 font-mono text-[12px] text-muted-200">
                {prettyJson(activeLog.responseBody || '（空）')}
              </pre>
            </div>
          </div>
        ) : null}
      </Dialog>
    </div>
  );
}
