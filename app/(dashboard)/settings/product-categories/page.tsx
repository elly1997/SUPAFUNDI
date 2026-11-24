export const dynamic = "force-dynamic";

import { ProductCategoriesSettings } from "@/components/settings/product-categories-settings";
import { PageHeader } from "@/components/ui/page-header";

export default function ProductCategoriesSettingsPage() {
  return (
    <div className="space-y-4">
      <PageHeader
        title="Product categories"
        description="Catalog groups used on POS chips, stock lists, and industry reports."
      />
      <ProductCategoriesSettings />
    </div>
  );
}
