import type { PartStatus } from '@/lib/types';
import { PART_STATUS_LABELS, PART_STATUS_COLORS } from '@/lib/types';

interface StatusBadgeProps {
  status: PartStatus;
  size?: 'sm' | 'md';
}

export default function StatusBadge({ status, size = 'md' }: StatusBadgeProps) {
  const colorClass = PART_STATUS_COLORS[status];
  const sizeClass = size === 'sm' ? 'text-xs px-2 py-0.5' : 'text-sm px-2.5 py-1';

  return (
    <span className={`inline-flex items-center rounded-full font-medium ${colorClass} ${sizeClass}`}>
      {PART_STATUS_LABELS[status]}
    </span>
  );
}
