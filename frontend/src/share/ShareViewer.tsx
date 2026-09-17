import { useEffect, useState } from 'react';
import { AlertTriangle, FileLock2, FileQuestion, Link2Off, Ruler } from 'lucide-react';
import { decodeShareLink, ShareLinkError } from '../share/share-link';
import { snapshotToResume } from '../share/snapshot';
import { DecodedShare, ShareErrorCode } from '../types/share';
import { ResumePreview } from '../components/preview/ResumePreview';
import { getTemplateById } from '../stores/template';
import { formatDateTime } from '../utils/format';

type ViewerState =
  | { status: 'loading' }
  | { status: 'ready'; decoded: DecodedShare }
  | { status: 'error'; code: ShareErrorCode; message: string };

const errorDetails: Record<ShareErrorCode, { title: string; icon: typeof Link2Off }> = {
  NOT_A_SHARE_LINK: { title: '这不是一个只读分享链接', icon: FileQuestion },
  UNSUPPORTED_VERSION: { title: '链接来自更新或更旧的版本', icon: AlertTriangle },
  MALFORMED_TOKEN: { title: '链接格式不完整', icon: Link2Off },
  LENGTH_EXCEEDED: { title: '链接长度超出上限', icon: Ruler },
  PAYLOAD_TAMPERED: { title: '链接内容已被改写或损坏', icon: AlertTriangle },
  CORRUPT_PAYLOAD: { title: '快照数据已损坏', icon: AlertTriangle },
  INVALID_SNAPSHOT: { title: '快照结构无法识别', icon: AlertTriangle },
};

export function ShareViewer() {
  const [state, setState] = useState<ViewerState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    const rawHash = window.location.hash;
    const token = rawHash.startsWith('#share/') ? rawHash.slice('#share/'.length) : '';

    if (!token) {
      setState({ status: 'error', code: 'NOT_A_SHARE_LINK', message: '地址中没有可展示的快照。' });
      return () => {
        cancelled = true;
      };
    }

    decodeShareLink(token)
      .then((decoded) => {
        if (!cancelled) {
          setState({ status: 'ready', decoded });
          document.title = `${decoded.snapshot.resumeTitle} · 只读简历`;
        }
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }
        if (error instanceof ShareLinkError) {
          setState({ status: 'error', code: error.code, message: error.message });
        } else {
          setState({
            status: 'error',
            code: 'CORRUPT_PAYLOAD',
            message: `无法打开快照：${(error as Error).message}`,
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (state.status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-[var(--muted)]">
        正在校验只读快照…
      </div>
    );
  }

  if (state.status === 'error') {
    const detail = errorDetails[state.code];
    const Icon = detail.icon;
    return (
      <div className="flex min-h-screen items-center justify-center px-5">
        <div className="w-full max-w-lg border border-[var(--border)] bg-[var(--surface)] p-8 text-center shadow-panel">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[var(--surface-alt)] text-[var(--danger)]">
            <Icon size={26} aria-hidden />
          </span>
          <h1 className="mt-5 font-display text-2xl font-semibold">{detail.title}</h1>
          <p className="mt-3 text-sm leading-6 text-[var(--muted)]">{state.message}</p>
          <p className="mt-4 text-xs leading-5 text-[var(--muted)]">
            此链接为只读快照，无法解析时不会读取或修改你本机的任何简历数据。请联系分享者重新生成链接。
          </p>
          <a
            className="mt-6 inline-flex min-h-10 items-center justify-center rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[var(--ink-invert)] hover:bg-[var(--accent-strong)]"
            href="/resumes"
          >
            前往简历工作台
          </a>
        </div>
      </div>
    );
  }

  const { snapshot } = state.decoded;
  const resume = snapshotToResume(snapshot);
  const template = getTemplateById(snapshot.templateId);
  const scopeText = snapshot.sections.map((section) => section.title).join(' · ');

  return (
    <div className="min-h-screen">
      <div className="border-b border-[var(--border)] bg-[var(--surface)]">
        <div className="mx-auto flex max-w-[920px] flex-wrap items-center justify-between gap-3 px-5 py-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-[var(--ink)]">
            <FileLock2 size={17} className="text-[var(--accent-strong)]" aria-hidden />
            只读简历快照
          </div>
          <p className="text-xs text-[var(--muted)]">生成于 {formatDateTime(snapshot.createdAt)}</p>
        </div>
      </div>
      <main className="mx-auto max-w-[920px] px-5 py-8">
        <div className="overflow-hidden shadow-panel">
          <ResumePreview resume={resume} template={template} fontSize={14} />
        </div>
        <div className="mt-5 border border-[var(--border)] bg-[var(--surface)] p-4 text-xs leading-6 text-[var(--muted)]">
          <p>
            本页展示的是链接生成瞬间的快照，源简历之后的修改不会改变此页内容；重新生成才会得到新的快照链接。
          </p>
          <p>固定模块（按此顺序）：{scopeText}</p>
        </div>
      </main>
    </div>
  );
}
