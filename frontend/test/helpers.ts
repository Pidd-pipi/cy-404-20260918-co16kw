import { EducationLevel, SkillCategory, SkillLevel } from '../src/types/enums';
import { Resume } from '../src/types/resume';

let counter = 0;

export function makeResume(overrides: Partial<Resume> = {}): Resume {
  counter += 1;
  const now = `2026-09-1${counter}T08:00:00.000Z`;
  return {
    id: `resume_test_${counter}`,
    title: `测试简历 ${counter}`,
    templateId: 'atelier',
    createdAt: now,
    updatedAt: now,
    basicInfo: {
      fullName: '张三',
      headline: '前端工程师',
      phone: '13800000000',
      email: 'zhangsan@example.com',
      location: '北京',
      website: 'https://example.com',
      avatarUrl: '',
    },
    summary: `第 ${counter} 版摘要：负责核心业务系统。`,
    sections: [
      { id: 'summary', title: '职业摘要', enabled: true },
      { id: 'work', title: '工作经历', enabled: true },
      { id: 'projects', title: '项目经历', enabled: true },
      { id: 'skills', title: '技能矩阵', enabled: true },
      { id: 'education', title: '教育经历', enabled: true },
    ],
    workExperiences: [
      {
        id: `work_${counter}`,
        companyName: '示例科技',
        position: '高级前端工程师',
        startDate: '2022.01',
        endDate: '至今',
        responsibilities: ['负责设计系统建设'],
        achievements: [`页面性能提升 ${counter * 10}%`],
      },
    ],
    educations: [
      {
        id: `edu_${counter}`,
        school: '示例大学',
        major: '软件工程',
        level: EducationLevel.Bachelor,
        startDate: '2014.09',
        endDate: '2018.06',
        gpa: '3.8/4.0',
        honors: ['一等奖学金'],
      },
    ],
    skills: [
      { id: `skill_${counter}`, name: 'TypeScript', level: SkillLevel.Expert, proficiency: 5, category: SkillCategory.Technology },
    ],
    projects: [
      {
        id: `project_${counter}`,
        name: '只读分享系统',
        role: '负责人',
        startDate: '2025.03',
        endDate: '2026.09',
        techStack: ['React', 'CompressionStream'],
        description: `第 ${counter} 版项目描述`,
        outcomes: ['零服务端依赖'],
      },
    ],
    ...overrides,
  };
}
