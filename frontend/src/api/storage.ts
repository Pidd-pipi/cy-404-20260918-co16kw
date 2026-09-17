import { Profile } from '../types/profile';
import { Resume } from '../types/resume';
import { ShareRecord } from '../types/share';
import { readStorage, storageKeys, writeStorage } from '../utils/storage';

export interface WorkspaceSnapshot {
  exportedAt: string;
  resumes: Resume[];
  activeResumeId: string | null;
  profile: Profile;
  selectedTemplateId: string;
  theme: 'light' | 'dark';
  shareRecords: ShareRecord[];
}

export function readWorkspaceSnapshot(fallbackProfile: Profile): WorkspaceSnapshot {
  return {
    exportedAt: new Date().toISOString(),
    resumes: readStorage<Resume[]>(storageKeys.resumes, []),
    activeResumeId: readStorage<string | null>(storageKeys.activeResumeId, null),
    profile: readStorage<Profile>(storageKeys.profile, fallbackProfile),
    selectedTemplateId: readStorage<string>(storageKeys.template, 'atelier'),
    theme: readStorage<'light' | 'dark'>(storageKeys.theme, 'light'),
    shareRecords: readStorage<ShareRecord[]>(storageKeys.shareRecords, []),
  };
}

export function writeWorkspaceSnapshot(snapshot: WorkspaceSnapshot): void {
  writeStorage(storageKeys.resumes, snapshot.resumes);
  writeStorage(storageKeys.activeResumeId, snapshot.activeResumeId);
  writeStorage(storageKeys.profile, snapshot.profile);
  writeStorage(storageKeys.template, snapshot.selectedTemplateId);
  writeStorage(storageKeys.theme, snapshot.theme);
  // 兼容旧版备份文件：缺少分享记录字段时按空列表恢复
  writeStorage(storageKeys.shareRecords, snapshot.shareRecords ?? []);
}
