import { useEffect, useRef, useState } from 'react';
import {
  Download,
  FileArchive,
  FileCode2,
  FileText,
  File as FileIcon,
  Image as ImageIcon,
  Trash2,
  UploadCloud,
} from 'lucide-react';
import type { UploadedFile } from '@shared/types';
import { Button } from '@/components/ui/button';
import { ApiError, api } from '@/lib/api';
import { formatBytes, formatDateTime } from '@/lib/utils';
import { toast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';

function iconFor(mime: string) {
  if (mime.startsWith('image/')) return ImageIcon;
  if (mime.includes('json') || mime.includes('javascript') || mime.includes('xml'))
    return FileCode2;
  if (mime.includes('zip') || mime.includes('tar') || mime.includes('pdf')) return FileArchive;
  if (mime.startsWith('text/')) return FileText;
  return FileIcon;
}

export function FilesPage() {
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const load = () => {
    api
      .listFiles()
      .then(setFiles)
      .catch(() => toast('加载文件列表失败', 'error'));
  };

  useEffect(load, []);

  const upload = async (file: File) => {
    setUploading(true);
    try {
      await api.uploadFile(file);
      toast(`已上传 ${file.name}`, 'success');
      load();
    } catch {
      toast('上传失败', 'error');
    } finally {
      setUploading(false);
    }
  };

  const remove = async (file: UploadedFile) => {
    try {
      await api.deleteFile(file.id);
      toast('文件已删除', 'success');
      load();
    } catch (error) {
      if (!(error instanceof ApiError) || error.status !== 409) {
        toast('删除失败', 'error');
        return;
      }
      const names = ((error.data?.rules ?? []) as { name?: string }[])
        .map((rule) => rule.name)
        .filter(Boolean)
        .join('、');
      const ok = window.confirm(
        `该文件仍被 ${names || '部分规则'} 引用，删除后这些规则会返回 500。确定继续删除？`,
      );
      if (!ok) return;
      try {
        await api.deleteFile(file.id, true);
        toast('文件已删除', 'success');
        load();
      } catch {
        toast('删除失败', 'error');
      }
    }
  };

  return (
    <div className="h-full overflow-y-auto p-4">
      <div className="mx-auto max-w-[1100px] space-y-4">
        <div
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            const file = event.dataTransfer.files?.[0];
            if (file) void upload(file);
          }}
          className={cn(
            'glass flex flex-col items-center justify-center gap-2 rounded-2xl border-dashed py-10 transition-all duration-200',
            dragging ? 'border-brand-500/70 bg-brand-500/10' : 'border-white/[0.12]',
          )}
        >
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-gradient/20">
            <UploadCloud size={20} className="text-brand-300" />
          </div>
          <p className="text-[13.5px] font-medium text-muted-100">
            拖拽文件到此处，或
            <button
              type="button"
              className="mx-1 cursor-pointer text-brand-300 underline-offset-2 hover:underline"
              onClick={() => inputRef.current?.click()}
            >
              点击上传
            </button>
          </p>
          <p className="text-[11.5px] text-muted-300">单个文件最大 20 MB</p>
          <input
            ref={inputRef}
            type="file"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void upload(file);
              event.target.value = '';
            }}
          />
          {uploading ? <p className="text-[12px] text-brand-300">上传中…</p> : null}
        </div>

        <div className="glass overflow-hidden rounded-2xl">
          <div className="flex items-center justify-between border-b border-white/[0.07] px-4 py-2.5">
            <span className="panel-title">文件库 · {files.length}</span>
            <span className="text-[11.5px] text-muted-300">
              在规则的 File 响应类型中选择这里的文件
            </span>
          </div>
          {files.length === 0 ? (
            <p className="px-4 py-10 text-center text-[12.5px] text-muted-300">
              还没有上传任何文件
            </p>
          ) : (
            <table className="w-full text-left text-[12.5px]">
              <thead>
                <tr className="border-b border-white/[0.07] text-[11px] uppercase tracking-wider text-muted-300">
                  <th className="px-4 py-2 font-medium">文件名</th>
                  <th className="px-4 py-2 font-medium">类型</th>
                  <th className="px-4 py-2 font-medium">大小</th>
                  <th className="px-4 py-2 font-medium">上传时间</th>
                  <th className="px-4 py-2 text-right font-medium">操作</th>
                </tr>
              </thead>
              <tbody>
                {files.map((file) => {
                  const Icon = iconFor(file.mime);
                  return (
                    <tr
                      key={file.id}
                      className="border-b border-white/[0.04] transition-colors last:border-b-0 hover:bg-white/[0.03]"
                    >
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          <Icon size={15} className="text-brand-300" />
                          <span className="font-medium text-muted-100">{file.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-2.5 font-mono text-[11.5px] text-muted-200">
                        {file.mime}
                      </td>
                      <td className="px-4 py-2.5 font-mono text-[11.5px] text-muted-200">
                        {formatBytes(file.size)}
                      </td>
                      <td className="px-4 py-2.5 text-[11.5px] text-muted-300">
                        {formatDateTime(file.createdAt)}
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => window.open(api.fileUrl(file.id), '_blank')}
                          >
                            <Download size={12} />
                            下载
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            title="删除"
                            onClick={() => void remove(file)}
                          >
                            <Trash2 size={13} className="text-muted-300 hover:text-rose-300" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
