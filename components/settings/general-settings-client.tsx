"use client";

import { useMutation } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  updateOrganizationSettings,
  type OrganizationSettings,
} from "@/lib/actions/settings";
import { useOrgSettingsStore } from "@/stores/orgSettingsStore";

type Props = { initial: OrganizationSettings };

export function GeneralSettingsClient({ initial }: Props) {
  const setOrgSettings = useOrgSettingsStore((s) => s.setOrgSettings);
  const [form, setForm] = useState({
    name: initial.name,
    address: initial.address ?? "",
    phone: initial.phone ?? "",
    email: initial.email ?? "",
    taxId: initial.tax_id ?? "",
    currency: initial.currency,
    country: initial.country,
    vatEnabled: initial.vatEnabled,
    defaultVatRate: initial.defaultVatRate,
    defaultRetailMarginPct: initial.defaultRetailMarginPct,
    receiptFooter: initial.receiptFooter,
    requireCashSession: initial.requireCashSession,
  });

  const save = useMutation({
    mutationFn: () => updateOrganizationSettings(form),
    onSuccess: (r) => {
      if (r.ok) {
        setOrgSettings({
          vatEnabled: form.vatEnabled,
          defaultVatRate: form.defaultVatRate,
          defaultRetailMarginPct: form.defaultRetailMarginPct,
        });
        toast.success("Settings saved");
      } else toast.error(r.message);
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Company profile</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label>Business name</Label>
            <Input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <Label>Phone</Label>
            <Input
              value={form.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <Label>Email</Label>
            <Input
              type="email"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label>Address</Label>
            <Textarea
              value={form.address}
              onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
              rows={2}
            />
          </div>
          <div className="space-y-2">
            <Label>TIN / Tax ID</Label>
            <Input
              value={form.taxId}
              onChange={(e) => setForm((f) => ({ ...f, taxId: e.target.value }))}
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.vatEnabled}
                onChange={(e) =>
                  setForm((f) => ({ ...f, vatEnabled: e.target.checked }))
                }
              />
              Enable VAT on sales, purchases, and documents
            </label>
            <p className="form-hint text-xs text-muted-foreground">
              Turn off if you are not VAT-registered. Purchase costs are treated
              as VAT-inclusive; no extra VAT is added on receive.
            </p>
          </div>
          {form.vatEnabled ? (
            <div className="space-y-2">
              <Label>Default VAT %</Label>
              <Input
                type="number"
                min={0}
                max={100}
                value={form.defaultVatRate}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    defaultVatRate: Number(e.target.value) || 0,
                  }))
                }
              />
            </div>
          ) : null}
          <div className="space-y-2">
            <Label>Default retail margin %</Label>
            <Input
              type="number"
              min={0}
              max={500}
              value={form.defaultRetailMarginPct}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  defaultRetailMarginPct: Number(e.target.value) || 0,
                }))
              }
            />
            <p className="form-hint text-xs text-muted-foreground">
              Markup on buying price for auto retail (e.g. 40 → selling = cost ×
              1.4). Used on Receive goods and &quot;Fill missing retail&quot; on
              the price list.
            </p>
          </div>
          <div className="space-y-2">
            <Label>Currency</Label>
            <Input
              value={form.currency}
              maxLength={3}
              onChange={(e) =>
                setForm((f) => ({ ...f, currency: e.target.value.toUpperCase() }))
              }
            />
          </div>
          <div className="space-y-2">
            <Label>Country (ISO)</Label>
            <Input
              value={form.country}
              maxLength={2}
              onChange={(e) =>
                setForm((f) => ({ ...f, country: e.target.value.toUpperCase() }))
              }
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label>Receipt footer</Label>
          <Textarea
            value={form.receiptFooter}
            onChange={(e) =>
              setForm((f) => ({ ...f, receiptFooter: e.target.value }))
            }
            rows={2}
          />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.requireCashSession}
            onChange={(e) =>
              setForm((f) => ({ ...f, requireCashSession: e.target.checked }))
            }
          />
          Require open cash drawer before POS checkout
        </label>
        <Button onClick={() => save.mutate()} disabled={save.isPending}>
          {save.isPending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Saving…
            </>
          ) : (
            "Save settings"
          )}
        </Button>
      </CardContent>
    </Card>
  );
}

