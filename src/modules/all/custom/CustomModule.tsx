import { useState } from 'react';
import { CustomForm } from './CustomForm';
import { CustomList } from './CustomList';
import { useCustom } from './useCustom';
import type { CustomItem, CustomItemInput } from './custom.types';

export function CustomModule() {
  const { state, add, update, remove } = useCustom();
  const [editing, setEditing] = useState<CustomItem | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  async function handleSubmit(input: CustomItemInput) {
    setSubmitting(true);
    setActionError(null);
    try {
      if (editing) {
        await update(editing.id, input);
        setEditing(null);
      } else {
        await add(input);
      }
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Something went wrong.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(item: CustomItem) {
    setActionError(null);
    try {
      await remove(item.id);
      if (editing?.id === item.id) {
        setEditing(null);
      }
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Failed to delete item.');
    }
  }

  return (
    <section className="custom-module">
      <header className="custom-module__header">
        <h2>Custom</h2>
      </header>

      <CustomForm
        key={editing?.id ?? 'new'}
        initialValue={
          editing ? { name: editing.name, description: editing.description } : undefined
        }
        submitting={submitting}
        onSubmit={handleSubmit}
        onCancel={editing ? () => setEditing(null) : undefined}
      />

      {actionError ? <p className="custom-module__error">{actionError}</p> : null}
      {state.error ? <p className="custom-module__error">{state.error}</p> : null}

      {state.loading ? (
        <p className="custom-module__loading">Loading…</p>
      ) : (
        <CustomList items={state.items} onEdit={setEditing} onDelete={handleDelete} />
      )}
    </section>
  );
}

export default CustomModule;
