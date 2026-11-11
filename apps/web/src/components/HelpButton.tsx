// "Help" on every screen (SRS authority interface): a 30-second how-to for the current screen.
import { Button, Modal } from '@lf/ui';
import { useRouterState } from '@tanstack/react-router';
import { CircleHelp } from 'lucide-react';
import { useState } from 'react';
import { howToFor } from '../lib/help';

export function HelpButton() {
  const title = useRouterState({ select: (s) => s.matches.at(-1)?.staticData.title });
  const [open, setOpen] = useState(false);
  const howTo = howToFor(title);
  return (
    <>
      <Button
        variant="ghost"
        icon={CircleHelp}
        className="px-3 sm:px-5"
        onClick={() => setOpen(true)}
      >
        <span className="sr-only sm:not-sr-only">Help</span>
      </Button>
      <Modal
        open={open}
        onOpenChange={setOpen}
        title={howTo.title}
        footer={<Button onClick={() => setOpen(false)}>Got it</Button>}
      >
        <ol className="flex list-decimal flex-col gap-2 pl-6 text-body text-ink">
          {howTo.steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </Modal>
    </>
  );
}
