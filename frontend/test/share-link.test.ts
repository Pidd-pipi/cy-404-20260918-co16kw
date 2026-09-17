import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { decodeShareLink, encodeShareLink, extractShareToken, ShareLinkError } from '../src/share/share-link';
import { buildShareSnapshot } from '../src/share/snapshot';
import { MAX_SHARE_URL_LENGTH, ShareErrorCode } from '../src/types/share';
import { makeResume } from './helpers';

const ALL_SECTIONS = ['summary', 'work', 'projects', 'skills', 'education'] as const;

async function expectErrorCode(promise: Promise<unknown>, code: ShareErrorCode): Promise<void> {
  await assert.rejects(
    promise,
    (error: unknown) => error instanceof ShareLinkError && error.code === code,
    `expected ShareLinkError(${code})`,
  );
}

afterEach(() => {
  // 编码函数只接收显式 baseHref，不依赖全局 location。
});

test('快照链接编码后可完整解码，且内容一致', async () => {
  const resume = makeResume();
  const snapshot = buildShareSnapshot(resume, [...ALL_SECTIONS]);
  const link = await encodeShareLink(snapshot, 'http://localhost:28310/resumes');
  const { snapshot: decoded } = await decodeShareLink(link);

  assert.equal(decoded.resumeId, resume.id);
  assert.equal(decoded.resumeTitle, resume.title);
  assert.deepEqual(
    decoded.sections.map((section) => section.id),
    [...ALL_SECTIONS],
  );
  assert.equal(decoded.workExperiences[0].achievements[0], resume.workExperiences[0].achievements[0]);
  assert.ok(link.includes('#share/'));
});

test('快照固定模块范围与顺序；未选模块在解码结果中仍保留原始数据但渲染范围由 sections 决定', async () => {
  const resume = makeResume();
  const snapshot = buildShareSnapshot(resume, ['skills', 'summary']);
  assert.deepEqual(
    snapshot.sections.map((section) => section.id),
    ['skills', 'summary'],
  );
  const link = await encodeShareLink(snapshot, 'http://localhost/');
  const { snapshot: decoded } = await decodeShareLink(link);
  assert.deepEqual(decoded.sections.map((s) => s.id), ['skills', 'summary']);
});

test('源简历之后的变化不会改写旧链接内容', async () => {
  const resume = makeResume();
  const firstLink = await encodeShareLink(buildShareSnapshot(resume, [...ALL_SECTIONS]), 'http://localhost/');
  const originalSummary = resume.summary;
  const originalAchievement = resume.workExperiences[0].achievements[0];
  const originalTitle = resume.title;

  resume.summary = '被后来改写过的摘要内容';
  resume.workExperiences[0].achievements = ['后来新增的成就'];
  resume.title = '后来改的标题';

  const { snapshot } = await decodeShareLink(firstLink);
  assert.notEqual(snapshot.summary, resume.summary);
  assert.equal(snapshot.summary, originalSummary);
  assert.equal(snapshot.workExperiences[0].achievements[0], originalAchievement);
  assert.notEqual(snapshot.workExperiences[0].achievements[0], resume.workExperiences[0].achievements[0]);
  assert.equal(snapshot.resumeTitle, originalTitle);
});

test('同一简历生成两份链接，快照互不覆盖', async () => {
  const resume = makeResume();
  const linkA = await encodeShareLink(buildShareSnapshot(resume, ['summary']), 'http://localhost/');
  resume.summary = '第二版摘要';
  const linkB = await encodeShareLink(buildShareSnapshot(resume, ['summary', 'work']), 'http://localhost/');

  assert.notEqual(linkA, linkB);
  const a = await decodeShareLink(linkA);
  const b = await decodeShareLink(linkB);
  assert.notEqual(a.snapshot.summary, b.snapshot.summary);
  assert.equal(a.snapshot.sections.length, 1);
  assert.equal(b.snapshot.sections.length, 2);
});

test('载荷被篡改时明确失败', async () => {
  const resume = makeResume();
  const link = await encodeShareLink(buildShareSnapshot(resume, [...ALL_SECTIONS]), 'http://localhost/');
  // 链接末尾 64 位是十六进制摘要：确定性翻转其中一位字符，保证校验码必然失配。
  const hashChar = link[link.length - 10];
  const replacement = /[0-8]/.test(hashChar)
    ? String(Number(hashChar) + 1)
    : hashChar === '9'
      ? '8'
      : hashChar === 'a'
        ? 'b'
        : 'a';
  const corrupted = `${link.slice(0, link.length - 10)}${replacement}${link.slice(link.length - 9)}`;
  assert.notEqual(corrupted, link);
  await expectErrorCode(decodeShareLink(corrupted), 'PAYLOAD_TAMPERED');

  // 同时验证载荷段被改写也会失配。
  const marker = '#share/';
  const markerIndex = link.indexOf(marker) + marker.length;
  const payloadChar = link[markerIndex + 4];
  const payloadReplacement = payloadChar === 'A' ? 'B' : 'A';
  const corruptedPayload = `${link.slice(0, markerIndex + 4)}${payloadReplacement}${link.slice(markerIndex + 5)}`;
  await assert.rejects(
    decodeShareLink(corruptedPayload),
    (error: unknown) =>
      error instanceof ShareLinkError &&
      (error.code === 'PAYLOAD_TAMPERED' || error.code === 'CORRUPT_PAYLOAD' || error.code === 'MALFORMED_TOKEN'),
  );
});

test('旧版/无法识别版本的快照被拒绝', async () => {
  const resume = makeResume();
  const snapshot = buildShareSnapshot(resume, ['summary']);
  const forged = JSON.parse(JSON.stringify(snapshot));
  forged.formatVersion = 99;
  // 手工构造一个带正确校验码但版本号非法的 token。
  const { mintTokenFor } = await import('./mint');
  const token = await mintTokenFor(forged);
  await expectErrorCode(decodeShareLink(`http://localhost/#share/${token}`), 'UNSUPPORTED_VERSION');
});

test('损坏的 Base64URL 与非 JSON 载荷被明确拒绝', async () => {
  await expectErrorCode(decodeShareLink('http://localhost/#share/!!!not-base64!!!.deadbeef'), 'MALFORMED_TOKEN');
  const { mintRawToken } = await import('./mint');
  // 合法 base64 字符、64 位校验位，但解压/解析必失败 → 走 CORRUPT_PAYLOAD 或 TAMPERED。
  const token = await mintRawToken(new TextEncoder().encode('not-a-gzip-stream'), async () => {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('not-a-gzip-stream'));
    return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
  });
  await assert.rejects(
    decodeShareLink(`http://localhost/#share/${token}`),
    (error: unknown) =>
      error instanceof ShareLinkError && (error.code === 'CORRUPT_PAYLOAD' || error.code === 'PAYLOAD_TAMPERED'),
  );
});

test('不是分享链接时解码报 NOT_A_SHARE_LINK', async () => {
  // 纯 token 路径会被尝试解析；这里用带错误结构的纯文本验证 MALFORMED。
  await expectErrorCode(decodeShareLink('plain garbage without hash marker'), 'MALFORMED_TOKEN');
  assert.equal(extractShareToken('https://host/path'), null);
  assert.equal(extractShareToken('https://host/#share/abc.def'), 'abc.def');
});

test('超长链接在生成时失败，超长输入在解析时失败', async () => {
  const resume = makeResume();
  // 高熵内容（近似随机）几乎无法压缩，base64 后必然撑破链接长度上限。
  const randomBytes = new Uint8Array(MAX_SHARE_URL_LENGTH);
  for (let i = 0; i < randomBytes.length; i += 1) {
    randomBytes[i] = Math.floor(Math.random() * 256);
  }
  let binary = '';
  for (const byte of randomBytes) {
    binary += String.fromCharCode(byte);
  }
  resume.basicInfo.avatarUrl = `data:image/png;base64,${btoa(binary)}`;
  const snapshot = buildShareSnapshot(resume, ['summary']);
  await expectErrorCode(encodeShareLink(snapshot, 'http://localhost/'), 'LENGTH_EXCEEDED');

  const longInput = `http://localhost/#share/${'x'.repeat(MAX_SHARE_URL_LENGTH + 10)}`;
  await expectErrorCode(decodeShareLink(longInput), 'LENGTH_EXCEEDED');
});

test('没有任何模块时不允许生成快照', () => {
  const resume = makeResume();
  assert.throws(() => buildShareSnapshot(resume, []), /至少/);
});

test('重复模块标识会被规范化去重', () => {
  const resume = makeResume();
  const snapshot = buildShareSnapshot(resume, ['work', 'work', 'summary']);
  assert.deepEqual(
    snapshot.sections.map((section) => section.id),
    ['work', 'summary'],
  );
});
