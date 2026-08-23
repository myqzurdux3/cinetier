/** What a draggable or droppable id refers to, in words a person can hear. */
export interface ItemDescription {
  title: string;
  /** "the pool", or "tier A, position 2 of 3". */
  where: string;
}

type Id = string | number;
type Arg = { active: { id: Id }; over?: { id: Id } | null };

/**
 * The strings a screen reader hears during a drag.
 *
 * dnd-kit ships defaults ("Draggable item 3 was moved over droppable area 2"),
 * which are accurate and useless: they name the library's abstractions instead
 * of the user's films and rows. These name the film and the row.
 */
export function boardAnnouncements(describe: (id: string) => ItemDescription | null) {
  const of = (id: Id) => describe(String(id));

  return {
    onDragStart({ active }: Arg) {
      const item = of(active.id);
      return item ? `${item.title} lifted from ${item.where}.` : 'Item lifted.';
    },
    onDragOver({ active, over }: Arg) {
      const item = of(active.id);
      const target = over ? of(over.id) : null;
      if (!item) return 'Item moved.';
      if (!target) return `${item.title} is over nothing droppable.`;
      return `${item.title} is over ${target.where}.`;
    },
    onDragEnd({ active, over }: Arg) {
      const item = of(active.id);
      if (!item) return 'Item dropped.';
      const target = over ? of(over.id) : null;
      // Silence after a drop cannot be told apart from a drop that worked.
      if (!target) return `${item.title} was not moved.`;
      return `${item.title} dropped into ${target.where}.`;
    },
    onDragCancel({ active }: Arg) {
      const item = of(active.id);
      return item ? `Moving ${item.title} was cancelled.` : 'Moving was cancelled.';
    },
  };
}
