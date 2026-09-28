import type { CustomItem } from './custom.types';

interface CustomListProps {
  items: CustomItem[];
  onEdit?: (item: CustomItem) => void;
  onDelete?: (item: CustomItem) => void;
}

export function CustomList({ items, onEdit, onDelete }: CustomListProps) {
  if (items.length === 0) {
    return <p className="custom-list__empty">No items yet.</p>;
  }

  return (
    <ul className="custom-list">
      {items.map((item) => (
        <li key={item.id} className="custom-list__item">
          <div className="custom-list__content">
            <h3>{item.name}</h3>
            {item.description ? <p>{item.description}</p> : null}
          </div>
          <div className="custom-list__actions">
            {onEdit ? (
              <button type="button" onClick={() => onEdit(item)}>
                Edit
              </button>
            ) : null}
            {onDelete ? (
              <button type="button" onClick={() => onDelete(item)}>
                Delete
              </button>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}
