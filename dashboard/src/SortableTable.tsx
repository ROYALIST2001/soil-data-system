import { useMemo, useState } from "react";

// A table you can sort by clicking a column heading.
//
// WHY THIS IS HAND-WRITTEN AND NOT A LIBRARY.
// Table libraries are large, opinionated, and solve problems this dashboard
// does not have - virtual scrolling, grouping, pinned columns. Sorting a few
// hundred rows is about forty lines. Writing it means the whole dashboard has
// two dependencies instead of twenty, and nothing here is a mystery.

export interface Column<T> {
  key: string;
  label: string;

  // How to draw the cell. Returns anything React can render.
  render: (row: T) => React.ReactNode;

  // What to sort by. Returning a number or a string is enough; leave it out
  // for a column that should not be sortable, like an action button.
  sortValue?: (row: T) => number | string;

  // Right-align numbers, which makes them far easier to compare down a column.
  numeric?: boolean;
}

interface Props<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string | number;
  onRowClick?: (row: T) => void;
  emptyMessage?: string;

  // Which column to sort by before anybody clicks anything.
  initialSort?: string;
  initialDescending?: boolean;
}

export default function SortableTable<T>({
  columns,
  rows,
  rowKey,
  onRowClick,
  emptyMessage = "Nothing to show.",
  initialSort,
  initialDescending = false,
}: Props<T>) {

  const [sortKey, setSortKey] = useState<string | undefined>(initialSort);
  const [descending, setDescending] = useState(initialDescending);

  function handleSort(column: Column<T>) {
    if (!column.sortValue) {
      return;
    }

    if (sortKey === column.key) {
      // Clicking the same column again reverses it, which is what every
      // table everywhere does. Do not invent a different behaviour.
      setDescending(!descending);
    } else {
      setSortKey(column.key);
      setDescending(false);
    }
  }

  const sorted = useMemo(() => {
    if (!sortKey) {
      return rows;
    }

    const column = columns.find((c) => c.key === sortKey);
    if (!column?.sortValue) {
      return rows;
    }

    // Copy before sorting. Array.sort changes the array in place, and
    // mutating a prop is a reliable way to cause bugs that only appear when
    // something else re-renders.
    const copy = [...rows];

    copy.sort((a, b) => {
      const av = column.sortValue!(a);
      const bv = column.sortValue!(b);

      // localeCompare so names sort the way a person expects, rather than
      // by character code where "Z" comes before "a".
      const result =
        typeof av === "number" && typeof bv === "number"
          ? av - bv
          : String(av).localeCompare(String(bv));

      return descending ? -result : result;
    });

    return copy;
  }, [rows, columns, sortKey, descending]);

  if (rows.length === 0) {
    return <div className="empty">{emptyMessage}</div>;
  }

  return (
    <table>
      <thead>
        <tr>
          {columns.map((c) => (
            <th
              key={c.key}
              onClick={() => handleSort(c)}
              style={{
                cursor: c.sortValue ? "pointer" : "default",
                textAlign: c.numeric ? "right" : "left",
              }}
            >
              {c.label}
              {sortKey === c.key && (
                <span className="arrow">{descending ? "▼" : "▲"}</span>
              )}
            </th>
          ))}
        </tr>
      </thead>

      <tbody>
        {sorted.map((row) => (
          <tr
            key={rowKey(row)}
            className={onRowClick ? "clickable" : undefined}
            onClick={onRowClick ? () => onRowClick(row) : undefined}
          >
            {columns.map((c) => (
              <td key={c.key} className={c.numeric ? "num" : undefined}>
                {c.render(row)}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// A coloured pill for a quality flag. Used by both dashboards, so it lives
// here rather than being written twice.
export function FlagPill({ flag }: { flag: string }) {
  return <span className={`flag flag-${flag}`}>{flag}</span>;
}
