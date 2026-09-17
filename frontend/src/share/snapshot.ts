import { Resume } from '../types/resume';
import { ShareSectionId, ShareSnapshot, SHAREABLE_SECTION_IDS, SHARE_SNAPSHOT_VERSION } from '../types/share';
import { useProfileStore } from '../stores/profile';

function isShareSectionId(value: unknown): value is ShareSectionId {
  return SHAREABLE_SECTION_IDS.includes(value as ShareSectionId);
}

/**
 * 按选择的模块范围与顺序，从简历当时内容深拷贝出只读快照。
 * 快照固化基本信息与个人资料回退（保证在没有本机资料的设备上打开也完整），
 * 之后源简历如何修改都不会影响这份快照。
 */
export function buildShareSnapshot(resume: Resume, orderedSectionIds: ShareSectionId[]): ShareSnapshot {
  const allowed = new Set<ShareSectionId>(SHAREABLE_SECTION_IDS);
  const seen = new Set<ShareSectionId>();
  const sections: ShareSnapshot['sections'] = [];

  for (const rawId of orderedSectionIds) {
    if (!isShareSectionId(rawId) || seen.has(rawId)) {
      continue;
    }
    seen.add(rawId);
    const sourceSection = resume.sections.find((section) => section.id === rawId);
    sections.push({
      id: rawId,
      title: sourceSection?.title?.trim() || defaultSectionTitle(rawId),
    });
  }

  if (sections.length === 0) {
    throw new Error('至少需要选择一个分享模块。');
  }
  if (sections.some((section) => !allowed.has(section.id))) {
    throw new Error('分享模块范围不合法。');
  }

  // 个人资料仅在生成这一刻作为回退被固化，之后本机资料变化不会影响旧快照。
  const profile = useProfileStore.getState().profile;
  const basicInfo = {
    fullName: resume.basicInfo.fullName || profile.fullName,
    headline: resume.basicInfo.headline || profile.headline,
    phone: resume.basicInfo.phone || profile.phone,
    email: resume.basicInfo.email || profile.email,
    location: resume.basicInfo.location || profile.location,
    website: resume.basicInfo.website || profile.website,
    avatarUrl: resume.basicInfo.avatarUrl || profile.avatarUrl,
  };
  const summary = resume.summary || profile.summary;

  return {
    formatVersion: SHARE_SNAPSHOT_VERSION,
    resumeId: resume.id,
    resumeTitle: resume.title,
    templateId: resume.templateId,
    createdAt: new Date().toISOString(),
    basicInfo,
    summary,
    sections,
    workExperiences: JSON.parse(JSON.stringify(resume.workExperiences)) as Resume['workExperiences'],
    educations: JSON.parse(JSON.stringify(resume.educations)) as Resume['educations'],
    skills: JSON.parse(JSON.stringify(resume.skills)) as Resume['skills'],
    projects: JSON.parse(JSON.stringify(resume.projects)) as Resume['projects'],
  };
}

export function defaultSectionTitle(id: ShareSectionId): string {
  const titles: Record<ShareSectionId, string> = {
    summary: '职业摘要',
    work: '工作经历',
    projects: '项目经历',
    skills: '技能矩阵',
    education: '教育经历',
  };
  return titles[id];
}

/** 把快照适配成 ResumePreview 可渲染的结构；未锁定模块给空数组。 */
export function snapshotToResume(snapshot: ShareSnapshot): Resume {
  const includes = (id: ShareSectionId) => snapshot.sections.some((section) => section.id === id);
  return {
    id: snapshot.resumeId,
    title: snapshot.resumeTitle,
    templateId: snapshot.templateId,
    createdAt: snapshot.createdAt,
    updatedAt: snapshot.createdAt,
    basicInfo: snapshot.basicInfo,
    summary: snapshot.summary,
    sections: snapshot.sections.map((section) => ({ id: section.id, title: section.title, enabled: true })),
    workExperiences: includes('work') ? snapshot.workExperiences : [],
    educations: includes('education') ? snapshot.educations : [],
    skills: includes('skills') ? snapshot.skills : [],
    projects: includes('projects') ? snapshot.projects : [],
  };
}
