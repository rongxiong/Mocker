import fs from 'node:fs';
import path from 'node:path';
import { Router } from 'express';
import type { Request, Response } from 'express';
import multer from 'multer';
import mime from 'mime-types';
import { MAX_UPLOAD_BYTES, UPLOAD_DIR } from '../config';
import { deleteFile, getFile, insertFile, listFiles } from '../db/fileRepo';
import { listRules } from '../db/ruleRepo';
import { uid } from '../defaults';
import type { UploadedFile } from '../types';

export const filesRouter = Router();

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    cb(null, UPLOAD_DIR);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uid()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
});

filesRouter.get('/', (_req: Request, res: Response) => {
  res.json({ files: listFiles() });
});

filesRouter.post('/upload', (req: Request, res: Response) => {
  upload.single('file')(req, res, (error: unknown) => {
    if (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(400).json({ error: message });
      return;
    }
    const uploaded = req.file;
    if (!uploaded) {
      res.status(400).json({ error: 'No file received' });
      return;
    }
    const record: UploadedFile = {
      id: uid(),
      name: uploaded.originalname,
      size: uploaded.size,
      mime: uploaded.mimetype || mime.lookup(uploaded.originalname) || 'application/octet-stream',
      storedName: uploaded.filename,
      createdAt: Date.now(),
    };
    insertFile(record);
    res.status(201).json({ file: record });
  });
});

filesRouter.get('/:id/download', (req: Request, res: Response) => {
  const record = getFile(String(req.params.id));
  if (!record) {
    res.status(404).json({ error: 'File not found' });
    return;
  }
  const filePath = path.join(UPLOAD_DIR, path.basename(record.storedName));
  if (!fs.existsSync(filePath)) {
    res.status(404).json({ error: 'File content is missing on disk' });
    return;
  }
  res.download(filePath, record.name);
});

filesRouter.delete('/:id', (req: Request, res: Response) => {
  const record = getFile(String(req.params.id));
  if (!record) {
    res.status(404).json({ error: 'File not found' });
    return;
  }
  // Deleting a file that rules still point at would break those rules at
  // request time (500 "Referenced file was not found"), so refuse unless the
  // caller explicitly forces it with `?force=1`.
  const referencing = listRules().filter(
    (rule) => rule.responseType === 'file' && rule.fileId === record.id,
  );
  if (referencing.length > 0 && req.query.force !== '1') {
    res.status(409).json({
      error: `File is referenced by ${referencing.length} rule(s)`,
      rules: referencing.map((rule) => ({
        id: rule.id,
        name: rule.name,
        method: rule.method,
        path: rule.path,
      })),
    });
    return;
  }

  const filePath = path.join(UPLOAD_DIR, path.basename(record.storedName));
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  deleteFile(String(req.params.id));
  res.json({ ok: true });
});
