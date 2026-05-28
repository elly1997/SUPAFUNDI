"use client";

import { Printer } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  buildSaleDocumentPrintData,
  printSaleDocument,
  type SaleDocumentPrintData,
} from "@/components/invoices/sale-document-print";

type Props = {
  printData: SaleDocumentPrintData;
  variant?: "default" | "outline" | "secondary";
};

export function InvoicePrintButton({ printData, variant = "outline" }: Props) {
  return (
    <Button
      type="button"
      variant={variant}
      onClick={() => {
        if (!printSaleDocument(printData)) {
          toast.error("Allow pop-ups to print this document");
        }
      }}
    >
      <Printer className="mr-2 size-4" />
      Print PDF
    </Button>
  );
}

export { buildSaleDocumentPrintData };
