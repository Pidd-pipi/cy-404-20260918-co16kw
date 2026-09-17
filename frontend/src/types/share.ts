import { Resume } from './resume';

/** 只读分享快照格式版本，后续结构升级必须递增。 */
export const SHARE_SNAPSHOT_VERSION = 1 as const;

/** 单个分享链接（含 hash）允许的最大长度，超过即明确失败。 */
export const MAX_SHARE_URL_LENGTH = 16000;

/** hash 中承载分享快照的前缀，例如 https://host/#share/<token>。 */
export const SHARE_HASH_PREFIX = '#share/';

/** 允许出现在分享快照中的简历模块标识，顺序即固定的模块范围约定。 */
export const SHAREABLE_SECTION_IDS = ['summary', 'work', 'projects', 'skills', 'education'] as const;

export type ShareSectionId = (typeof SHAREABLE_SECTION_IDS)[number];

/** 快照里锁定的模块：范围与标题、顺序在生成时固化。 */
export interface ShareSectionScope {
  id: ShareSectionId;
  title: string;
}

/** 某个时间点的只读简历快照。快照内容完全独立于本机简历。 */
export interface ShareSnapshot {
  formatVersion: typeof SHARE_SNAPSHOT_VERSION;
  resumeId: string;
  resumeTitle: string;
  templateId: string;
  createdAt: string;
  basicInfo: Resume['basicInfo'];
  summary: string;
  sections: ShareSectionScope[];
  workExperiences: Resume['workExperiences'];
  educations: Resume['educations'];
  skills: Resume['skills'];
  projects: Resume['projects'];
}

/** 本机保存的一条分享记录（不含 token 的校验能力，仅做元数据与核对）。 */
export interface ShareRecord {
  id: string;
  resumeId: string;
  resumeTitle: string;
  createdAt: string;
  /** 完整只读链接。 */
  url: string;
  /** 链接中的载荷 token。 */
  token: string;
  /** 快照内锁定的模块顺序。 */
  sectionIds: ShareSectionId[];
  /** 从 token 中解出的载荷 hash，用于刷新/备份往返后的核对。 */
  payloadDigest: string;
  /** 链接总长度，便于发现超长记录。 */
  urlLength: number;
}

/** 解码分享链接时的明确失败原因。 */
export type ShareErrorCode =
  | 'NOT_A_SHARE_LINK'
  | 'UNSUPPORTED_VERSION'
  | 'MALFORMED_TOKEN'
  | 'LENGTH_EXCEEDED'
  | 'PAYLOAD_TAMPERED'
  | 'CORRUPT_PAYLOAD'
  | 'INVALID_SNAPSHOT';

/** 解码成功的结果。 */
export interface DecodedShare {
  snapshot: ShareSnapshot;
  digest: string;
}
