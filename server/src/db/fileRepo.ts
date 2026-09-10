import { all, get, run } from './index';
import type { UploadedFile } from '../types';

interface FileRow {
  id: string;
  name: string;
  size: number;
  mime: string;
  stored_name: string;
  created_at: number;
}

function rowToFile(row: FileRow): UploadedFile {
  return {
    id: row.id,
    name: row.name,
    size: Number(row.size ?? 0),
    mime: row.mime ?? '',
    storedName: row.stored_name ?? '',
    createdAt: Number(row.created_at ?? 0),
  };
}

export function listFiles(): UploadedFile[] {
  return all<FileRow>('SELECT * FROM files ORDER BY created_at DESC').map(rowToFile);
}

export function getFile(id: string): UploadedFile | undefined {
  const row = get<FileRow>('SELECT * FROM files WHERE id = ?', id);
  return row ? rowToFile(row) : undefined;
}

export function insertFile(file: UploadedFile): UploadedFile {
  run(
    'INSERT INTO files (id, name, size, mime, stored_name, created_at) VALUES (?,?,?,?,?,?)',
    file.id,
    file.name,
    file.size,
    file.mime,
    file.storedName,
    file.createdAt,
  );
  return file;
}

export function deleteFile(id: string): boolean {
  return run('DELETE FROM files WHERE id = ?', id).changes > 0;
}
