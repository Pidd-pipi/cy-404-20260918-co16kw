// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useProfileStore } from '../stores/profile';
import { Profile } from '../types/profile';
import { Resume } from '../types/resume';
import { MAX_SHARE_URL_LENGTH } from '../types/share';
import { buildSharePayload, encodeShareToken } from '../utils/share';
import { SharedResume } from './SharedResume';

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

function makeResume(patch: Partial<Resume> = {}): Resume {
  return {
    id: 'resume_page_1',
    title: '快照简历标题',
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
    summary: '',
    sections: [
      { id: 'summary', title: '职业摘要', enabled: true },
      { id: 'work', title: '工作经历', enabled: true },
    ],
    workExperiences: [
      {
        id: 'work_1',
        companyName: '青松科技',
        position: '高级产品经理',
        startDate: '2021.06',
        endDate: '至今',
        responsibilities: ['负责核心链路'],
        achievements: [],
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
    summary: '默认摘要',
    ...patch,
  };
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  window.localStorage.clear();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  window.location.hash = '';
});

function renderSharePage() {
  act(() => {
    root.render(
      <MemoryRouter>
        <SharedResume />
      </MemoryRouter>,
    );
  });
}

describe('只读分享页', () => {
  it('打开链接只显示生成时刻的快照，不跟随本机资料变化', () => {
    // 快照生成时的资料
    const snapshotProfile = makeProfile({ summary: '快照时刻的资料摘要' });
    const payload = buildSharePayload(makeResume(), snapshotProfile);
    window.location.hash = `#${encodeShareToken(payload)}`;

    // 本机当前的资料已经不同
    useProfileStore.setState({ profile: makeProfile({ summary: '本机当前的资料摘要' }) });
    window.localStorage.setItem('smart-resume:resumes', JSON.stringify([makeResume({ title: '本机简历' })]));

    renderSharePage();

    // 简历 summary 为空，触发资料回填：必须显示快照里的资料，而不是本机当前的资料
    expect(container.textContent).toContain('快照时刻的资料摘要');
    expect(container.textContent).not.toContain('本机当前的资料摘要');
    expect(container.textContent).toContain('快照简历标题');
    expect(container.textContent).toContain('青松科技');
    expect(container.textContent).toContain(payload.checksum);

    // 打开分享链接不改动本机简历数据
    expect(JSON.parse(window.localStorage.getItem('smart-resume:resumes') ?? '[]')[0].title).toBe('本机简历');
  });

  it('快照按生成时的模块范围渲染，禁用模块不显示', () => {
    const payload = buildSharePayload(
      makeResume({
        sections: [
          { id: 'summary', title: '职业摘要', enabled: true },
          { id: 'work', title: '工作经历', enabled: false },
        ],
      }),
      makeProfile(),
    );
    window.location.hash = `#${encodeShareToken(payload)}`;
    renderSharePage();

    expect(container.textContent).toContain('职业摘要');
    expect(container.textContent).not.toContain('青松科技');
  });

  it('损坏链接显示明确失败，且不污染本机简历', () => {
    window.localStorage.setItem('smart-resume:resumes', JSON.stringify([makeResume({ title: '本机简历' })]));
    window.location.hash = '#v1.corrupted!!!';
    renderSharePage();

    expect(container.textContent).toContain('链接已损坏');
    expect(JSON.parse(window.localStorage.getItem('smart-resume:resumes') ?? '[]')[0].title).toBe('本机简历');
  });

  it('超长链接显示明确失败', () => {
    window.location.hash = `#v1.${'a'.repeat(MAX_SHARE_URL_LENGTH)}`;
    renderSharePage();
    expect(container.textContent).toContain('链接超出长度限制');
  });

  it('旧版链接显示明确失败', () => {
    const payload = buildSharePayload(makeResume(), makeProfile());
    const token = encodeShareToken(payload);
    window.location.hash = `#v0${token.slice(token.indexOf('.'))}`;
    renderSharePage();
    expect(container.textContent).toContain('链接版本不受支持');
  });

  it('缺少快照数据的链接显示明确失败', () => {
    window.location.hash = '';
    renderSharePage();
    expect(container.textContent).toContain('链接缺少快照数据');
  });
});
