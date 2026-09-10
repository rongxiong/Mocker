import type {
  MockRule,
  PreviewResult,
  RequestLogEntry,
  RuleConflict,
  UploadedFile,
} from '@shared/types';

const BASE = '/__api';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly data?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE}${path}`, {
    headers: { 'content-type': 'application/json' },
    ...init,
  });
  if (!response.ok) {
    let data: Record<string, unknown> | undefined;
    let message = `Request failed with ${response.status}`;
    try {
      data = (await response.json()) as Record<string, unknown>;
      if (data?.error) message = String(data.error);
    } catch {
      /* ignore */
    }
    throw new ApiError(message, response.status, data);
  }
  return (await response.json()) as T;
}

export interface ServerInfo {
  port: number;
  host: string;
  loopbackOnly: boolean;
  proxyTarget: string;
  mockPrefix: string;
  adminPrefix: string;
  dbFile: string;
  dbDriver: string;
  urls: string[];
  node: string;
  ruleCount: number;
  fileCount: number;
  maxDelayMs: number;
  scriptTimeoutMs: number;
  importableModules: string[];
  methods: string[];
}

export const api = {
  info: () => request<ServerInfo>('/info'),

  listRules: () => request<{ rules: MockRule[]; conflicts: RuleConflict[] }>('/rules'),
  getSettings: async () =>
    (await request<{ settings: Record<string, string> }>('/settings')).settings,
  updateSettings: async (patch: Record<string, string>) =>
    (
      await request<{ settings: Record<string, string> }>('/settings', {
        method: 'PUT',
        body: JSON.stringify(patch),
      })
    ).settings,
  resetVariants: (ruleId?: string) =>
    request<{ ok: boolean }>('/variants/reset', {
      method: 'POST',
      body: JSON.stringify({ ruleId }),
    }),
  getRule: async (id: string) => (await request<{ rule: MockRule }>(`/rules/${id}`)).rule,
  createRule: async (rule: Partial<MockRule>) =>
    (await request<{ rule: MockRule }>('/rules', { method: 'POST', body: JSON.stringify(rule) }))
      .rule,
  updateRule: async (id: string, patch: Partial<MockRule>) =>
    (
      await request<{ rule: MockRule }>(`/rules/${id}`, {
        method: 'PUT',
        body: JSON.stringify(patch),
      })
    ).rule,
  deleteRule: (id: string) => request<{ ok: boolean }>(`/rules/${id}`, { method: 'DELETE' }),
  duplicateRule: async (id: string) =>
    (await request<{ rule: MockRule }>(`/rules/${id}/duplicate`, { method: 'POST' })).rule,

  preview: async (rule: Partial<MockRule>, override?: Record<string, unknown>) =>
    (
      await request<{ preview: PreviewResult }>('/preview', {
        method: 'POST',
        body: JSON.stringify({ rule, request: override ?? {} }),
      })
    ).preview,

  exportAll: () => request<{ version: number; rules: MockRule[] }>('/export'),
  importRules: (payload: unknown, mode: 'merge' | 'replace') =>
    request<{ imported: number; updated: number; total: number }>('/import', {
      method: 'POST',
      body: JSON.stringify({ ...(payload as object), mode }),
    }),

  listFiles: async () => (await request<{ files: UploadedFile[] }>('/files')).files,
  uploadFile: async (file: File) => {
    const form = new FormData();
    form.append('file', file);
    const response = await fetch(`${BASE}/files/upload`, { method: 'POST', body: form });
    if (!response.ok) throw new Error('Upload failed');
    return ((await response.json()) as { file: UploadedFile }).file;
  },
  /** `force` deletes the file even when rules still reference it. */
  deleteFile: (id: string, force = false) =>
    request<{ ok: boolean }>(`/files/${id}${force ? '?force=1' : ''}`, { method: 'DELETE' }),
  fileUrl: (id: string) => `${BASE}/files/${id}/download`,

  logs: async () => (await request<{ logs: RequestLogEntry[] }>('/logs')).logs,
  clearLogs: () => request<{ ok: boolean }>('/logs', { method: 'DELETE' }),
};
