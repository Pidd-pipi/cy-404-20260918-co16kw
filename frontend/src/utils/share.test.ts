// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { Profile } from '../types/profile';
import { Resume } from '../types/resume';
import { MAX_SHARE_URL_LENGTH, SHARE_PAYLOAD_VERSION, SharePayload } from '../types/share';
import {
  buildSharePayload,
  buildShareRecord,
  buildShareUrl,
  checksumOf,
  encodeShareToken,
  parseShareHash,
  ShareLinkTooLongError,
} from './share';

function makeResume(patch: Partial<Resume> = {}): Resume {
  return {
    id: 'resume_test_1',
    title: '测试简历',
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
      { id: 'education', title: '教育经历', enabled: false },
    ],
    workExperiences: [
      {
        id: 'work_1',
        companyName: '青松科技',
        position: '高级产品经理',
        startDate: '2021.06',
        endDate: '至今',
        responsibilities: ['负责核心链路'],
        achievements: ['转化率提升 32%'],
      },
    ],
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

describe('快照生成与编码', () => {
  it('编码后可完整解析回原始快照（往返一致）', () => {
    const resume = makeResume();
    const profile = makeProfile();
    const payload = buildSharePayload(resume, profile);
    const token = encodeShareToken(payload);
    const result = parseShareHash(`#${token}`);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload).toEqual(payload);
    }
  });

  it('快照是深拷贝：生成后修改源简历不会改写已生成的快照', () => {
    const resume = makeResume();
    const payload = buildSharePayload(resume, makeProfile());

    resume.title = '被改写的标题';
    resume.summary = '被改写的内容';
    resume.sections.reverse();
    resume.sections[0].enabled = true;
    resume.basicInfo.fullName = '被改写';

    expect(payload.resume.title).toBe('测试简历');
    expect(payload.resume.summary).toBe('八年产品经验。');
    expect(payload.resume.sections.map((section) => section.id)).toEqual(['summary', 'work', 'education']);
    expect(payload.resume.sections[2].enabled).toBe(false);
    expect(payload.resume.basicInfo.fullName).toBe('林知远');
  });

  it('快照固定模块范围与顺序', () => {
    const resume = makeResume();
    const record = buildShareRecord(resume, makeProfile());
    const result = parseShareHash(`#${record.token}`);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload.resume.sections).toEqual(resume.sections);
    }
    expect(record.sectionCount).toBe(2);
  });

  it('快照包含生成时刻的资料，用于空字段回填', () => {
    const payload = buildSharePayload(makeResume(), makeProfile({ summary: '当时的资料摘要' }));
    expect(payload.profile.summary).toBe('当时的资料摘要');
  });

  it('校验码稳定且覆盖内容', () => {
    expect(checksumOf('abc')).toBe(checksumOf('abc'));
    expect(checksumOf('abc')).not.toBe(checksumOf('abd'));
    expect(checksumOf('中文内容')).toMatch(/^[0-9a-f]{8}$/);
  });

  it('完整链接在长度限制内', () => {
    const record = buildShareRecord(makeResume(), makeProfile());
    expect(buildShareUrl(record.token).length).toBeLessThanOrEqual(MAX_SHARE_URL_LENGTH);
  });

  it('内容过大时拒绝生成并抛出明确错误', () => {
    const huge = makeResume({ summary: '长'.repeat(200_000) });
    expect(() => buildShareRecord(huge, makeProfile())).toThrow(ShareLinkTooLongError);
  });
});

describe('链接解析失败路径', () => {
  it('空链接明确失败', () => {
    expect(parseShareHash('')).toEqual({ ok: false, error: 'empty' });
    expect(parseShareHash('#')).toEqual({ ok: false, error: 'empty' });
  });

  it('超长链接明确失败', () => {
    const hash = `#v1.${'a'.repeat(MAX_SHARE_URL_LENGTH)}`;
    expect(parseShareHash(hash)).toEqual({ ok: false, error: 'too-long' });
  });

  it('无法解码的损坏链接明确失败', () => {
    expect(parseShareHash('#not-a-token')).toEqual({ ok: false, error: 'malformed' });
    expect(parseShareHash('#v1.!!!')).toEqual({ ok: false, error: 'malformed' });
    expect(parseShareHash('#v1.aaaa')).toEqual({ ok: false, error: 'malformed' });
  });

  it('被截断的链接明确失败', () => {
    const record = buildShareRecord(makeResume(), makeProfile());
    const truncated = record.token.slice(0, record.token.length - 12);
    expect(parseShareHash(`#${truncated}`)).toEqual({ ok: false, error: 'malformed' });
  });

  it('结构不符的数据明确失败', () => {
    const encode = (value: unknown) => {
      const bytes = new TextEncoder().encode(JSON.stringify(value));
      let binary = '';
      bytes.forEach((byte) => {
        binary += String.fromCharCode(byte);
      });
      return `v1.${btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}`;
    };
    expect(parseShareHash(`#${encode({ hello: 'world' })}`)).toEqual({ ok: false, error: 'malformed' });
    expect(parseShareHash(`#${encode([1, 2, 3])}`)).toEqual({ ok: false, error: 'malformed' });
  });

  it('校验码不匹配（内容被篡改）明确失败', () => {
    const payload = buildSharePayload(makeResume(), makeProfile());
    const tampered: SharePayload = {
      ...payload,
      resume: { ...payload.resume, summary: '被篡改的内容' },
    };
    // 保留原 checksum，模拟只改了内容没改校验码的链接
    const result = parseShareHash(`#${encodeShareToken(tampered)}`);
    expect(result).toEqual({ ok: false, error: 'malformed' });
  });

  it('旧版或未知版本链接明确失败', () => {
    const record = buildShareRecord(makeResume(), makeProfile());
    const data = record.token.slice(record.token.indexOf('.'));
    expect(parseShareHash(`#v0${data}`)).toEqual({ ok: false, error: 'unsupported-version' });
    expect(parseShareHash(`#v2${data}`)).toEqual({ ok: false, error: 'unsupported-version' });
    expect(parseShareHash(`#v99${data}`)).toEqual({ ok: false, error: 'unsupported-version' });
  });

  it('版本号与协议常量保持一致', () => {
    const record = buildShareRecord(makeResume(), makeProfile());
    expect(record.token.startsWith(`v${SHARE_PAYLOAD_VERSION}.`)).toBe(true);
  });
});
