"use client";

import { MessageCircle, Printer } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  printSaleDocument,
  shareSaleDocumentWhatsApp,
  type SaleDocumentPrintData,
} from "@/components/invoices/sale-document-print";

type Props = {
  printData: SaleDocumentPrintData;
  variant?: "default" | "outline" | "secondary";
  showWhatsApp?: boolean;
  customerPhone?: string | null;
};

export function InvoiceDocumentActions({
  printData,
  variant = "outline",
  showWhatsApp = true,
  customerPhone,
}: Props) {
  const isQuote =
    printData.saleType === "quotation" ||
    printData.saleType === "proforma" ||
    printData.saleType === "delivery_note";

  return (
    <div className="flex flex-wrap gap-2">
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
        Print A4
      </Button>
      {showWhatsApp ? (
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            shareSaleDocumentWhatsApp(
              printData,
              customerPhone ?? printData.customerPhone
            );
          }}
        >
          <MessageCircle className="mr-2 size-4" />
          {isQuote ? "Share quote" : "Share"}
        </Button>
      ) : null}
    </div>
  );
}

/** @deprecated use InvoiceDocumentActions */
export function InvoicePrintButton({
  printData,
  variant = "outline",
}: {
  printData: SaleDocumentPrintData;
  variant?: "default" | "outline" | "secondary";
}) {
  return <InvoiceDocumentActions printData={printData} variant={variant} />;
}

export { buildSaleDocumentPrintData } from "@/lib/invoices/print-data";
