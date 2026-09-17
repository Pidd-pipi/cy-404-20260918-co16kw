import { useState } from 'react';
import { Dialog, DialogPanel, DialogTitle } from '@headlessui/react';
import { Check, Copy, Link2, Trash2 } from 'lucide-react';
import { useProfileStore } from '../../stores/profile';
import { useShareStore } from '../../stores/share';
import { Resume } from '../../types/resume';
import { ShareRecord } from '../../types/share';
import { formatDateTime } from '../../utils/format';
import { buildShareUrl, ShareLinkTooLongError } from '../../utils/share';
import { Button } from '../common/Button';

interface ShareDialogProps {
  open: boolean;
  resume: Resume;
  onClose: () => void;
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function ShareRecordRow({ record, onRevoke }: { record: ShareRecord; onRevoke: (recordId: string) => void }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    const ok = await copyText(buildShareUrl(record.token));
    if (ok) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    }
  };

  return (
    <li className="flex flex-wrap items-center justify-between gap-3 border border-[var(--border)] bg-[var(--surface)] px-4 py-3">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-[var(--ink)]">{formatDateTime(record.createdAt)}</p>
        <p className="mt-1 text-xs text-[var(--muted)]">
          校验码 {record.checksum} · {record.sectionCount} 个模块
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Button icon={copied ? <Check size={15} aria-hidden /> : <Copy size={15} aria-hidden />} onClick={handleCopy}>
          {copied ? '已复制' : '复制链接'}
        </Button>
        <Button
          aria-label="撤销该分享记录"
          icon={<Trash2 size={15} aria-hidden />}
          variant="danger"
          onClick={() => onRevoke(record.id)}
        >
          撤销
        </Button>
      </div>
    </li>
  );
}

/**
 * 分享管理对话框：为当前简历生成只读快照链接，并管理历史分享记录。
 * 每次生成都会固化当时的内容（模块范围与顺序一并快照），
 * 之后的简历改动不会改写已生成的链接；撤销只删除对应记录。
 */
export function ShareDialog({ open, resume, onClose }: ShareDialogProps) {
  const profile = useProfileStore((state) => state.profile);
  const records = useShareStore((state) => state.records);
  const createShareRecord = useShareStore((state) => state.createShareRecord);
  const revokeShareRecord = useShareStore((state) => state.revokeShareRecord);
  const [error, setError] = useState<string | null>(null);

  const resumeRecords = records.filter((record) => record.resumeId === resume.id);

  const handleCreate = () => {
    setError(null);
    try {
      createShareRecord(resume, profile);
    } catch (cause) {
      if (cause instanceof ShareLinkTooLongError) {
        setError('简历内容过大，生成的链接超出长度限制。请移除头像图片或精简内容后重试。');
      } else {
        setError('生成分享链接失败，请重试。');
      }
    }
  };

  const handleRevoke = (recordId: string) => {
    if (window.confirm('确定撤销这条分享记录吗？其他记录和链接不受影响。')) {
      revokeShareRecord(recordId);
    }
  };

  return (
    <Dialog className="relative z-50" open={open} onClose={onClose}>
      <div aria-hidden className="fixed inset-0 bg-black/40" />
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <DialogPanel className="w-full max-w-xl border border-[var(--border)] bg-[var(--bg)] p-6 shadow-panel">
          <DialogTitle className="font-display text-2xl font-semibold text-[var(--ink)]">分享「{resume.title}」</DialogTitle>
          <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
            每次生成都会把当前简历固化为一份只读快照链接，无需服务端即可打开。
            链接生成后不随简历改动变化，重新生成才会产生新快照。
          </p>

          <div className="mt-5">
            <Button icon={<Link2 size={16} aria-hidden />} variant="primary" onClick={handleCreate}>
              生成分享链接
            </Button>
            {error ? <p className="mt-3 text-sm text-[var(--danger)]">{error}</p> : null}
          </div>

          <div className="mt-6">
            <h3 className="text-sm font-semibold text-[var(--ink)]">
              分享记录（{resumeRecords.length}）
            </h3>
            {resumeRecords.length === 0 ? (
              <p className="mt-3 border border-dashed border-[var(--border)] bg-[var(--surface)] px-4 py-6 text-center text-sm text-[var(--muted)]">
                还没有分享记录，生成链接后可在此复制或撤销。
              </p>
            ) : (
              <ul className="mt-3 max-h-72 space-y-2 overflow-auto">
                {resumeRecords.map((record) => (
                  <ShareRecordRow key={record.id} record={record} onRevoke={handleRevoke} />
                ))}
              </ul>
            )}
          </div>

          <div className="mt-6 flex justify-end">
            <Button onClick={onClose}>关闭</Button>
          </div>
        </DialogPanel>
      </div>
    </Dialog>
  );
}
