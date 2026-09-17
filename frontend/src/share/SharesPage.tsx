import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BadgeCheck, Check, Copy, Eye, FileWarning, RefreshCw, ShieldQuestion, Trash2 } from 'lucide-react';
import { Button } from '../components/common/Button';
import { EmptyState } from '../components/common/EmptyState';
import { useResumeStore } from '../stores/resume';
import { ShareRecord } from '../types/share';
import { formatDateTime } from '../utils/format';
import { shareRecordStore } from './share-store';

type VerifyState = 'idle' | 'checking' | 'valid' | 'invalid';

export function SharesPage() {
  const navigate = useNavigate();
  const resumes = useResumeStore((state) => state.resumes);
  const [records, setRecords] = useState<ShareRecord[]>(() => shareRecordStore.list());
  const [filterResumeId, setFilterResumeId] = useState<string>('all');
  const [verifyStates, setVerifyStates] = useState<Record<string, VerifyState>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const refresh = useCallback(() => {
    setRecords(shareRecordStore.list());
  }, []);

  // 刷新页面后对全部记录做一次核对：确认链接仍可解出且与记录中的摘要一致。
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setVerifyStates(Object.fromEntries(records.map((record) => [record.id, 'checking' as VerifyState])));
      for (const record of records) {
        const valid = await shareRecordStore.verify(record.id);
        if (cancelled) {
          return;
        }
        setVerifyStates((previous) => ({ ...previous, [record.id]: valid ? 'valid' : 'invalid' }));
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
    // 仅在进入页面时核对一次。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const visibleRecords = useMemo(
    () => (filterResumeId === 'all' ? records : records.filter((record) => record.resumeId === filterResumeId)),
    [records, filterResumeId],
  );

  const resumeTitleOf = (resumeId: string) =>
    resumes.find((resume) => resume.id === resumeId)?.title ?? '（源简历已不在本机）';

  const copy = async (record: ShareRecord) => {
    try {
      await navigator.clipboard.writeText(record.url);
      setCopiedId(record.id);
      window.setTimeout(() => setCopiedId((current) => (current === record.id ? null : current)), 1800);
    } catch {
      window.prompt('请手动复制链接：', record.url);
    }
  };

  const revoke = (recordId: string) => {
    if (!window.confirm('撤销这份分享记录？其他记录和旧链接均不受影响。')) {
      return;
    }
    shareRecordStore.revoke(recordId);
    refresh();
  };

  const reverify = async (recordId: string) => {
    setVerifyStates((previous) => ({ ...previous, [recordId]: 'checking' }));
    const valid = await shareRecordStore.verify(recordId);
    setVerifyStates((previous) => ({ ...previous, [recordId]: valid ? 'valid' : 'invalid' }));
  };

  const validCount = records.filter((record) => verifyStates[record.id] === 'valid').length;
  const invalidCount = records.filter((record) => verifyStates[record.id] === 'invalid').length;

  return (
    <div>
      <div className="flex flex-col justify-between gap-4 border-b border-[var(--border)] pb-6 md:flex-row md:items-end">
        <div>
          <p className="text-sm font-semibold uppercase text-[var(--accent-strong)]">Read-only snapshots</p>
          <h1 className="mt-2 font-display text-4xl font-semibold">只读分享记录</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted)]">
            每条记录对应一个自包含快照链接，无需服务端即可打开；撤销只删除本机记录，不会影响旧链接或其他记录。
          </p>
        </div>
        <div className="flex items-center gap-3 text-sm text-[var(--muted)]">
          <span className="inline-flex items-center gap-1">
            <BadgeCheck size={16} className="text-[var(--accent-strong)]" /> 核对通过 {validCount}
          </span>
          {invalidCount > 0 ? (
            <span className="inline-flex items-center gap-1 text-[var(--danger)]">
              <FileWarning size={16} /> 异常 {invalidCount}
            </span>
          ) : null}
          <select
            className="min-h-10 rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 text-sm font-semibold"
            value={filterResumeId}
            onChange={(event) => setFilterResumeId(event.target.value)}
            aria-label="按简历筛选"
          >
            <option value="all">全部简历</option>
            {resumes.map((resume) => (
              <option key={resume.id} value={resume.id}>
                {resume.title}
              </option>
            ))}
          </select>
        </div>
      </div>

      {records.length === 0 ? (
        <div className="mt-8">
          <EmptyState
            actionLabel="去简历列表"
            description="在简历卡片上点击「分享」即可把当时内容固定为只读快照链接，同一简历可以生成多份互不覆盖的记录。"
            icon={<ShieldQuestion size={24} aria-hidden />}
            onAction={() => navigate('/resumes')}
            title="还没有分享记录"
          />
        </div>
      ) : visibleRecords.length === 0 ? (
        <p className="mt-10 text-center text-sm text-[var(--muted)]">该简历下暂无分享记录。</p>
      ) : (
        <ul className="mt-8 space-y-4">
          {visibleRecords.map((record) => {
            const verifyState = verifyStates[record.id] ?? 'idle';
            return (
              <li key={record.id} className="border border-[var(--border)] bg-[var(--surface)] p-5 shadow-panel">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <h3 className="font-display text-lg font-semibold">{resumeTitleOf(record.resumeId)}</h3>
                    <p className="mt-1 text-xs text-[var(--muted)]">
                      生成于 {formatDateTime(record.createdAt)} · 模块 {record.sectionIds.join(' / ')} · {record.urlLength} 字符
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-1">
                    <VerifyBadge state={verifyState} />
                    <Button icon={<Eye size={15} />} onClick={() => window.open(record.url, '_blank', 'noopener,noreferrer')}>
                      打开
                    </Button>
                    <Button icon={copiedId === record.id ? <Check size={15} /> : <Copy size={15} />} onClick={() => void copy(record)}>
                      {copiedId === record.id ? '已复制' : '复制链接'}
                    </Button>
                    <Button icon={<RefreshCw size={15} />} onClick={() => void reverify(record.id)} disabled={verifyState === 'checking'}>
                      重新核对
                    </Button>
                    <Button icon={<Trash2 size={15} />} variant="danger" onClick={() => void revoke(record.id)}>
                      撤销
                    </Button>
                  </div>
                </div>
                <p className="mt-3 break-all rounded bg-[var(--surface-alt)] p-3 font-mono text-[11px] leading-5 text-[var(--muted)]">
                  {record.url}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function VerifyBadge({ state }: { state: VerifyState }) {
  if (state === 'checking') {
    return (
      <span className="inline-flex min-h-10 items-center gap-1 rounded-md px-3 text-xs text-[var(--muted)]">
        <RefreshCw size={14} className="animate-spin" /> 核对中
      </span>
    );
  }
  if (state === 'valid') {
    return (
      <span className="inline-flex min-h-10 items-center gap-1 rounded-md bg-[var(--accent)]/10 px-3 text-xs font-semibold text-[var(--accent-strong)]">
        <BadgeCheck size={14} /> 核对通过
      </span>
    );
  }
  if (state === 'invalid') {
    return (
      <span className="inline-flex min-h-10 items-center gap-1 rounded-md bg-[var(--danger)]/10 px-3 text-xs font-semibold text-[var(--danger)]">
        <FileWarning size={14} /> 链接异常
      </span>
    );
  }
  return null;
}
