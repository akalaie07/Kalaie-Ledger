export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Buchhaltung
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Verkäufe &amp; Provisionen
          </p>
        </div>
        {children}
      </div>
    </div>
  );
}
