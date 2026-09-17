import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Camera, ShieldCheck } from 'lucide-react';
import { ResumePreview } from '../components/preview/ResumePreview';
import { ShareParseError } from '../types/share';
import { formatDateTime } from '../utils/format';
import { parseShareHash } from '../utils/share';

const errorCopy: Record<ShareParseError, { title: string; description: string }> = {
  empty: {
    title: '链接缺少快照数据',
    description: '该链接不包含任何简历快照，请向分享者索取完整链接。',
  },
  'too-long': {
    title: '链接超出长度限制',
    description: '该链接长度超过上限，可能在传播过程中被截断或拼接，已拒绝打开。',
  },
  malformed: {
    title: '链接已损坏',
    description: '链接内容无法解码或未通过完整性校验，可能被截断或篡改，已拒绝打开。',
  },
  'unsupported-version': {
    title: '链接版本不受支持',
    description: '该链接由不兼容的版本生成，当前应用无法解析，请让分享者重新生成。',
  },
};

function ShareErrorView({ error }: { error: ShareParseError }) {
  const copy = errorCopy[error];
  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--bg)] px-5 py-10">
      <div className="w-full max-w-lg border border-[var(--border)] bg-[var(--surface)] p-10 text-center shadow-panel">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-md bg-[var(--accent-soft)] text-[var(--danger)]">
          <AlertTriangle size={26} aria-hidden />
        </div>
        <h1 className="font-display text-2xl font-semibold text-[var(--ink)]">{copy.title}</h1>
        <p className="mt-3 text-sm leading-6 text-[var(--muted)]">{copy.description}</p>
        <p className="mt-3 text-xs leading-5 text-[var(--muted)]">本次打开未对本机简历数据做任何改动。</p>
        <Link
          className="mt-6 inline-flex min-h-10 items-center justify-center rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[var(--ink-invert)] hover:bg-[var(--accent-strong)]"
          to="/resumes"
        >
          返回我的简历
        </Link>
      </div>
    </div>
  );
}

/**
 * 只读分享台：从链接 hash 解码快照并渲染。
 * 页面只读取链接自带的数据，不读取、更不写入本机简历与资料，
 * 因此打开链接不会影响本机数据，源简历后续改动也不会反映在这里。
 */
export function SharedResume() {
  const result = useMemo(() => parseShareHash(window.location.hash), []);

  if (!result.ok) {
    return <ShareErrorView error={result.error} />;
  }

  const { payload } = result;
  const enabledSections = payload.resume.sections.filter((section) => section.enabled);

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      <header className="border-b border-[var(--border)] bg-[var(--surface)]">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-3 px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-md bg-[var(--surface-strong)] text-[var(--ink-invert)]">
              <Camera size={19} aria-hidden />
            </span>
            <div>
              <p className="font-display text-lg font-semibold leading-5 text-[var(--ink)]">{payload.resume.title}</p>
              <p className="text-xs text-[var(--muted)]">只读快照 · 生成于 {formatDateTime(payload.createdAt)}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-[var(--muted)]">
            <ShieldCheck size={14} aria-hidden />
            <span>
              校验码 {payload.checksum} · {enabledSections.length} 个模块
            </span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-5 py-8">
        <div className="border border-[var(--border)] shadow-panel">
          <ResumePreview fontSize={13} profileFallback={payload.profile} resume={payload.resume} />
        </div>
        <p className="mt-6 text-center text-xs leading-5 text-[var(--muted)]">
          本页面为简历在 {formatDateTime(payload.createdAt)} 的只读快照，内容固定于生成时刻，
          之后的任何修改都不会更新此页面。
        </p>
      </main>
    </div>
  );
}
