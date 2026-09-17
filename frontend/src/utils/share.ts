import { Profile } from '../types/profile';
import { Resume } from '../types/resume';
import {
  MAX_SHARE_URL_LENGTH,
  SHARE_PAYLOAD_VERSION,
  ShareParseResult,
  SharePayload,
  ShareRecord,
} from '../types/share';
import { createId } from './format';

/** 生成链接超长时抛出的错误，调用方应捕获并提示用户精简内容 */
export class ShareLinkTooLongError extends Error {
  constructor(public readonly urlLength: number) {
    super(`分享链接长度 ${urlLength} 超出限制 ${MAX_SHARE_URL_LENGTH}`);
    this.name = 'ShareLinkTooLongError';
  }
}

/** FNV-1a 32 位哈希，输出 8 位十六进制校验码，稳定且不依赖运行环境 */
export function checksumOf(text: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/** 计算快照内容校验码：覆盖除 checksum 自身外的全部字段 */
function checksumPayload(payload: Omit<SharePayload, 'checksum'>): string {
  return checksumOf(
    JSON.stringify({
      v: payload.v,
      id: payload.id,
      createdAt: payload.createdAt,
      resume: payload.resume,
      profile: payload.profile,
    }),
  );
}

function base64UrlEncode(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(encoded: string): string {
  if (!/^[A-Za-z0-9_-]+$/.test(encoded)) {
    throw new Error('invalid base64url characters');
  }
  const base64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** 结构守卫：只校验渲染所必需的形状，防止损坏数据进入视图层 */
function isSharePayloadShape(value: unknown): value is SharePayload {
  if (!isRecord(value)) {
    return false;
  }
  const resume = value.resume;
  const profile = value.profile;
  return (
    typeof value.v === 'number' &&
    typeof value.id === 'string' &&
    typeof value.createdAt === 'string' &&
    typeof value.checksum === 'string' &&
    isRecord(resume) &&
    typeof resume.id === 'string' &&
    typeof resume.title === 'string' &&
    typeof resume.templateId === 'string' &&
    isRecord(resume.basicInfo) &&
    typeof resume.summary === 'string' &&
    Array.isArray(resume.sections) &&
    Array.isArray(resume.workExperiences) &&
    Array.isArray(resume.educations) &&
    Array.isArray(resume.skills) &&
    Array.isArray(resume.projects) &&
    isRecord(profile)
  );
}

/**
 * 由当前简历与资料构建不可变快照 payload。
 * 深拷贝输入，之后对源简历的任何修改都不会渗入已生成的快照。
 */
export function buildSharePayload(resume: Resume, profile: Profile, now = new Date()): SharePayload {
  const snapshotResume = JSON.parse(JSON.stringify(resume)) as Resume;
  const snapshotProfile = JSON.parse(JSON.stringify(profile)) as Profile;
  const base = {
    v: SHARE_PAYLOAD_VERSION,
    id: createId('share'),
    createdAt: now.toISOString(),
    resume: snapshotResume,
    profile: snapshotProfile,
  };
  return { ...base, checksum: checksumPayload(base) };
}

/** 把快照 payload 编码为链接 hash 中的 token（v1.xxx） */
export function encodeShareToken(payload: SharePayload): string {
  return `v${SHARE_PAYLOAD_VERSION}.${base64UrlEncode(JSON.stringify(payload))}`;
}

/** 由 token 重建完整分享链接 */
export function buildShareUrl(token: string): string {
  const base = typeof window === 'undefined' ? '/' : import.meta.env.BASE_URL;
  const origin = typeof window === 'undefined' ? '' : window.location.origin;
  return `${origin}${base}share#${token}`;
}

/**
 * 生成一份分享记录。若完整链接超出长度限制则抛出
 * ShareLinkTooLongError，此时不产生任何记录。
 */
export function buildShareRecord(resume: Resume, profile: Profile, now = new Date()): ShareRecord {
  const payload = buildSharePayload(resume, profile, now);
  const token = encodeShareToken(payload);
  const url = buildShareUrl(token);
  if (url.length > MAX_SHARE_URL_LENGTH) {
    throw new ShareLinkTooLongError(url.length);
  }
  return {
    id: payload.id,
    resumeId: resume.id,
    resumeTitle: resume.title,
    createdAt: payload.createdAt,
    checksum: payload.checksum,
    sectionCount: resume.sections.filter((section) => section.enabled).length,
    token,
  };
}

/**
 * 解析分享链接的 hash（如 "#v1.xxx"）。
 * 任何损坏、旧版或超长输入都会以明确错误失败，且本函数为纯函数，
 * 不会读写任何本机存储，失败时不会污染本机简历数据。
 */
export function parseShareHash(hash: string): ShareParseResult {
  if (!hash || hash === '#') {
    return { ok: false, error: 'empty' };
  }
  if (hash.length > MAX_SHARE_URL_LENGTH) {
    return { ok: false, error: 'too-long' };
  }

  const token = hash.startsWith('#') ? hash.slice(1) : hash;
  const separatorIndex = token.indexOf('.');
  if (separatorIndex <= 0) {
    return { ok: false, error: 'malformed' };
  }

  const tag = token.slice(0, separatorIndex);
  const data = token.slice(separatorIndex + 1);
  if (!/^v\d+$/.test(tag)) {
    return { ok: false, error: 'malformed' };
  }
  if (tag !== `v${SHARE_PAYLOAD_VERSION}`) {
    return { ok: false, error: 'unsupported-version' };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(base64UrlDecode(data));
  } catch {
    return { ok: false, error: 'malformed' };
  }

  if (!isSharePayloadShape(parsed)) {
    return { ok: false, error: 'malformed' };
  }
  if (parsed.v !== SHARE_PAYLOAD_VERSION) {
    return { ok: false, error: 'unsupported-version' };
  }

  const { checksum, ...rest } = parsed;
  if (checksumPayload(rest) !== checksum) {
    return { ok: false, error: 'malformed' };
  }

  return { ok: true, payload: parsed };
}
