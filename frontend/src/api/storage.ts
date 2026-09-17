import { Profile } from '../types/profile';
import { Resume } from '../types/resume';
import { ShareRecord } from '../types/share';
import { readStorage, storageKeys, writeStorage } from '../utils/storage';
import { sanitizeShareRecords, shareRecordStore } from '../share/share-store';

export interface WorkspaceSnapshot {
  exportedAt: string;
  resumes: Resume[];
  activeResumeId: string | null;
  profile: Profile;
  selectedTemplateId: string;
  theme: 'light' | 'dark';
  /**
   * 只读分享记录。缺失时按旧备份处理（保留当前记录）；
   * 存在时先清洗再整组替换，损坏条目被跳过，不会影响简历数据。
   */
  shareRecords?: ShareRecord[];
}

export function readWorkspaceSnapshot(fallbackProfile: Profile): WorkspaceSnapshot {
  return {
    exportedAt: new Date().toISOString(),
    resumes: readStorage<Resume[]>(storageKeys.resumes, []),
    activeResumeId: readStorage<string | null>(storageKeys.activeResumeId, null),
    profile: readStorage<Profile>(storageKeys.profile, fallbackProfile),
    selectedTemplateId: readStorage<string>(storageKeys.template, 'atelier'),
    theme: readStorage<'light' | 'dark'>(storageKeys.theme, 'light'),
    shareRecords: shareRecordStore.list(),
  };
}

export function writeWorkspaceSnapshot(snapshot: WorkspaceSnapshot): void {
  writeStorage(storageKeys.resumes, snapshot.resumes);
  writeStorage(storageKeys.activeResumeId, snapshot.activeResumeId);
  writeStorage(storageKeys.profile, snapshot.profile);
  writeStorage(storageKeys.template, snapshot.selectedTemplateId);
  writeStorage(storageKeys.theme, snapshot.theme);
  if (snapshot.shareRecords !== undefined) {
    shareRecordStore.replaceFromBackup(snapshot.shareRecords);
  }
}

/** 供导入前预览统计：返回备份中有效/损坏的分享记录数量。 */
export function inspectBackupShareRecords(raw: unknown): { valid: number; invalid: number } {
  const cleaned = sanitizeShareRecords(raw);
  const total = Array.isArray(raw) ? raw.length : 0;
  return { valid: cleaned.length, invalid: Math.max(0, total - cleaned.length) };
}
