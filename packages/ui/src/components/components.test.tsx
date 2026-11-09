import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Plus } from 'lucide-react';
import { describe, expect, it, vi } from 'vitest';
import { initials } from './Avatar';
import { Button } from './Button';
import { CategoryPicker, ColourPicker } from './Choices';
import { SelectField, TextField } from './Field';
import { Notice } from './Notice';
import { Stepper } from './Stepper';

describe('Button', () => {
  it('is a type="button" by default and blocks clicks while busy', () => {
    const onClick = vi.fn();
    render(
      <Button icon={Plus} loading onClick={onClick}>
        Submit report
      </Button>,
    );
    const button = screen.getByRole('button', { name: 'Submit report' });
    expect(button.getAttribute('type')).toBe('button');
    expect(button.hasAttribute('disabled')).toBe(true);
    expect(button.getAttribute('aria-busy')).toBe('true');
    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('meets the 48 px touch target (min-h-12) and the large size is 56 px (min-h-14)', () => {
    render(
      <>
        <Button>Medium</Button>
        <Button size="lg">Large</Button>
      </>,
    );
    expect(screen.getByRole('button', { name: 'Medium' }).className).toContain('min-h-12');
    expect(screen.getByRole('button', { name: 'Large' }).className).toContain('min-h-14');
  });
});

describe('fields', () => {
  it('labels the input and links the hint, then the error, for screen readers', () => {
    const { rerender } = render(
      <TextField label="University email" hint="We’ll send you a one-time code." />,
    );
    const input = screen.getByLabelText('University email');
    const hintId = input.getAttribute('aria-describedby') ?? '';
    expect(document.getElementById(hintId)?.textContent).toBe('We’ll send you a one-time code.');
    expect(input.getAttribute('aria-invalid')).toBeNull();

    rerender(
      <TextField
        label="University email"
        hint="We’ll send you a one-time code."
        error="Enter your university email."
      />,
    );
    const invalid = screen.getByLabelText('University email');
    expect(invalid.getAttribute('aria-invalid')).toBe('true');
    expect(
      document.getElementById(invalid.getAttribute('aria-describedby') ?? '')?.textContent,
    ).toBe('Enter your university email.');
  });

  it('marks optional fields in the label', () => {
    render(
      <SelectField
        label="Floor"
        optional
        options={[{ value: '', label: 'Any floor / not sure' }]}
      />,
    );
    expect(screen.getByLabelText('Floor (optional)').tagName).toBe('SELECT');
  });
});

describe('category and colour pickers', () => {
  const options = [
    { code: 'phone', label: 'Phone' },
    { code: 'laptop', label: 'Laptop' },
    { code: 'weapon', label: 'Weapon', restricted: true },
  ];

  it('is a radio group: click to pick, arrow keys move the selection', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <CategoryPicker
        label="What did you lose?"
        options={options}
        value="phone"
        onValueChange={onChange}
      />,
    );
    expect(screen.getByRole('radiogroup', { name: 'What did you lose?' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Phone' }).getAttribute('aria-checked')).toBe('true');
    await user.click(screen.getByRole('radio', { name: 'Laptop' }));
    expect(onChange).toHaveBeenLastCalledWith('laptop');
    screen.getByRole('radio', { name: 'Phone' }).focus();
    await user.keyboard('{ArrowRight}');
    expect(onChange).toHaveBeenLastCalledWith('laptop');
  });

  it('draws colour swatches, with a rainbow for Multi', () => {
    render(
      <ColourPicker
        label="Main colour"
        value={null}
        onValueChange={() => undefined}
        options={[
          { code: 'black', label: 'Black', swatch: '#1d1d1f' },
          { code: 'multi', label: 'Multi', swatch: 'multi' },
        ]}
      />,
    );
    const multi = screen.getByRole('radio', { name: 'Multi' }).querySelector('span');
    expect(multi?.className).toContain('lf-swatch-multi');
  });
});

describe('Stepper, Notice, Avatar', () => {
  it('says which step this is in words', () => {
    render(<Stepper step={2} total={4} title="Describe it" />);
    expect(screen.getByText(/Step 2 of 4/).textContent).toBe('Step 2 of 4 · Describe it');
  });

  it('announces urgent notices', () => {
    render(
      <Notice tone="danger" live="assertive">
        That code has expired; ask for a new one.
      </Notice>,
    );
    expect(screen.getByRole('alert').textContent).toContain('That code has expired');
  });

  it('builds initials from a name', () => {
    expect(initials('Rafiq Ahmed')).toBe('RA');
    expect(initials('Karim')).toBe('K');
    expect(initials('  ')).toBe('?');
  });
});
