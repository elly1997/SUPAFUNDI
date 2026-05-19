export default function PosLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="pos-shell flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden bg-background font-sans text-foreground antialiased">
      {children}
    </div>
  );
}
