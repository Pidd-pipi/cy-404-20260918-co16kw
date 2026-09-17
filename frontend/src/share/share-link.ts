import {
  DecodedShare,
  MAX_SHARE_URL_LENGTH,
  SHARE_HASH_PREFIX,
  SHARE_SNAPSHOT_VERSION,
  ShareErrorCode,
  ShareSectionId,
  ShareSnapshot,
  SHAREABLE_SECTION_IDS,
} from '../types/share';

/**
 * 只读分享链接编码/解码。
 *
 * 链接形如 `<baseHref>${SHARE_HASH_PREFIX}<token>`，快照整体放在 URL hash 中：
 * 打开时无需服务端参与，浏览器也不会把 hash 发给任何机器。
 * token = base64url(deflate-raw(规范化 JSON 快照)) + '.' + 载荷 SHA-256。
 * 摘要用于发现损坏与篡改（不是机密保护，快照本就是准备公开的只读数据）。
 */

export class ShareLinkError extends Error {
  readonly code: ShareErrorCode;

  constructor(code: ShareErrorCode, message: string) {
    super(message);
    this.name = 'ShareLinkError';
    this.code = code;
  }
}

const B64URL_CHUNK = 0x8000;

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += B64URL_CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + B64URL_CHUNK));
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlToBytes(value: string): Uint8Array {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), '=');
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function intoStream(bytes: Uint8Array): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
}

async function readAllBytes(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    if (value) {
      chunks.push(value);
      total += value.length;
    }
  }
  const output = new Uint8Array(new ArrayBuffer(total));
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.length;
  }
  return output;
}

async function compress(bytes: Uint8Array): Promise<Uint8Array> {
  try {
    return await readAllBytes(
      intoStream(bytes).pipeThrough(
        new CompressionStream('deflate-raw') as unknown as TransformStream<Uint8Array, Uint8Array>,
      ),
    );
  } catch (cause) {
    throw new ShareLinkError('CORRUPT_PAYLOAD', `快照压缩失败：${(cause as Error).message}`);
  }
}

async function decompress(bytes: Uint8Array): Promise<Uint8Array> {
  try {
    return await readAllBytes(
      intoStream(bytes).pipeThrough(
        new DecompressionStream('deflate-raw') as unknown as TransformStream<Uint8Array, Uint8Array>,
      ),
    );
  } catch (cause) {
    throw new ShareLinkError('CORRUPT_PAYLOAD', `快照无法解压，链接可能已损坏：${(cause as Error).message}`);
  }
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  // 复制到独占的 ArrayBuffer，规避 ArrayBufferLike/SharedArrayBuffer 的类型分歧。
  const owned = new Uint8Array(new ArrayBuffer(bytes.length));
  owned.set(bytes);
  const digest = await crypto.subtle.digest('SHA-256', owned);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** 仅供测试：从规范化字节构造 token，可替换摘要或载荷。 */
export async function __mintTokenForTests(
  canonicalBytes: Uint8Array,
  digestOverride?: string,
): Promise<string> {
  const compressed = await compress(canonicalBytes);
  const payload = bytesToBase64Url(compressed);
  const digest = digestOverride ?? (await sha256Hex(canonicalBytes));
  return `${payload}.${digest}`;
}

/** 仅供测试：从未压缩的原始字节与自定义摘要构造 token。 */
export async function __mintRawTokenForTests(
  rawBytes: Uint8Array,
  digest: string,
  rawIsCanonical?: boolean,
): Promise<string> {
  if (rawIsCanonical) {
    return __mintTokenForTests(rawBytes, digest);
  }
  return `${bytesToBase64Url(rawBytes)}.${digest}`;
}

function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length || a.length === 0) {
    return false;
  }
  let mismatch = 0;
  for (let i = 0; i < a.length; i += 1) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

/**
 * 校验快照基本结构。旧版本在进入这里之前就会被拒绝；这里保证展示所需字段齐全。
 * 不做逐字段深校验，渲染侧始终按只读数据对待。
 */
function validateSnapshot(value: unknown): ShareSnapshot {
  if (typeof value !== 'object' || value === null) {
    throw new ShareLinkError('INVALID_SNAPSHOT', '快照不是有效的对象。');
  }
  const candidate = value as Partial<ShareSnapshot>;
  if (candidate.formatVersion !== SHARE_SNAPSHOT_VERSION) {
    throw new ShareLinkError('UNSUPPORTED_VERSION', `不支持的快照版本：${String(candidate.formatVersion)}。`);
  }
  if (typeof candidate.resumeId !== 'string' || typeof candidate.resumeTitle !== 'string') {
    throw new ShareLinkError('INVALID_SNAPSHOT', '快照缺少简历标识信息。');
  }
  if (typeof candidate.createdAt !== 'string' || typeof candidate.templateId !== 'string') {
    throw new ShareLinkError('INVALID_SNAPSHOT', '快照缺少模板或时间信息。');
  }
  if (typeof candidate.basicInfo !== 'object' || candidate.basicInfo === null) {
    throw new ShareLinkError('INVALID_SNAPSHOT', '快照缺少基本信息。');
  }
  if (!Array.isArray(candidate.sections) || candidate.sections.length === 0) {
    throw new ShareLinkError('INVALID_SNAPSHOT', '快照必须锁定至少一个模块。');
  }
  const seen = new Set<string>();
  for (const section of candidate.sections) {
    if (
      typeof section !== 'object' ||
      section === null ||
      !SHAREABLE_SECTION_IDS.includes((section as { id: unknown }).id as ShareSectionId) ||
      typeof (section as { title: unknown }).title !== 'string'
    ) {
      throw new ShareLinkError('INVALID_SNAPSHOT', '快照中存在无法识别的模块。');
    }
    const id = (section as { id: ShareSectionId }).id;
    if (seen.has(id)) {
      throw new ShareLinkError('INVALID_SNAPSHOT', '快照中模块重复。');
    }
    seen.add(id);
  }
  for (const key of ['summary', 'workExperiences', 'educations', 'skills', 'projects'] as const) {
    if (key === 'summary') {
      if (typeof candidate.summary !== 'string') {
        throw new ShareLinkError('INVALID_SNAPSHOT', `快照字段 ${key} 类型不正确。`);
      }
    } else if (!Array.isArray(candidate[key])) {
      throw new ShareLinkError('INVALID_SNAPSHOT', `快照字段 ${key} 类型不正确。`);
    }
  }
  return candidate as ShareSnapshot;
}

/**
 * 由快照生成不依赖服务端的只读链接。
 * @param snapshot 已经构建好的只读快照
 * @param baseHref 打开快照的页面地址，默认当前页面；仅用其 origin/pathname/search
 */
export async function encodeShareLink(snapshot: ShareSnapshot, baseHref?: string): Promise<string> {
  validateSnapshot(snapshot);
  const canonicalBytes = new TextEncoder().encode(JSON.stringify(snapshot));
  const compressed = await compress(canonicalBytes);
  const payload = bytesToBase64Url(compressed);
  const digest = await sha256Hex(canonicalBytes);
  const token = `${payload}.${digest}`;
  const href = baseHref ?? (typeof window !== 'undefined' ? window.location.href : '');
  const url = new URL(href);
  url.hash = `${SHARE_HASH_PREFIX}${token}`;
  const link = url.toString();
  if (link.length > MAX_SHARE_URL_LENGTH) {
    throw new ShareLinkError(
      'LENGTH_EXCEEDED',
      `生成的分享链接长度为 ${link.length}，超过上限 ${MAX_SHARE_URL_LENGTH}，请减少分享模块（如移除内嵌头像）后重新生成。`,
    );
  }
  return link;
}

/** 从任意字符串中提取分享 token；不是分享链接时返回 null。 */
export function extractShareToken(input: string): string | null {
  if (typeof input !== 'string') {
    return null;
  }
  const markerIndex = input.indexOf(SHARE_HASH_PREFIX);
  if (markerIndex < 0) {
    return null;
  }
  return input.slice(markerIndex + SHARE_HASH_PREFIX.length);
}

/**
 * 解析完整分享链接或纯 token，返回校验通过的快照。
 * 损坏、旧版本、超长、被改写都会抛出 {@link ShareLinkError}，且不触碰任何本机数据。
 */
export async function decodeShareLink(input: string): Promise<DecodedShare> {
  const token = extractShareToken(input) ?? input;

  if (input.length > MAX_SHARE_URL_LENGTH || token.length > MAX_SHARE_URL_LENGTH) {
    throw new ShareLinkError('LENGTH_EXCEEDED', `分享链接长度超过上限 ${MAX_SHARE_URL_LENGTH}，无法解析。`);
  }
  if (token.length === 0 || token.includes('#') || token.includes(' ')) {
    throw new ShareLinkError('MALFORMED_TOKEN', '分享链接为空或含有非法字符。');
  }

  const separatorIndex = token.lastIndexOf('.');
  if (separatorIndex <= 0 || separatorIndex === token.length - 1) {
    throw new ShareLinkError('MALFORMED_TOKEN', '分享链接格式不完整。');
  }
  const payloadB64 = token.slice(0, separatorIndex);
  const providedDigest = token.slice(separatorIndex + 1).toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(providedDigest)) {
    throw new ShareLinkError('MALFORMED_TOKEN', '分享链接校验位格式不正确。');
  }

  let compressed: Uint8Array;
  try {
    compressed = base64UrlToBytes(payloadB64);
  } catch {
    throw new ShareLinkError('MALFORMED_TOKEN', '分享链接载荷不是有效的 Base64URL 编码。');
  }

  const canonicalBytes = await decompress(compressed);
  const actualDigest = await sha256Hex(canonicalBytes);
  if (!timingSafeEqualHex(actualDigest, providedDigest)) {
    throw new ShareLinkError('PAYLOAD_TAMPERED', '分享链接内容与校验码不一致，可能已被损坏或改写。');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(canonicalBytes));
  } catch {
    throw new ShareLinkError('CORRUPT_PAYLOAD', '快照不是有效的 JSON，链接可能已损坏。');
  }

  const snapshot = validateSnapshot(parsed);
  return { snapshot, digest: actualDigest };
}
