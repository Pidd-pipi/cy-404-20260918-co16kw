import { Resume } from '../types/resume';
import { ShareRecord, ShareSectionId } from '../types/share';
import { createId } from '../utils/format';
import { storageKeys } from '../utils/storage';
import { buildShareSnapshot } from './snapshot';
import { decodeShareLink, encodeShareLink, extractShareToken } from './share-link';

/** 极简存储后端，便于在 Node 测试中注入内存实现。 */
export interface ShareStorageBackend {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface CreateShareInput {
  resume: Resume;
  sectionIds: ShareSectionId[];
  baseHref?: string;
}

export interface ImportSummary {
  imported: number;
  skipped: number;
  total: number;
}

function isStringArrayOf(value: unknown, allowed: readonly string[]): value is ShareSectionId[] {
  return (
    Array.isArray(value) &&
    value.every((item) => typeof item === 'string' && allowed.includes(item)) &&
    new Set(value).size === value.length
  );
}

/** 校验一条未知数据是否为结构合法的分享记录。不重新解码链接。 */
export function isValidShareRecord(value: unknown): value is ShareRecord {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const record = value as Partial<ShareRecord>;
  return (
    typeof record.id === 'string' &&
    typeof record.resumeId === 'string' &&
    typeof record.resumeTitle === 'string' &&
    typeof record.createdAt === 'string' &&
    typeof record.url === 'string' &&
    typeof record.token === 'string' &&
    typeof record.payloadDigest === 'string' &&
    typeof record.urlLength === 'number' &&
    record.urlLength > 0 &&
    isStringArrayOf(record.sectionIds, ['summary', 'work', 'projects', 'skills', 'education']) &&
    record.sectionIds.length > 0 &&
    extractShareToken(record.url) === record.token
  );
}

/** 清洗备份/持久化中的记录：丢弃损坏项，且 id 去重，绝不抛错污染本机简历。 */
export function sanitizeShareRecords(values: unknown): ShareRecord[] {
  if (!Array.isArray(values)) {
    return [];
  }
  const seenIds = new Set<string>();
  const records: ShareRecord[] = [];
  for (const value of values) {
    if (!isValidShareRecord(value) || seenIds.has(value.id)) {
      continue;
    }
    seenIds.add(value.id);
    records.push(value);
  }
  return records;
}

/**
 * 分享记录库。所有写入都经过 {@link sanitizeShareRecords} 或即时生成，
 * 保证损坏数据无法落库；删除一份记录不触碰其他记录，也不影响已经发出的链接。
 */
export class ShareRecordStore {
  private records: ShareRecord[];

  constructor(private readonly backend: ShareStorageBackend | null = null) {
    this.records = this.load();
  }

  private storageKey(): string {
    return storageKeys.shareRecords;
  }

  private load(): ShareRecord[] {
    if (!this.backend) {
      return [];
    }
    try {
      const raw = this.backend.getItem(this.storageKey());
      if (!raw) {
        return [];
      }
      return sanitizeShareRecords(JSON.parse(raw));
    } catch {
      // 本机记录损坏时仅视为空，不影响简历数据；可通过重新生成恢复。
      return [];
    }
  }

  private persist(): void {
    if (!this.backend) {
      return;
    }
    this.backend.setItem(this.storageKey(), JSON.stringify(this.records));
  }

  list(): ShareRecord[] {
    return this.records;
  }

  listByResume(resumeId: string): ShareRecord[] {
    return this.records.filter((record) => record.resumeId === resumeId);
  }

  /** 生成一份全新的、与既有记录互不覆盖的只读分享链接。 */
  async createShare(input: CreateShareInput): Promise<ShareRecord> {
    const snapshot = buildShareSnapshot(input.resume, input.sectionIds);
    const url = await encodeShareLink(snapshot, input.baseHref);
    const token = extractShareToken(url);
    if (!token) {
      throw new Error('生成分享链接失败。');
    }
    const { digest } = await decodeShareLink(token);
    const record: ShareRecord = {
      id: createId('share'),
      resumeId: input.resume.id,
      resumeTitle: input.resume.title,
      createdAt: snapshot.createdAt,
      url,
      token,
      sectionIds: snapshot.sections.map((section) => section.id),
      payloadDigest: digest,
      urlLength: url.length,
    };
    this.records = [record, ...this.records];
    this.persist();
    return record;
  }

  /** 撤销一份分享记录：只删本机记录，其他记录与旧链接（快照自包含）都不受影响。 */
  revoke(recordId: string): boolean {
    const next = this.records.filter((record) => record.id !== recordId);
    const removed = next.length !== this.records.length;
    if (removed) {
      this.records = next;
      this.persist();
    }
    return removed;
  }

  /**
   * 重新核对记录里的链接是否还能完整解出且载荷一致。
   * 用于刷新后自检以及备份往返后的核对。
   */
  async verify(recordId: string): Promise<boolean> {
    const record = this.records.find((item) => item.id === recordId);
    if (!record) {
      return false;
    }
    try {
      const { snapshot, digest } = await decodeShareLink(record.url);
      return (
        digest === record.payloadDigest &&
        snapshot.resumeId === record.resumeId &&
        snapshot.sections.map((section) => section.id).join(',') === record.sectionIds.join(',')
      );
    } catch {
      return false;
    }
  }

  /** 用备份内容替换全部记录，损坏项被跳过；返回导入统计。 */
  replaceFromBackup(values: unknown): ImportSummary {
    const incoming = sanitizeShareRecords(values);
    this.records = incoming;
    this.persist();
    return {
      imported: incoming.length,
      skipped: Array.isArray(values) ? values.length - incoming.length : values == null ? 0 : 0,
      total: incoming.length,
    };
  }

  clearAll(): void {
    this.records = [];
    if (this.backend) {
      this.backend.removeItem(this.storageKey());
    }
  }
}

const browserBackend: ShareStorageBackend | null =
  typeof window !== 'undefined' && window.localStorage
    ? {
        getItem: (key) => window.localStorage.getItem(key),
        setItem: (key, value) => window.localStorage.setItem(key, value),
        removeItem: (key) => window.localStorage.removeItem(key),
      }
    : null;

/** 浏览器侧单例，刷新页面后从 localStorage 重新载入并自动清洗。 */
export const shareRecordStore = new ShareRecordStore(browserBackend);
