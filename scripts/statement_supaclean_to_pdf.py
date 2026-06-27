"""Generate a clean PDF bank statement from Statement Supaclean 2025.xlsx."""
from __future__ import annotations

from pathlib import Path

import openpyxl
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

XLSX_PATH = Path(r"c:\Users\HP\OneDrive\Desktop\Statement Supaclean 2025.xlsx")
OUT_PATH = Path(r"c:\Users\HP\OneDrive\Desktop\Statement Supaclean 2025 (Clear).pdf")

HEADERS = [
    "Book Date",
    "Value Date",
    "Branch",
    "Narration",
    "Reference",
    "Cheque",
    "Debit (TZS)",
    "Credit (TZS)",
    "Balance (TZS)",
]

# Landscape A4 column widths (mm) — narration gets most space
COL_WIDTHS = [18 * mm, 18 * mm, 22 * mm, 78 * mm, 28 * mm, 16 * mm, 24 * mm, 24 * mm, 28 * mm]

HEADER_BG = colors.HexColor("#1E293B")
HEADER_FG = colors.white
TITLE_COLOR = colors.HexColor("#EA580C")
ALT_ROW = colors.HexColor("#F8FAFC")
DEBIT_TINT = colors.HexColor("#FEE2E2")
CREDIT_TINT = colors.HexColor("#D1FAE5")
BORDER = colors.HexColor("#CBD5E1")


def fmt_amount(val: float | int | None) -> str:
    if val is None or val == "":
        return ""
    try:
        n = float(val)
    except (TypeError, ValueError):
        return str(val)
    if n == 0:
        return ""
    return f"{n:,.2f}"


def fmt_cell(val) -> str:
    if val is None:
        return ""
    return str(val).strip()


def load_summary(wb: openpyxl.Workbook) -> dict[str, str | int | float]:
    ws = wb["Summary"]
    data: dict[str, str | int | float] = {}
    for row in ws.iter_rows(min_row=3, values_only=True):
        if row and row[0]:
            data[str(row[0])] = row[1]
    return data


def load_transactions(wb: openpyxl.Workbook) -> list[list]:
    ws = wb["All Records"]
    rows: list[list] = []
    for row in ws.iter_rows(min_row=5, values_only=True):
        if not row or not any(row):
            continue
        if row[0] == "TOTAL:" or (isinstance(row[5], str) and row[5] == "TOTAL:"):
            break
        rows.append(list(row))
    return rows


def build_styles():
    styles = getSampleStyleSheet()
    title = ParagraphStyle(
        "StmtTitle",
        parent=styles["Heading1"],
        fontName="Helvetica-Bold",
        fontSize=14,
        textColor=TITLE_COLOR,
        alignment=TA_CENTER,
        spaceAfter=4,
    )
    subtitle = ParagraphStyle(
        "StmtSubtitle",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=9,
        textColor=colors.HexColor("#475569"),
        alignment=TA_CENTER,
        spaceAfter=10,
    )
    meta = ParagraphStyle(
        "Meta",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=8.5,
        leading=11,
        textColor=colors.HexColor("#334155"),
    )
    cell = ParagraphStyle(
        "Cell",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=7,
        leading=8.5,
        alignment=TA_LEFT,
    )
    cell_right = ParagraphStyle(
        "CellRight",
        parent=cell,
        fontName="Courier",
        fontSize=7,
        alignment=TA_RIGHT,
    )
    cell_center = ParagraphStyle(
        "CellCenter",
        parent=cell,
        alignment=TA_CENTER,
    )
    header_cell = ParagraphStyle(
        "HeaderCell",
        parent=cell,
        fontName="Helvetica-Bold",
        fontSize=7.5,
        textColor=HEADER_FG,
        alignment=TA_CENTER,
    )
    return title, subtitle, meta, cell, cell_right, cell_center, header_cell


def summary_block(summary: dict, styles) -> list:
    _, _, meta, *_ = styles
    lines = [
        f"<b>Account:</b> {summary.get('Account', 'SUPACLEAN — 4086600442')}",
        f"<b>Period:</b> {summary.get('Statement Period', '01/01/2025 – 31/12/2025')}",
        f"<b>Transactions:</b> {summary.get('Total Transactions', '—')}",
        f"<b>Total Debit:</b> TZS {fmt_amount(summary.get('Total Debit (TZS)'))}",
        f"<b>Total Credit:</b> TZS {fmt_amount(summary.get('Total Credit (TZS)'))}",
        f"<b>Closing Balance:</b> TZS {fmt_amount(summary.get('Closing Balance (TZS)'))}",
    ]
    tbl_data = [[Paragraph(line, meta)] for line in lines]
    tbl = Table(tbl_data, colWidths=[sum(COL_WIDTHS)])
    tbl.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#FFF7ED")),
                ("BOX", (0, 0), (-1, -1), 0.5, BORDER),
                ("LEFTPADDING", (0, 0), (-1, -1), 8),
                ("RIGHTPADDING", (0, 0), (-1, -1), 8),
                ("TOPPADDING", (0, 0), (-1, -1), 6),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
            ]
        )
    )
    return [tbl, Spacer(1, 6 * mm)]


def transaction_table(rows: list[list], styles, start: int, end: int) -> Table:
    _, _, _, cell, cell_right, cell_center, header_cell = styles

    data: list[list] = [[Paragraph(h, header_cell) for h in HEADERS]]

    for i, row in enumerate(rows[start:end], start):
        book, value, branch, narr, xref, cheque, debit, credit, balance = (row + [None] * 9)[:9]
        data.append(
            [
                Paragraph(fmt_cell(book), cell_center),
                Paragraph(fmt_cell(value), cell_center),
                Paragraph(fmt_cell(branch)[:40], cell),
                Paragraph(fmt_cell(narr), cell),
                Paragraph(fmt_cell(xref)[:24], cell),
                Paragraph(fmt_cell(cheque), cell_center),
                Paragraph(fmt_amount(debit), cell_right),
                Paragraph(fmt_amount(credit), cell_right),
                Paragraph(fmt_amount(balance), cell_right),
            ]
        )

    tbl = Table(data, colWidths=COL_WIDTHS, repeatRows=1)
    style_cmds = [
        ("BACKGROUND", (0, 0), (-1, 0), HEADER_BG),
        ("TEXTCOLOR", (0, 0), (-1, 0), HEADER_FG),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, 0), 7.5),
        ("ALIGN", (0, 0), (-1, 0), "CENTER"),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("GRID", (0, 0), (-1, -1), 0.25, BORDER),
        ("LEFTPADDING", (0, 0), (-1, -1), 3),
        ("RIGHTPADDING", (0, 0), (-1, -1), 3),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
    ]

    for r in range(1, len(data)):
        if r % 2 == 0:
            style_cmds.append(("BACKGROUND", (0, r), (-1, r), ALT_ROW))
        debit_val = rows[start + r - 1][6] if start + r - 1 < len(rows) else None
        credit_val = rows[start + r - 1][7] if start + r - 1 < len(rows) else None
        if debit_val:
            style_cmds.append(("BACKGROUND", (6, r), (6, r), DEBIT_TINT))
        if credit_val:
            style_cmds.append(("BACKGROUND", (7, r), (7, r), CREDIT_TINT))

    tbl.setStyle(TableStyle(style_cmds))
    return tbl


def totals_table(rows: list[list], styles) -> Table:
    _, _, _, cell, cell_right, cell_center, header_cell = styles
    total_debit = sum(float(r[6] or 0) for r in rows)
    total_credit = sum(float(r[7] or 0) for r in rows)
    closing = rows[-1][8] if rows else None

    data = [
        [Paragraph("", cell), Paragraph("", cell), Paragraph("", cell), Paragraph("", cell),
         Paragraph("", cell), Paragraph("<b>TOTALS</b>", header_cell),
         Paragraph(f"<b>{fmt_amount(total_debit)}</b>", cell_right),
         Paragraph(f"<b>{fmt_amount(total_credit)}</b>", cell_right),
         Paragraph(f"<b>{fmt_amount(closing)}</b>", cell_right)],
    ]
    tbl = Table(data, colWidths=COL_WIDTHS)
    tbl.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#E2E8F0")),
                ("BOX", (0, 0), (-1, -1), 0.5, BORDER),
                ("ALIGN", (5, 0), (5, 0), "RIGHT"),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("TOPPADDING", (0, 0), (-1, -1), 5),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ]
        )
    )
    return tbl


def add_page_number(canvas, doc):
    canvas.saveState()
    canvas.setFont("Helvetica", 8)
    canvas.setFillColor(colors.HexColor("#64748B"))
    canvas.drawRightString(
        doc.pagesize[0] - 12 * mm,
        8 * mm,
        f"Page {canvas.getPageNumber()}",
    )
    canvas.drawString(
        12 * mm,
        8 * mm,
        "NMB Customer Account Statement — SUPACLEAN (2025) — Reconstructed from scanned PDF",
    )
    canvas.restoreState()


def main() -> None:
    if not XLSX_PATH.exists():
        raise FileNotFoundError(
            f"Excel not found: {XLSX_PATH}\nRun statement_supaclean_to_xlsx.py first."
        )

    wb = openpyxl.load_workbook(XLSX_PATH, read_only=True, data_only=True)
    summary = load_summary(wb)
    rows = load_transactions(wb)
    wb.close()

    styles = build_styles()
    title, subtitle, *_ = styles

    doc = SimpleDocTemplate(
        str(OUT_PATH),
        pagesize=landscape(A4),
        leftMargin=10 * mm,
        rightMargin=10 * mm,
        topMargin=12 * mm,
        bottomMargin=14 * mm,
        title="Statement Supaclean 2025",
        author="SUPACLEAN",
    )

    story: list = []
    story.append(Paragraph("NMB CUSTOMER ACCOUNT STATEMENT", title))
    story.append(Paragraph("SUPACLEAN — Account 4086600442 — January to December 2025", subtitle))
    story.extend(summary_block(summary, styles))

    # ~22 data rows per page (landscape) after header block on page 1
    rows_per_page = 24
    for start in range(0, len(rows), rows_per_page):
        if start > 0:
            story.append(PageBreak())
            story.append(Paragraph("NMB CUSTOMER ACCOUNT STATEMENT — SUPACLEAN (continued)", title))
            story.append(Spacer(1, 4 * mm))
        end = min(start + rows_per_page, len(rows))
        story.append(transaction_table(rows, styles, start, end))
        story.append(Spacer(1, 3 * mm))

    story.append(Spacer(1, 4 * mm))
    story.append(totals_table(rows, styles))

    doc.build(story, onFirstPage=add_page_number, onLaterPages=add_page_number)

    print(f"Saved: {OUT_PATH}")
    print(f"Transactions: {len(rows)}")
    print(f"Pages: estimated {max(1, (len(rows) + rows_per_page - 1) // rows_per_page)}")


if __name__ == "__main__":
    main()
