// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readWorkspaceSnapshot, writeWorkspaceSnapshot, WorkspaceSnapshot } from '../api/storage';
import { Profile } from '../types/profile';
import { Resume } from '../types/resume';
import { ShareRecord } from '../types/share';
import { parseShareHash, ShareLinkTooLongError } from '../utils/share';
import { readStorage, storageKeys } from '../utils/storage';
import { useShareStore } from './share';

function makeResume(patch: Partial<Resume> = {}): Resume {
  return {
    id: 'resume_store_1',
    title: '产品经理简历',
    templateId: 'atelier',
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
    basicInfo: {
      fullName: '林知远',
      headline: '产品经理',
      phone: '13800000000',
      email: 'lin@example.com',
      location: '上海',
      website: 'example.com',
      avatarUrl: '',
    },
    summary: '八年产品经验。',
    sections: [
      { id: 'summary', title: '职业摘要', enabled: true },
      { id: 'work', title: '工作经历', enabled: true },
    ],
    workExperiences: [],
    educations: [],
    skills: [],
    projects: [],
    ...patch,
  };
}

function makeProfile(patch: Partial<Profile> = {}): Profile {
  return {
    fullName: '林知远',
    headline: '产品经理',
    phone: '13800000000',
    email: 'lin@example.com',
    location: '上海',
    website: 'example.com',
    avatarUrl: '',
    targetRole: '高级产品经理',
    summary: '全局资料摘要。',
    ...patch,
  };
}

beforeEach(() => {
  window.localStorage.clear();
  useShareStore.setState({ records: [] });
});

describe('分享记录管理', () => {
  it('同一简历可生成多份互不覆盖的分享记录', () => {
    const resume = makeResume();
    const first = useShareStore.getState().createShareRecord(resume, makeProfile());
    const second = useShareStore.getState().createShareRecord(resume, makeProfile());

    expect(first.id).not.toBe(second.id);
    expect(first.token).not.toBe(second.token);

    const records = useShareStore.getState().records;
    expect(records).toHaveLength(2);
    expect(records.map((record) => record.id)).toEqual(expect.arrayContaining([first.id, second.id]));
  });

  it('旧链接在源简历修改后仍解析为当时快照，重新生成才产生新快照', () => {
    const resume = makeResume();
    const before = useShareStore.getState().createShareRecord(resume, makeProfile());

    const edited = makeResume({ title: '改写后的标题', summary: '改写后的内容' });
    const after = useShareStore.getState().createShareRecord(edited, makeProfile());

    const oldResult = parseShareHash(`#${before.token}`);
    const newResult = parseShareHash(`#${after.token}`);
    expect(oldResult.ok && oldResult.payload.resume.title).toBe('产品经理简历');
    expect(newResult.ok && newResult.payload.resume.title).toBe('改写后的标题');
  });

  it('撤销一条记录不影响其他记录及其链接', () => {
    const resume = makeResume();
    const first = useShareStore.getState().createShareRecord(resume, makeProfile());
    const second = useShareStore.getState().createShareRecord(resume, makeProfile());

    useShareStore.getState().revokeShareRecord(first.id);

    const records = useShareStore.getState().records;
    expect(records).toHaveLength(1);
    expect(records[0].id).toBe(second.id);
    expect(parseShareHash(`#${second.token}`).ok).toBe(true);
  });

  it('生成失败（超长）时不产生任何记录', () => {
    const huge = makeResume({ summary: '长'.repeat(200_000) });
    expect(() => useShareStore.getState().createShareRecord(huge, makeProfile())).toThrow(
      ShareLinkTooLongError,
    );
    expect(useShareStore.getState().records).toHaveLength(0);
    expect(readStorage<ShareRecord[]>(storageKeys.shareRecords, [])).toHaveLength(0);
  });

  it('记录持久化到本机存储，刷新后仍可核对', async () => {
    const record = useShareStore.getState().createShareRecord(makeResume(), makeProfile());

    const persisted = readStorage<ShareRecord[]>(storageKeys.shareRecords, []);
    expect(persisted).toHaveLength(1);
    expect(persisted[0]).toEqual(record);

    // 模拟刷新：重置模块后重新加载 store，应从本机存储恢复记录
    vi.resetModules();
    const { useShareStore: reloaded } = await import('./share');
    expect(reloaded.getState().records).toHaveLength(1);
    expect(reloaded.getState().records[0].id).toBe(record.id);
    expect(parseShareHash(`#${reloaded.getState().records[0].token}`).ok).toBe(true);
  });

  it('解析失败路径不触碰本机简历数据', () => {
    const resumesBefore = [makeResume()];
    window.localStorage.setItem(storageKeys.resumes, JSON.stringify(resumesBefore));

    parseShareHash('#v1.corrupted!!!');
    parseShareHash('#v2.whatever');
    parseShareHash(`#v1.${'a'.repeat(9000)}`);
    parseShareHash('');

    expect(JSON.parse(window.localStorage.getItem(storageKeys.resumes) ?? '[]')).toEqual(resumesBefore);
    expect(useShareStore.getState().records).toHaveLength(0);
  });
});

describe('备份往返', () => {
  function makeSnapshot(records: ShareRecord[]): WorkspaceSnapshot {
    return {
      exportedAt: new Date().toISOString(),
      resumes: [makeResume()],
      activeResumeId: 'resume_store_1',
      profile: makeProfile(),
      selectedTemplateId: 'atelier',
      theme: 'light',
      shareRecords: records,
    };
  }

  it('分享记录随工作区导出，导入后仍可核对', () => {
    const record = useShareStore.getState().createShareRecord(makeResume(), makeProfile());

    // 导出 → 序列化为文件内容 → 清空本机 → 重新导入
    const exported = JSON.stringify(readWorkspaceSnapshot(makeProfile()));
    window.localStorage.clear();
    useShareStore.setState({ records: [] });
    writeWorkspaceSnapshot(JSON.parse(exported) as WorkspaceSnapshot);

    const restored = readStorage<ShareRecord[]>(storageKeys.shareRecords, []);
    expect(restored).toHaveLength(1);
    expect(restored[0].id).toBe(record.id);
    expect(restored[0].checksum).toBe(record.checksum);

    const result = parseShareHash(`#${restored[0].token}`);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload.checksum).toBe(record.checksum);
      expect(result.payload.resume.title).toBe('产品经理简历');
    }
  });

  it('旧版备份缺少分享记录字段时按空列表恢复', () => {
    const snapshot = makeSnapshot([]);
    const legacy = { ...snapshot } as Partial<WorkspaceSnapshot>;
    delete legacy.shareRecords;

    writeWorkspaceSnapshot(legacy as WorkspaceSnapshot);
    expect(readStorage<ShareRecord[]>(storageKeys.shareRecords, [])).toEqual([]);
  });
});
