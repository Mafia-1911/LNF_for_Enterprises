// Pages linked from the navigation that arrive in later phases.
import { Notice } from '@lf/ui';
import { PageHeader } from '../../components/PageHeader';

export function ComingSoon({ title, phase }: { title: string; phase: string }) {
  return (
    <div className="mx-auto max-w-[768px]">
      <PageHeader title={title} />
      <Notice tone="neutral" className="mt-6" title="Not built yet">
        {`This page arrives in ${phase}; for now, report a lost item from Home.`}
      </Notice>
    </div>
  );
}
