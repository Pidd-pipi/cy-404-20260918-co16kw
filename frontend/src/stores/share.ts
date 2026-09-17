import { create } from 'zustand';
import { Profile } from '../types/profile';
import { Resume } from '../types/resume';
import { ShareRecord } from '../types/share';
import { readStorage, storageKeys, writeStorage } from '../utils/storage';
import { buildShareRecord } from '../utils/share';

interface ShareState {
  records: ShareRecord[];
  /**
   * 为指定简历生成一份新的分享记录。每次生成都会追加一条独立记录，
   * 不会覆盖同一简历的历史记录；链接超长时抛出 ShareLinkTooLongError，
   * 且不会产生任何记录。
   */
  createShareRecord: (resume: Resume, profile: Profile) => ShareRecord;
  /** 撤销一条分享记录，只删除该条，不影响其他记录及其链接 */
  revokeShareRecord: (recordId: string) => void;
}

function persist(records: ShareRecord[]): void {
  writeStorage(storageKeys.shareRecords, records);
}

export const useShareStore = create<ShareState>((set, get) => ({
  records: readStorage<ShareRecord[]>(storageKeys.shareRecords, []),
  createShareRecord: (resume, profile) => {
    const record = buildShareRecord(resume, profile);
    set((state) => ({ records: [record, ...state.records] }));
    persist(get().records);
    return record;
  },
  revokeShareRecord: (recordId) => {
    set((state) => ({ records: state.records.filter((record) => record.id !== recordId) }));
    persist(get().records);
  },
}));
