"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { Loader2, MessageSquare } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  previewCreditSmsApi,
  sendCreditReminderApi,
} from "@/lib/api/sms-fetch";

type Props = {
  customerId: string | null;
  customerName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function SendCreditSmsDialog({
  customerId,
  customerName,
  open,
  onOpenChange,
}: Props) {
  const [message, setMessage] = useState("");
  const [skipCooldown, setSkipCooldown] = useState(false);

  const { data: preview, isLoading, refetch } = useQuery({
    queryKey: ["sms-preview", customerId],
    queryFn: () => previewCreditSmsApi(customerId!),
    enabled: open && !!customerId,
  });

  useEffect(() => {
    if (preview?.message) setMessage(preview.message);
  }, [preview?.message]);

  useEffect(() => {
    if (open && customerId) void refetch();
  }, [open, customerId, refetch]);

  const sendMut = useMutation({
    mutationFn: () =>
      sendCreditReminderApi({
        customerId: customerId!,
        messageOverride: message,
        skipCooldown,
      }),
    onSuccess: (r) => {
      if (r.ok) {
        toast.success(`SMS sent to ${customerName}`);
        onOpenChange(false);
      } else {
        toast.error(r.message);
      }
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : "Send failed");
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquare className="size-5 text-primary" />
            Send credit reminder
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            To: <span className="font-medium text-foreground">{customerName}</span>
            {preview?.phone ? (
              <>
                {" "}
                · <span className="font-mono">{preview.phone}</span>
              </>
            ) : (
              <span className="text-destructive"> · No valid phone</span>
            )}
          </p>
          <div className="space-y-2">
            <Label>Message</Label>
            {isLoading ? (
              <div className="flex justify-center py-6">
                <Loader2 className="size-5 animate-spin" />
              </div>
            ) : (
              <Textarea
                rows={5}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
              />
            )}
            <p className="text-xs text-muted-foreground">
              {message.length} characters · standard SMS is ~160 chars per
              segment
            </p>
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="size-4 rounded border-border"
              checked={skipCooldown}
              onChange={(e) => setSkipCooldown(e.target.checked)}
            />
            Send even if reminded recently (override cooldown)
          </label>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={
              sendMut.isPending || isLoading || !customerId || !preview?.phone
            }
            onClick={() => sendMut.mutate()}
          >
            {sendMut.isPending ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : null}
            Send SMS
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
