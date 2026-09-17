import { useCallback, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Check, Copy, Eye, Link2, Loader2, RefreshCw, ShieldCheck, X } from 'lucide-react';
import { Button } from '../components/common/Button';
import { useResumeStore } from '../stores/resume';
import { ResumeSectionType } from '../types/resume';
import { ShareRecord, ShareSectionId } from '../types/share';
import { shareRecordStore } from './share-store';
import { ShareLinkError } from './share-link';
import { formatDateTime } from '../utils/format';

interface CreateShareModalProps {
  resumeId: string;
  onClose: () => void;
  onRecordsChanged: () => void;
}

const SECTION_OPTIONS: { id: ShareSectionId; title: string }[] = [
  { id: 'summary', title: '职业摘要' },
  { id: 'work', title: '工作经历' },
  { id: 'projects', title: '项目经历' },
  { id: 'skills', title: '技能矩阵' },
  { id: 'education', title: '教育经历' },
];

export function CreateShareModal({ resumeId, onClose, onRecordsChanged }: CreateShareModalProps) {
  const resume = useResumeStore((state) => state.resumes.find((item) => item.id === resumeId));
  const [order, setOrder] = useState<ShareSectionId[]>(() => {
    if (!resume) {
      return SECTION_OPTIONS.map((option) => option.id);
    }
    const enabled = resume.sections.filter((section) => section.enabled).map((section) => section.id);
    const merged = [...new Set([...enabled, ...SECTION_OPTIONS.map((option) => option.id)])];
    return merged as ShareSectionId[];
  });
  const [selected, setSelected] = useState<Set<ShareSectionId>>(
    () => new Set((resume?.sections ?? []).filter((section) => section.enabled).map((section) => section.id as ShareSectionId)),
  );
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [records, setRecords] = useState<ShareRecord[]>(() => shareRecordStore.listByResume(resumeId));
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const orderedSelected = useMemo(() => order.filter((id) => selected.has(id)), [order, selected]);

  const copyRecord = useCallback(async (record: ShareRecord) => {
    try {
      await navigator.clipboard.writeText(record.url);
      setCopiedId(record.id);
      window.setTimeout(() => setCopiedId((current) => (current === record.id ? null : current)), 1800);
    } catch {
      setError('复制失败，请手动选择链接文本复制。');
    }
  }, []);

  if (!resume) {
    return null;
  }

  const toggle = (id: ShareSectionId) => {
    setError(null);
    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const move = (id: ShareSectionId, direction: -1 | 1) => {
    setOrder((previous) => {
      const index = previous.indexOf(id);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= previous.length) {
        return previous;
      }
      const next = [...previous];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const handleCreate = async () => {
    setError(null);
    if (orderedSelected.length === 0) {
      setError('请至少选择一个模块。');
      return;
    }
    setCreating(true);
    try {
      // createShare 内部会先构建快照（此处即可暴露空选择等问题）再生成全新链接。
      const record = await shareRecordStore.createShare({ resume, sectionIds: orderedSelected });
      setRecords(shareRecordStore.listByResume(resumeId));
      onRecordsChanged();
      void copyRecord(record);
    } catch (cause) {
      if (cause instanceof ShareLinkError) {
        setError(cause.message);
      } else {
        setError(`生成失败：${(cause as Error).message}`);
      }
    } finally {
      setCreating(false);
    }
  };

  const handleRevoke = (recordId: string) => {
    if (!window.confirm('撤销这份分享记录？其他记录和已经发出的旧链接都不受影响（本机仅删除该条记录）。')) {
      return;
    }
    shareRecordStore.revoke(recordId);
    setRecords(shareRecordStore.listByResume(resumeId));
    onRecordsChanged();
  };

  const openRecord = (record: ShareRecord) => {
    window.open(record.url, '_blank', 'noopener,noreferrer');
  };

  const titleFor = (id: ResumeSectionType) => resume.sections.find((section) => section.id === id)?.title ?? id;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/45 p-4 py-10"
      role="dialog"
      aria-modal="true"
      aria-label="生成只读分享链接"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="w-full max-w-2xl border border-[var(--border)] bg-[var(--surface)] shadow-panel">
        <div className="flex items-center justify-between border-b border-[var(--border)] px-6 py-4">
          <div>
            <h2 className="font-display text-xl font-semibold">只读分享链接</h2>
            <p className="mt-1 text-xs text-[var(--muted)]">
              快照完整内嵌在链接中、无需服务端；模块范围与顺序即刻锁定，源简历之后的改动不会改写旧链接。
            </p>
          </div>
          <button
            type="button"
            className="flex h-9 w-9 items-center justify-center rounded-md text-[var(--muted)] hover:bg-[var(--surface-alt)]"
            onClick={onClose}
            aria-label="关闭"
          >
            <X size={18} />
          </button>
        </div>

        <div className="space-y-5 px-6 py-5">
          <div>
            <p className="mb-2 text-sm font-semibold">选择模块并固定顺序</p>
            <ol className="space-y-2">
              {order.map((id, index) => {
                const checked = selected.has(id);
                return (
                  <li
                    key={id}
                    className="flex items-center gap-3 border border-[var(--border)] bg-[var(--bg)] px-3 py-2"
                  >
                    <input
                      id={`share-module-${id}`}
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggle(id)}
                      className="h-4 w-4 accent-[var(--accent-strong)]"
                    />
                    <label htmlFor={`share-module-${id}`} className="flex-1 text-sm">
                      {SECTION_OPTIONS.find((option) => option.id === id)?.title ?? titleFor(id)}
                    </label>
                    <span className="text-xs text-[var(--muted)]">第 {index + 1} 位</span>
                    <span className="flex gap-1">
                      <button
                        type="button"
                        className="flex h-8 w-8 items-center justify-center rounded text-[var(--muted)] hover:bg-[var(--surface-alt)] disabled:opacity-30"
                        onClick={() => move(id, -1)}
                        disabled={index === 0}
                        aria-label="上移"
                      >
                        <ArrowUp size={15} />
                      </button>
                      <button
                        type="button"
                        className="flex h-8 w-8 items-center justify-center rounded text-[var(--muted)] hover:bg-[var(--surface-alt)] disabled:opacity-30"
                        onClick={() => move(id, 1)}
                        disabled={index === order.length - 1}
                        aria-label="下移"
                      >
                        <ArrowDown size={15} />
                      </button>
                    </span>
                  </li>
                );
              })}
            </ol>
          </div>

          {error ? (
            <p className="border border-[var(--danger)]/40 bg-[var(--danger)]/10 px-3 py-2 text-sm text-[var(--danger)]">
              {error}
            </p>
          ) : null}

          <div className="flex items-center gap-2 text-xs text-[var(--muted)]">
            <ShieldCheck size={15} aria-hidden />
            每次生成都会产生一份独立快照，同一份简历可生成多条互不覆盖的记录。
          </div>

          <div className="flex justify-end gap-2">
            <Button onClick={onClose} variant="secondary">
              关闭
            </Button>
            <Button icon={creating ? <Loader2 size={16} className="animate-spin" /> : <Link2 size={16} />} onClick={handleCreate} variant="primary" disabled={creating}>
              {creating ? '生成中…' : '生成新快照链接'}
            </Button>
          </div>

          {records.length > 0 ? (
            <div className="border-t border-[var(--border)] pt-4">
              <p className="mb-2 text-sm font-semibold">本简历的分享记录（{records.length}）</p>
              <ul className="space-y-3">
                {records.map((record) => (
                  <li key={record.id} className="border border-[var(--border)] bg-[var(--bg)] p-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-xs text-[var(--muted)]">
                        {formatDateTime(record.createdAt)} · {record.sectionIds.length} 个模块 · {record.urlLength} 字符
                      </p>
                      <div className="flex shrink-0 gap-1">
                        <button
                          type="button"
                          className="flex h-8 items-center gap-1 rounded px-2 text-xs hover:bg-[var(--surface-alt)]"
                          onClick={() => openRecord(record)}
                        >
                          <Eye size={14} /> 打开
                        </button>
                        <button
                          type="button"
                          className="flex h-8 items-center gap-1 rounded px-2 text-xs hover:bg-[var(--surface-alt)]"
                          onClick={() => void copyRecord(record)}
                        >
                          {copiedId === record.id ? <Check size={14} /> : <Copy size={14} />}
                          {copiedId === record.id ? '已复制' : '复制'}
                        </button>
                        <button
                          type="button"
                          className="flex h-8 items-center gap-1 rounded px-2 text-xs text-[var(--danger)] hover:bg-[var(--surface-alt)]"
                          onClick={() => handleRevoke(record.id)}
                        >
                          <RefreshCw size={14} /> 撤销
                        </button>
                      </div>
                    </div>
                    <p className="mt-2 break-all rounded bg-[var(--surface-alt)] p-2 font-mono text-[11px] leading-5 text-[var(--muted)]">
                      {record.url}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
