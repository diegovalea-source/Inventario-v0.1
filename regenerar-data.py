import json
import os
import re
import sys
import unicodedata
from datetime import date
from pathlib import Path

try:
    import openpyxl
except ImportError:
    print("No encuentro la libreria openpyxl. Pideme regenerar data.js desde Codex y lo hago yo.")
    raise SystemExit(1)


def norm(value):
    if value is None:
        return ""
    text = str(value).strip().upper()
    text = "".join(
        char for char in unicodedata.normalize("NFD", text)
        if unicodedata.category(char) != "Mn"
    )
    return re.sub(r"\s+", " ", text)


def clean(value):
    if value is None:
        return ""
    return re.sub(r"\s+", " ", str(value)).strip()


def slug(value):
    text = norm(value).lower()
    text = re.sub(r"[^a-z0-9]+", "-", text).strip("-")
    return text or "item"


def first_matching(headers, predicate):
    for index, header in enumerate(headers):
        if predicate(header):
            return index
    return None


def extract_items(excel_dir):
    items = []
    summaries = []

    for path in sorted(excel_dir.glob("*.xlsx")):
        if path.name.startswith("~$"):
            continue

        area_base = re.sub(r"^\d+_", "", path.stem, flags=re.I).replace("_", " ")
        area_base = re.sub(r"^ListadoProductos", "", area_base, flags=re.I) or area_base
        workbook = openpyxl.load_workbook(path, data_only=True, read_only=True)

        for sheet in workbook.worksheets:
            rows = list(sheet.iter_rows(values_only=True))
            if not rows:
                continue

            headers = [norm(value) for value in rows[0]]
            desc_col = first_matching(headers, lambda header: "DESCRIPCION" in header)
            section_col = first_matching(headers, lambda header: "SECCION" in header)
            reference_col = first_matching(headers, lambda header: "REFERENCIA" in header)
            barcode_col = first_matching(headers, lambda header: "BARRAS" in header)
            stock_col = first_matching(
                headers,
                lambda header: header == "STOCK"
                or header.startswith("Nº BOTELLAS")
                or header.startswith("NO BOTELLAS"),
            )
            cost_col = first_matching(headers, lambda header: "COSTE" in header)

            if desc_col is None:
                desc_col = 0
                cost_col = cost_col if cost_col is not None else 4
                stock_col = 3 if len(headers) > 3 else None

            section = "General"
            count = 0

            for row_number, row in enumerate(rows[1:], start=2):
                values = list(row)
                first = clean(values[0]) if len(values) > 0 else ""
                desc = clean(values[desc_col]) if desc_col < len(values) else ""
                nonempty_after_first = [value for value in values[1:] if value not in (None, "")]

                if section_col is not None and section_col < len(values) and clean(values[section_col]) and not desc:
                    section = clean(values[section_col])
                    continue

                if section_col is not None and section_col < len(values) and clean(values[section_col]):
                    section = clean(values[section_col])

                if desc_col == 0 and first and not nonempty_after_first:
                    section = first
                    continue

                if not desc:
                    continue

                cost = (
                    values[cost_col]
                    if cost_col is not None
                    and cost_col < len(values)
                    and isinstance(values[cost_col], (int, float))
                    else None
                )
                stock = (
                    values[stock_col]
                    if stock_col is not None
                    and stock_col < len(values)
                    and isinstance(values[stock_col], (int, float))
                    else None
                )
                reference = clean(values[reference_col]) if reference_col is not None and reference_col < len(values) else ""
                barcode = clean(values[barcode_col]) if barcode_col is not None and barcode_col < len(values) else ""

                items.append({
                    "id": f"{slug(path.name)}-{slug(sheet.title)}-{row_number}",
                    "archivo": path.name,
                    "hoja": sheet.title,
                    "area": area_base.title(),
                    "seccion": section,
                    "referencia": reference,
                    "descripcion": desc,
                    "codigoBarras": barcode,
                    "coste": cost,
                    "stockExcel": stock,
                    "filaExcel": row_number,
                })
                count += 1

            summaries.append((path.name, sheet.title, count))

    return items, summaries


def main():
    script_dir = Path(__file__).resolve().parent
    excel_dir = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else script_dir.parent

    if not excel_dir.exists():
        print(f"No existe la carpeta: {excel_dir}")
        return 1

    items, summaries = extract_items(excel_dir)
    if not items:
        print(f"No he encontrado productos en Excel dentro de: {excel_dir}")
        return 1

    payload = {
        "generatedAt": date.today().isoformat(),
        "items": items,
    }

    json_path = script_dir / "inventory-data.json"
    js_path = script_dir / "data.js"
    json_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    js_path.write_text(
        "window.INVENTORY_DATA = "
        + json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
        + ";\n",
        encoding="utf-8",
    )

    print(f"Listo: {len(items)} productos regenerados.")
    for filename, sheet, count in summaries:
        print(f"- {filename} / {sheet}: {count}")
    print(f"Actualizado: {js_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
