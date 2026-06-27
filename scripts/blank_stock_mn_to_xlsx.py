"""Convert Blank stock mn.pdf handwritten data to Excel."""
import shutil
import tempfile
from pathlib import Path

import openpyxl
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter

OUT_PATH = Path(r"c:\Users\HP\OneDrive\Desktop\Blank stock mn.xlsx")

# Transcribed from rendered PDF pages (image-only scan)
pages = [
    {
        "sheet": "Page 1",
        "title": "CLEARED STOCK LIST — January 2026",
        "rows": [
            [1, "1-1-6", "Honest", "0757 532 840", 9000, "NP"],
            [2, "16-4-6", "Mary", "0747 017 146", 14000, "NP"],
            [3, "11-4-6", "Imma", "086 260 613", 16000, "NP"],
            [4, "11-3-6", "Nelson", "0741 285 15", 8000, "NP"],
            [5, "21-4-6", "Petti", "0767 567 929", 9000, "NP"],
            [6, "7-2-6", "Lelo", "0767 266 812", 16000, "NP"],
            [7, "6-5-6", "Caleb", "0753 388 819", 8000, "NP"],
            [8, "9-6-6", "Mama Ivan", "", 36000, "NP"],
            [9, "8-3-6", "Ummy", "0759 844 083", 16000, "NP"],
            [10, "11-2-6", "Engars", "", 8000, "NP"],
            [11, "5-2-6", "Mrs. Fanuel", "", 8000, "NP"],
            [12, "10-8-6", "George", "0762 208 447", 26000, "NP"],
            [13, "8-5-6", "Winnie", "", 32000, "NP"],
            [14, "3-5-6", "Dotto", "0714 590 418", 27000, "NP"],
            [29, "9-3-6", "Ammi", "", 22000, "NP"],
            [31, "12-2-6", "Inno", "", 8000, "NP"],
            [32, "8-2-6", "Faraja", "0764 876 484", 8000, "PAID"],
            [33, "2-4-6", "Hope", "0716 749 896", 8000, "NP"],
            [34, "12-5-6", "Stephano", "0752 555 219", 8000, "PAID"],
            [35, "10-1-6", "Nishass", "", 9000, "NP"],
            [36, "8-2-6", "Nasr", "0742 686 576", 18000, "NP"],
            [37, "16-8-6", "Doreen", "0789 120 419", 26000, "NP"],
            [39, "14-6-6", "Rashid", "0789 734 849", 9000, "NP"],
            [40, "9-2-6", "Baba Lulu", "0755 082 645", 8000, "NP"],
            [41, "16-4-6", "Mary", "0747 017 146", 14000, "NP"],
        ],
    },
    {
        "sheet": "Page 2",
        "title": "CLEARED STOCK LIST — January 2026",
        "rows": [
            [1, "16-3-6", "James", "0768 600 220", 8000, "NP"],
            [2, "14-2-6", "Caren", "0756 684 948", 9000, "NP"],
        ],
    },
    {
        "sheet": "Page 3",
        "title": "CLEARED STOCK LIST — January 2026",
        "rows": [
            [1, "9-6-S", "Betha", "", 15000, "NP"],
            [2, "2-15-S", "Elisant", "", 8000, "NP"],
            [3, "5-11-S", "Neema", "0763 913 394", 9000, "NP"],
            [4, "2-16-S", "Nia", "0769 760 833", 10000, "NP"],
            [5, "12-9-S", "Ishimwe", "0765 283 882", 19000, "NP"],
            [6, "16-12-S", "Prosper", "0699 353 982", 40000, "NP"],
            [7, "14-13-S", "Neema", "0657 142 063", 16000, "NP"],
            [8, "8-30-S", "Dada Anna", "0764 067 272", 24000, "NP"],
            [9, "15-29-S", "Reganan", "0717 344 181", None, ""],
            [10, "1-22-S", "Mariam", "0692 800 886", 16000, "NP"],
            [11, "3-18-S", "Anold", "0622 157 339", 16000, "NP"],
            [12, "3-22-S", "Late", "0754 207 272", 32000, "NP"],
            [13, "1-20-S", "Isaya", "0626 551 278", 9000, "NP"],
            [14, "12-19-S", "Michael", "0758 267 229", 106000, "PAID"],
            [29, "5-23-S", "Regna", "0763 181 186", 9000, "NP"],
            [30, "12-2-S", "Lydia", "0754 606 023", 21000, "NP"],
            [31, "5-8-S", "Ludovic", "0673 826 999", 16000, "NP"],
            [32, "14-14-S", "Neema", "0753 266 804", 16000, "NP"],
            [33, "3-25-S", "Ester", "0767 035 829", 16000, "NP"],
            [34, "6-26-S", "Rahat", "0783 822 599", 8000, "NP"],
            [35, "1-18-S", "Fredric Kipimo", "0764 269 012", 10000, "NP"],
            [36, "21-29-S", "Awaich", "", 10000, "NP"],
            [37, "19-30-S", "Madam Flora", "", 22000, "NP"],
            [38, "3-28-S", "Mama J", "", 8000, "NP"],
            [39, "1-30-S", "Mary", "0754 606 630", 8000, "PAID"],
            [40, "9-12-S", "Sentipha", "0692 636 771", 8000, "NP"],
            [41, "4-28-S", "Rose", "0743 270 224", 17000, "NP"],
        ],
    },
    {
        "sheet": "Page 4",
        "title": "CLEARED STOCK LIST — January 2026",
        "rows": [
            [1, "7-17-4", "Dorice", "0652 464 507", 34000, "NP"],
            [2, "3-14-4", "Musa", "0768 563 878", 8000, "NP"],
            [3, "16-8-4", "Bupe", "0714 844 310", 8000, "NP"],
            [4, "16-18-4", "Nivian Kimaro", "", 8000, "NP"],
            [5, "12-15-4", "Boa Neema", "0768 227 551", 8000, "NP"],
            [6, "2-25-4", "Makara", "0742 688 249", 8000, "NP"],
            [7, "7-28-4", "Jenipha", "0745 600 505", 18000, "NP"],
            [8, "6-17-4", "Elia", "0755 247 758", 23000, "NP"],
            [9, "3-27-4", "Faraja", "0782 997 964", 9000, "NP"],
            [10, "2-30-4", "Mrs Kweka", "0752 661 478", 8000, "NP"],
            [11, "10-23-4", "Mesha", "0686 896 666", 8000, "NP"],
            [12, "6-17-4", "Elio", "0755 247 758", 23000, "NP"],
            [13, "4-25-4", "Necky", "0722 200 111", 25000, "NP"],
            [14, "4-28-4", "Jenipha", "0745 600 505", 18000, "NP"],
            [29, "4-2-4", "Jackson", "0748 027 517", 8000, "NP"],
            [30, "5-23-4", "Obama", "0751 242 460", 8000, "NP"],
            [31, "6-28-4", "Ade", "0757 551 382", 8000, "NP"],
            [32, "19-7-4", "Irene Sallaha", "0687 818 717", 18000, "NP"],
            [33, "4-18-4", "Betha", "0752 617 766", 6000, "NP"],
        ],
    },
]

headers = ["S/N", "CUST ID", "NAME", "PHONE NO.", "AMOUNT (TZS)", "STATUS"]

header_font = Font(bold=True, color="FFFFFF", size=11)
header_fill = PatternFill("solid", fgColor="1E293B")
title_font = Font(bold=True, size=14, color="F97316")
paid_fill = PatternFill("solid", fgColor="D1FAE5")
np_fill = PatternFill("solid", fgColor="FEF3C7")
thin = Side(style="thin", color="334155")
border = Border(left=thin, right=thin, top=thin, bottom=thin)
center = Alignment(horizontal="center", vertical="center")
left = Alignment(horizontal="left", vertical="center")
right = Alignment(horizontal="right", vertical="center")


def style_status(cell, val: str) -> None:
    cell.alignment = center
    if val == "PAID":
        cell.fill = paid_fill
        cell.font = Font(bold=True, color="065F46")
    elif val == "NP":
        cell.fill = np_fill
        cell.font = Font(bold=True, color="92400E")


def build_workbook() -> tuple[openpyxl.Workbook, list]:
    wb = openpyxl.Workbook()
    wb.remove(wb.active)
    all_rows: list = []

    for page in pages:
        ws = wb.create_sheet(title=page["sheet"])

        ws.merge_cells("A1:F1")
        ws["A1"] = page["title"]
        ws["A1"].font = title_font
        ws["A1"].alignment = center
        ws.row_dimensions[1].height = 28

        ws.merge_cells("A2:F2")
        ws["A2"] = "Branch Id:"
        ws["A2"].alignment = Alignment(horizontal="right")

        for col, h in enumerate(headers, 1):
            cell = ws.cell(row=4, column=col, value=h)
            cell.font = header_font
            cell.fill = header_fill
            cell.alignment = center
            cell.border = border

        for ri, row in enumerate(page["rows"], 5):
            for ci, val in enumerate(row, 1):
                cell = ws.cell(row=ri, column=ci, value=val)
                cell.border = border
                if ci == 1:
                    cell.alignment = center
                elif ci == 5:
                    cell.alignment = right
                    if val is not None:
                        cell.number_format = "#,##0"
                elif ci == 6:
                    if val:
                        style_status(cell, val)
                else:
                    cell.alignment = left
            all_rows.append([page["sheet"]] + row)

        total_row = len(page["rows"]) + 6
        ws.cell(row=total_row, column=4, value="TOTAL:").font = Font(bold=True)
        ws.cell(row=total_row, column=4).alignment = Alignment(horizontal="right")
        amt_cell = ws.cell(row=total_row, column=5, value=f"=SUM(E5:E{total_row - 1})")
        amt_cell.font = Font(bold=True)
        amt_cell.number_format = "#,##0"
        amt_cell.alignment = right

        widths = [6, 12, 22, 18, 16, 10]
        for i, w in enumerate(widths, 1):
            ws.column_dimensions[get_column_letter(i)].width = w

    ws_all = wb.create_sheet(title="All Records", index=0)
    ws_all.merge_cells("A1:G1")
    ws_all["A1"] = "CLEARED STOCK LIST — January 2026 (All Pages)"
    ws_all["A1"].font = title_font
    ws_all["A1"].alignment = center
    ws_all.row_dimensions[1].height = 28

    all_headers = ["PAGE"] + headers
    for col, h in enumerate(all_headers, 1):
        cell = ws_all.cell(row=3, column=col, value=h)
        cell.font = header_font
        cell.fill = header_fill
        cell.alignment = center
        cell.border = border

    for ri, row in enumerate(all_rows, 4):
        for ci, val in enumerate(row, 1):
            cell = ws_all.cell(row=ri, column=ci, value=val)
            cell.border = border
            if ci == 6:
                cell.alignment = right
                if val is not None:
                    cell.number_format = "#,##0"
            elif ci == 7:
                if val:
                    style_status(cell, val)
            elif ci in (1, 2):
                cell.alignment = center
            else:
                cell.alignment = left

    total_row = len(all_rows) + 5
    ws_all.cell(row=total_row, column=5, value="GRAND TOTAL:").font = Font(bold=True)
    ws_all.cell(row=total_row, column=5).alignment = Alignment(horizontal="right")
    grand_cell = ws_all.cell(row=total_row, column=6, value=f"=SUM(F4:F{total_row - 1})")
    grand_cell.font = Font(bold=True)
    grand_cell.number_format = "#,##0"

    ws_sum = wb.create_sheet(title="Summary")
    ws_sum["A1"] = "Summary"
    ws_sum["A1"].font = title_font

    amounts = [r[5] for r in all_rows if isinstance(r[5], (int, float))]
    paid_rows = [r for r in all_rows if r[6] == "PAID"]
    np_rows = [r for r in all_rows if r[6] == "NP"]

    summary_data = [
        ["Total Records", len(all_rows)],
        ["Total Amount (TZS)", sum(amounts)],
        ["Paid", len(paid_rows)],
        ["Not Paid (NP)", len(np_rows)],
        ["Paid Amount (TZS)", sum(r[5] for r in paid_rows)],
        ["Outstanding (TZS)", sum(r[5] for r in np_rows)],
    ]
    for i, (label, val) in enumerate(summary_data, 3):
        ws_sum.cell(row=i, column=1, value=label).font = Font(bold=True)
        c = ws_sum.cell(row=i, column=2, value=val)
        if isinstance(val, (int, float)) and i != 3:
            c.number_format = "#,##0"
    ws_sum.column_dimensions["A"].width = 22
    ws_sum.column_dimensions["B"].width = 18

    return wb, all_rows


def main() -> None:
    wb, all_rows = build_workbook()
    wb.save(OUT_PATH)

    amounts = [r[5] for r in all_rows if isinstance(r[5], (int, float))]
    print(f"Saved: {OUT_PATH}")
    print(f"Pages: {len(pages)}")
    print(f"Total records: {len(all_rows)}")
    print(f"Grand total: TZS {sum(amounts):,}")
    print(f"Paid: {sum(1 for r in all_rows if r[6] == 'PAID')}")
    print(f"NP: {sum(1 for r in all_rows if r[6] == 'NP')}")


if __name__ == "__main__":
    main()
