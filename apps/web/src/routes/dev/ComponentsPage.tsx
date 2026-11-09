// Development and staging only: every base component in every state, in all 4 themes × light/dark.
// This preview is local to this page; it does not change anyone's theme.
import { COLOURS } from '@lf/domain';
import {
  Avatar,
  Badge,
  BottomSheet,
  Button,
  CategoryPicker,
  ChoiceCards,
  ColourPicker,
  IconButton,
  Logo,
  Modal,
  Notice,
  SearchField,
  Segmented,
  SelectField,
  Stepper,
  TextAreaField,
  TextField,
  TickTile,
  Toggle,
  useToast,
  type BadgeTone,
  type ButtonVariant,
} from '@lf/ui';
import { Bell, Plus } from 'lucide-react';
import { useState } from 'react';

const THEMES = ['navy', 'forest', 'indigo', 'teal'] as const;
const VARIANTS: ButtonVariant[] = [
  'primary',
  'accent',
  'secondary',
  'ghost',
  'soft',
  'danger',
  'success',
];
const TONES: BadgeTone[] = ['neutral', 'info', 'success', 'warning', 'danger', 'accent', 'primary'];

function Gallery({ id }: { id: string }) {
  const [tick, setTick] = useState(true);
  const [toggle, setToggle] = useState(true);
  const [seg, setSeg] = useState('lost');
  const [cat, setCat] = useState<string | null>('bag');
  const [colour, setColour] = useState<string | null>('black');
  const [building, setBuilding] = useState<string | null>('NAC');
  const [modal, setModal] = useState(false);
  const [sheet, setSheet] = useState(false);
  const toast = useToast();
  const h = 'text-heading-s font-bold text-ink';
  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3">
        <h3 className={h}>Logo, avatar, icon button</h3>
        <div className="flex flex-wrap items-center gap-4">
          <Logo />
          <span className="rounded-md bg-hero p-2">
            <Logo inverse />
          </span>
          <Avatar name="Rafiq Ahmed" size="s" />
          <Avatar name="Nusrat Jahan" size="m" />
          <Avatar name="Farhana Islam" size="l" />
          <IconButton icon={Bell} label="Alerts" />
          <IconButton icon={Bell} label="Alerts" count={3} />
        </div>
      </section>
      <section className="flex flex-col gap-3">
        <h3 className={h}>Buttons (M and L, enabled and disabled)</h3>
        {(['md', 'lg'] as const).map((size) => (
          <div key={size} className="flex flex-wrap gap-2">
            {VARIANTS.map((v) => (
              <Button key={v} variant={v} size={size} icon={Plus}>
                {v}
              </Button>
            ))}
            <Button size={size} disabled>
              Disabled
            </Button>
            <Button size={size} loading>
              Busy
            </Button>
          </div>
        ))}
      </section>
      <section className="flex flex-col gap-3">
        <h3 className={h}>Badges and notices</h3>
        <div className="flex flex-wrap gap-2">
          {TONES.map((t) => (
            <Badge key={t} tone={t}>
              In custody
            </Badge>
          ))}
        </div>
        <div className="grid gap-3 lg:grid-cols-2">
          {(['info', 'success', 'warning', 'danger', 'neutral'] as const).map((t) => (
            <Notice key={t} tone={t} title="ID card fast lane">
              When a university ID card is handed in, we email the owner straight away.
            </Notice>
          ))}
        </div>
      </section>
      <section className="grid gap-4 lg:grid-cols-3">
        <h3 className={`${h} lg:col-span-3`}>
          Inputs: text, select, search (default, error, disabled)
        </h3>
        <TextField
          id={`${id}-t1`}
          label="University email"
          placeholder="name@northsouth.edu"
          hint="We’ll send you a one-time code."
        />
        <TextField
          id={`${id}-t2`}
          label="University email"
          defaultValue="name@northsouth"
          error="Enter your university email, e.g. name@northsouth.edu."
        />
        <TextField
          id={`${id}-t3`}
          label="University email"
          optional
          disabled
          defaultValue="name@northsouth.edu"
        />
        <SelectField
          id={`${id}-s1`}
          label="Floor"
          optional
          options={[
            { value: '', label: 'Any floor / not sure' },
            { value: 'g', label: 'Ground floor' },
          ]}
        />
        <SearchField id={`${id}-q1`} label="Find an item" placeholder="ID, name or brand" />
        <TextAreaField
          id={`${id}-a1`}
          label="Public description"
          optional
          hint="Visible to staff and used for matching."
        />
      </section>
      <section className="flex flex-col gap-3">
        <h3 className={h}>Selection controls</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <TickTile label="Has a case" checked={tick} onCheckedChange={setTick} />
          <TickTile label="Cracked screen" checked={!tick} onCheckedChange={(v) => setTick(!v)} />
        </div>
        <Toggle label="Proxy pickup allowed" checked={toggle} onCheckedChange={setToggle} />
        <Segmented
          label="Records"
          value={seg}
          onValueChange={setSeg}
          items={[
            { value: 'lost', label: 'Lost' },
            { value: 'found', label: 'Found' },
            { value: 'claims', label: 'Claims' },
          ]}
        />
      </section>
      <section className="flex flex-col gap-3">
        <h3 className={h}>Category tiles (incl. restricted), colour chips, building cards</h3>
        <CategoryPicker
          label="Category"
          value={cat}
          onValueChange={setCat}
          options={[
            { code: 'bag', label: 'Bag' },
            { code: 'phone', label: 'Phone' },
            { code: 'glasses', label: 'Glasses' },
            { code: 'weapon', label: 'Weapon', restricted: true },
            { code: 'hazardous', label: 'Hazardous', restricted: true },
          ]}
        />
        <ColourPicker
          label="Colour"
          value={colour}
          onValueChange={setColour}
          options={COLOURS.map((c) => ({ ...c }))}
        />
        <ChoiceCards
          label="Building"
          value={building}
          onValueChange={setBuilding}
          options={[
            { value: 'NAC', code: 'NAC', label: 'North Academic Building' },
            { value: 'LIB', code: 'LIB', label: 'Library' },
            { value: 'unsure', code: '?', label: 'Not sure', dashed: true },
          ]}
        />
      </section>
      <section className="flex flex-col gap-3">
        <h3 className={h}>Stepper</h3>
        {[1, 2, 3, 4].map((s) => (
          <Stepper
            key={s}
            step={s}
            total={4}
            title={
              ['What is it?', 'Describe it', 'Where and when', 'Check and submit'][s - 1] ?? ''
            }
          />
        ))}
      </section>
      <section className="flex flex-wrap gap-2">
        <h3 className={`${h} w-full`}>Overlays and toast</h3>
        <Button variant="secondary" onClick={() => setModal(true)}>
          Open modal
        </Button>
        <Button variant="secondary" onClick={() => setSheet(true)}>
          Open bottom sheet
        </Button>
        <Button variant="secondary" onClick={() => toast({ title: 'Draft saved.' })}>
          Show toast
        </Button>
        <Modal
          open={modal}
          onOpenChange={setModal}
          title="Close this report?"
          footer={
            <>
              <Button variant="ghost" onClick={() => setModal(false)}>
                Keep it open
              </Button>
              <Button onClick={() => setModal(false)}>Yes, I found it</Button>
            </>
          }
        >
          Great news! Closing the report also cancels any open claims and alerts linked to it.
        </Modal>
        <BottomSheet
          open={sheet}
          onOpenChange={setSheet}
          title="Someone lost this?"
          description="Updates as you fill the form. Names and contacts stay hidden on both sides."
        >
          <div className="h-32 rounded-lg border border-line bg-subtle" />
          <Button variant="secondary" className="self-center" onClick={() => setSheet(false)}>
            Close
          </Button>
        </BottomSheet>
      </section>
    </div>
  );
}

export function ComponentsPage() {
  const [only, setOnly] = useState<string>('teal-dark');
  const combos = THEMES.flatMap((t) => (['light', 'dark'] as const).map((m) => `${t}-${m}`));
  return (
    <div className="mx-auto max-w-[1400px] px-4 py-8">
      <h1 className="font-display text-display-m font-semibold text-ink">Components</h1>
      <p className="text-body text-muted">
        Development only. Pick a theme to preview it here; the app’s real theme is set by the IT
        admin.
      </p>
      <div role="group" aria-label="Preview theme" className="mt-4 flex flex-wrap gap-2">
        {[...combos, 'all'].map((c) => (
          <Button
            key={c}
            size="md"
            variant={only === c ? 'primary' : 'secondary'}
            aria-pressed={only === c}
            onClick={() => setOnly(c)}
          >
            {c}
          </Button>
        ))}
      </div>
      <div className="mt-6 flex flex-col gap-6">
        {combos
          .filter((c) => only === 'all' || only === c)
          .map((c) => {
            const [theme, mode] = c.split('-');
            return (
              <section
                key={c}
                data-theme={theme}
                data-mode={mode}
                aria-label={`${c} theme`}
                className="rounded-xl border border-line bg-canvas p-6 text-ink"
              >
                <h2 className="pb-4 text-heading-l font-bold">{c}</h2>
                <Gallery id={c} />
              </section>
            );
          })}
      </div>
    </div>
  );
}
