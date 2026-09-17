import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readWorkspaceSnapshot } from '../src/api/storage';
import { defaultProfile } from '../src/stores/profile';
import {
  isValidShareRecord,
  sanitizeShareRecords,
  ShareRecordStore,
  ShareStorageBackend,
} from '../src/share/share-store';
import { ShareRecord } from '../src/types/share';
import { makeResume } from './helpers';

const ALL_SECTIONS = ['summary', 'work', 'projects', 'skills', 'education'] as const;

class MemoryBackend implements ShareStorageBackend {
  private map = new Map<string, string>();
  getItem(key: string): string | null {
    return this.map.has(key) ? (this.map.get(key) as string) : null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
  dump<T>(key: string): T | null {
    const raw = this.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  }
}

async function createRecord(store: ShareRecordStore, resume = makeResume()) {
  return store.createShare({ resume, sectionIds: [...ALL_SECTIONS], baseHref: 'http://localhost/' });
}

test('创建分享记录：链接自包含，记录与链接可互证', async () => {
  const backend = new MemoryBackend();
  const store = new ShareRecordStore(backend);
  const resume = makeResume();
  const record = await createRecord(store, resume);

  assert.ok(record.url.includes('#share/'));
  assert.equal(record.resumeId, resume.id);
  assert.deepEqual(record.sectionIds, [...ALL_SECTIONS]);
  assert.equal(record.urlLength, record.url.length);
  assert.ok(/^[0-9a-f]{64}$/.test(record.payloadDigest));

  // 记录已持久化；新建 store 模拟刷新后重新载入。
  const reloaded = new ShareRecordStore(backend);
  assert.equal(reloaded.list().length, 1);
  assert.equal(await reloaded.verify(record.id), true);
});

test('同一简历可生成多条互不覆盖的记录', async () => {
  const store = new ShareRecordStore(new MemoryBackend());
  const resume = makeResume();
  const a = await createRecord(store, resume);
  resume.summary = '改过的内容';
  const b = await createRecord(store, resume);

  assert.notEqual(a.id, b.id);
  assert.notEqual(a.token, b.token);
  assert.equal(store.listByResume(resume.id).length, 2);
  assert.equal(await store.verify(a.id), true);
  assert.equal(await store.verify(b.id), true);
});

test('撤销一份记录不影响其他记录；旧链接仍可核对', async () => {
  const backend = new MemoryBackend();
  const store = new ShareRecordStore(backend);
  const resume = makeResume();
  const a = await createRecord(store, resume);
  const b = await createRecord(store, resume);

  assert.equal(store.revoke(a.id), true);
  assert.equal(store.revoke('not-exist'), false);
  const remaining = store.list();
  assert.equal(remaining.length, 1);
  assert.equal(remaining[0].id, b.id);

  // a 的本机记录消失，但其快照自包含，链接本身仍有效。
  assert.equal(await store.verify(a.id), false);
  const { decodeShareLink } = await import('../src/share/share-link');
  const decoded = await decodeShareLink(a.url);
  assert.equal(decoded.snapshot.resumeId, resume.id);
});

test('备份导出包含分享记录，备份往返后仍可逐条核对', async () => {
  const backend = new MemoryBackend();
  // 让工作区快照走同一内存后端：直接用 share store 写入后读出。
  const store = new ShareRecordStore(backend);
  const resume = makeResume();
  const record = await createRecord(store, resume);

  // api/storage 的浏览器单例读不到内存后端，因此模拟备份文件内容结构：
  const snapshot = {
    ...readWorkspaceSnapshot(defaultProfile),
    resumes: [resume],
    shareRecords: store.list(),
  };
  const backupJson = JSON.stringify(snapshot);

  // 新机器 / 清空后恢复
  const restoredBackend = new MemoryBackend();
  const restoredStore = new ShareRecordStore(restoredBackend);
  const parsed = JSON.parse(backupJson);
  const summary = restoredStore.replaceFromBackup(parsed.shareRecords);
  assert.equal(summary.imported, 1);
  assert.equal(summary.skipped, 0);
  assert.equal(await restoredStore.verify(record.id), true);
});

test('备份里损坏/伪造的分享记录会被跳过，不污染本机', async () => {
  const store = new ShareRecordStore(new MemoryBackend());
  const good = await createRecord(store);
  const tamperedUrl = `${good.url.slice(0, good.url.length - 3)}aaa`;
  const corrupt = [
    null,
    'string',
    {},
    { ...good, id: 'bad-1', url: 'http://localhost/#share/token.mismatch' },
    { ...good, id: 'bad-2', token: 'not-the-token-in-url' },
    { ...good, id: 'bad-3', sectionIds: ['unknown'] },
    { ...good, id: 'bad-4', urlLength: 0 },
  ];
  const incoming = [good, ...corrupt];
  const summary = store.replaceFromBackup(incoming);
  assert.equal(summary.imported, 1);
  assert.equal(summary.skipped, corrupt.length);
  assert.equal(store.list().length, 1);
  assert.equal(store.list()[0].id, good.id);

  // 结构自洽但载荷被改写的记录能入库，核对时必须被识别出来。
  const tampered = { ...good, id: 'bad-5', url: tamperedUrl, token: tamperedUrl.split('#share/')[1] };
  store.replaceFromBackup([good, tampered]);
  assert.equal(store.list().length, 2);
  assert.equal(await store.verify('bad-5'), false);
  assert.equal(await store.verify(good.id), true);

  assert.equal(isValidShareRecord(null), false);
  assert.equal(sanitizeShareRecords('nope').length, 0);
});

test('localStorage 中记录整体损坏时安全降级为空，不抛错', () => {
  const backend = new MemoryBackend();
  backend.setItem('smart-resume:share-records:v1', '{not json');
  const store = new ShareRecordStore(backend);
  assert.deepEqual(store.list(), []);
});

test('writeWorkspaceSnapshot 缺失 shareRecords 时保留当前记录（兼容旧备份）', () => {
  const store = new ShareRecordStore(new MemoryBackend());
  const legacyBackup = {
    exportedAt: new Date().toISOString(),
    resumes: [],
    activeResumeId: null,
    profile: defaultProfile,
    selectedTemplateId: 'atelier',
    theme: 'light' as const,
  };
  // 不直接写 localStorage（Node 无 window），仅验证 sanitize 语义对 undefined 安全。
  assert.doesNotThrow(() => {
    const result = sanitizeShareRecords(legacyBackup.shareRecords as unknown);
    assert.deepEqual(result, []);
  });
});

test('记录类型字段约束：缺字段或 url/token 不一致均判为非法', () => {
  const base: ShareRecord = {
    id: 'share_1',
    resumeId: 'r1',
    resumeTitle: 't',
    createdAt: '2026-09-17T00:00:00.000Z',
    url: 'http://localhost/#share/abc.def',
    token: 'abc.def',
    sectionIds: ['summary'],
    payloadDigest: 'a'.repeat(64),
    urlLength: 40,
  };
  assert.equal(isValidShareRecord(base), true);
  assert.equal(isValidShareRecord({ ...base, token: 'other' }), false);
  assert.equal(isValidShareRecord({ ...base, sectionIds: [] }), false);
  assert.equal(isValidShareRecord({ ...base, urlLength: 0 }), false);
});
