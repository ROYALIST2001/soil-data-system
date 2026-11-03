import { useEffect, useId, useMemo, useState } from "react";
import { getCatalogDistricts, getCatalogGNDivisions } from "./api";
import type { CatalogDistrict, GNDivision } from "./api";
import "./GNDivisionPicker.css";

interface Props {
  values: string[];
  onChange: (values: string[]) => void;
  multiple?: boolean;
}

export default function GNDivisionPicker({ values, onChange, multiple = false }: Props) {
  const id = useId();
  const [districts, setDistricts] = useState<CatalogDistrict[]>([]);
  const [district, setDistrict] = useState("");
  const [divisions, setDivisions] = useState<GNDivision[]>([]);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [active, setActive] = useState(0);
  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return divisions.filter((division) => division.name.toLowerCase().startsWith(query) || division.code.startsWith(query));
  }, [divisions, search]);

  useEffect(() => {
    if (open && filtered[active]) {
      document.getElementById(`${id}-option-${filtered[active].code}`)?.scrollIntoView({ block: "nearest" });
    }
  }, [active, open, filtered, id]);

  useEffect(() => {
    let alive = true;
    getCatalogDistricts().then((rows) => { if (alive) setDistricts(rows); })
      .catch(() => { if (alive) setError("Could not load districts. Please try again."); });
    return () => { alive = false; };
  }, [retry]);

  useEffect(() => {
    if (!district) return;
    let alive = true;
    setLoading(true); setError(""); setDivisions([]);
    getCatalogGNDivisions(district).then((rows) => { if (alive) setDivisions(rows); })
      .catch(() => { if (alive) setError("Could not load GN divisions. Please try again."); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [district, retry]);

  function choose(division: GNDivision) {
    if (multiple) {
      onChange(values.includes(division.value) ? values.filter((value) => value !== division.value) : [...values, division.value]);
    } else { onChange([division.value]); setOpen(false); }
  }

  const selected = divisions.find((division) => division.value === values[0]);
  return <div className="gn-picker">
    <div className="gn-picker-fields">
      <div className="field">
        <label htmlFor={`${id}-district`}>District</label>
        <select id={`${id}-district`} value={district} onChange={(event) => {
          setDistrict(event.target.value); setDivisions([]); setSearch(""); setOpen(false); setActive(0); setError("");
          if (!multiple) onChange([]);
        }}>
          <option value="">Choose a district</option>
          {districts.map((row) => <option key={row.code} value={row.code}>{row.name}</option>)}
        </select>
      </div>
      <div className="field gn-picker-combo" onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false);
      }}>
        <label htmlFor={`${id}-search`}>Grama Niladhari Division</label>
        <input id={`${id}-search`} type="text" role="combobox" aria-expanded={open} aria-controls={`${id}-list`}
          aria-autocomplete="list" autoComplete="off" disabled={!district || loading}
          aria-activedescendant={open && filtered[active] ? `${id}-option-${filtered[active].code}` : undefined}
          placeholder={!district ? "Choose a district first" : loading ? "Loading GN divisions..." : "Type a GN name or code"}
          value={open || multiple ? search : selected?.name ?? ""}
          onFocus={() => { setOpen(true); setSearch(""); setActive(0); }}
          onChange={(event) => { setSearch(event.target.value); setOpen(true); setActive(0); }}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault(); setOpen(true);
              setActive((index) => Math.max(0, Math.min(filtered.length - 1, index + (event.key === "ArrowDown" ? 1 : -1))));
            } else if (event.key === "Enter" && open && filtered[active]) {
              event.preventDefault(); choose(filtered[active]);
            } else if (event.key === "Escape") setOpen(false);
          }} />
        {open && !loading && <div className="gn-picker-menu">
          <div className="gn-picker-count" role="status">{filtered.length} matches</div>
          <div id={`${id}-list`} role="listbox" aria-label="Grama Niladhari divisions" aria-multiselectable={multiple} className="gn-picker-list">
            {filtered.length ? filtered.map((division, index) => <button type="button"
              id={`${id}-option-${division.code}`} key={division.code} role="option" tabIndex={-1} aria-selected={values.includes(division.value)}
              className={`gn-picker-option ${active === index ? "gn-picker-active" : ""}`}
              onMouseDown={(event) => event.preventDefault()} onMouseEnter={() => setActive(index)} onClick={() => choose(division)}>
              <strong>{values.includes(division.value) ? "✓ " : ""}{division.name}</strong>
              <span>{division.ds_division} · {division.code}</span>
            </button>) : <p className="gn-picker-empty">No matching divisions. Try a different spelling.</p>}
          </div>
        </div>}
      </div>
    </div>
    {values.length > 0 && <div className="gn-picker-selected">
      {values.map((value) => <button type="button" key={value} className="chip chip-on"
        onClick={() => onChange(values.filter((current) => current !== value))} aria-label={`Remove ${value}`}>{value} ×</button>)}
    </div>}
    {error && <p className="gn-picker-error">{error} <button type="button" onClick={() => { setError(""); setRetry((count) => count + 1); }}>Try again</button></p>}
  </div>;
}
