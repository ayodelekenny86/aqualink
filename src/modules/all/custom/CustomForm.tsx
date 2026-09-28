import { useState, type FormEvent } from 'react';
import type { CustomItemInput } from './custom.types';

interface CustomFormProps {
  initialValue?: CustomItemInput;
  submitting?: boolean;
  onSubmit: (input: CustomItemInput) => Promise<void> | void;
  onCancel?: () => void;
}

const emptyValue: CustomItemInput = { name: '', description: '' };

export function CustomForm({
  initialValue = emptyValue,
  submitting = false,
  onSubmit,
  onCancel,
}: CustomFormProps) {
  const [value, setValue] = useState<CustomItemInput>(initialValue);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!value.name.trim()) {
      return;
    }
    await onSubmit({ name: value.name.trim(), description: value.description.trim() });
    setValue(emptyValue);
  }

  return (
    <form className="custom-form" onSubmit={handleSubmit}>
      <label className="custom-form__field">
        <span>Name</span>
        <input
          type="text"
          value={value.name}
          onChange={(event) => setValue({ ...value, name: event.target.value })}
          placeholder="Item name"
          required
        />
      </label>
      <label className="custom-form__field">
        <span>Description</span>
        <textarea
          value={value.description}
          onChange={(event) => setValue({ ...value, description: event.target.value })}
          placeholder="Optional description"
          rows={3}
        />
      </label>
      <div className="custom-form__actions">
        <button type="submit" disabled={submitting || !value.name.trim()}>
          {submitting ? 'Saving…' : 'Save'}
        </button>
        {onCancel ? (
          <button type="button" onClick={onCancel} disabled={submitting}>
            Cancel
          </button>
        ) : null}
      </div>
    </form>
  );
}
