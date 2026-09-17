import { Profile } from './profile';
import { Resume } from './resume';

/**
 * 分享链接协议版本。只有完全匹配当前版本的链接才会被打开，
 * 旧版或未知版本的链接会被明确拒绝。
 */
export const SHARE_PAYLOAD_VERSION = 1;

/**
 * 完整分享链接（含 origin 与 hash）允许的最大长度。
 * 超过该长度的链接在生成时会被拒绝，在打开时会明确失败。
 */
export const MAX_SHARE_URL_LENGTH = 8000;

/**
 * 编码进分享链接 hash 的快照数据。
 * 链接自包含全部渲染所需内容，打开时不依赖服务端，
 * 也不读取本机当前的简历或资料数据。
 */
export interface SharePayload {
  /** 协议版本，固定为 SHARE_PAYLOAD_VERSION */
  v: number;
  /** 分享记录 id，与本机分享记录一一对应 */
  id: string;
  /** 快照生成时间（ISO 字符串） */
  createdAt: string;
  /** 对 v/id/createdAt/resume/profile 计算的内容校验码 */
  checksum: string;
  /** 生成时刻的简历快照（深拷贝，之后源简历改动不影响） */
  resume: Resume;
  /** 生成时刻的全局资料快照，用于回填简历中的空字段 */
  profile: Profile;
}

/**
 * 本机持久化的分享记录。记录只存管理所需的最小信息，
 * token 可完整重建分享链接；撤销记录只删除该条记录本身。
 */
export interface ShareRecord {
  id: string;
  resumeId: string;
  resumeTitle: string;
  createdAt: string;
  checksum: string;
  /** 快照中启用的模块数量，便于核对 */
  sectionCount: number;
  /** 链接 hash 中的 token 部分（v1.xxx），可重建完整链接 */
  token: string;
}

export type ShareParseError =
  | 'empty'
  | 'too-long'
  | 'malformed'
  | 'unsupported-version';

export type ShareParseResult =
  | { ok: true; payload: SharePayload }
  | { ok: false; error: ShareParseError };
