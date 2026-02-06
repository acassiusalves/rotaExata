'use client';

export default function ImpersonateDriverLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-muted/20">
      {/* Container simulando smartphone */}
      <div className="impersonate-wrapper mx-auto max-w-[428px] border-x border-border bg-background shadow-lg">
        {children}
      </div>

      {/* Estilos globais para o wrapper */}
      <style jsx global>{`
        .impersonate-wrapper {
          min-height: 100vh;
        }

        @media (min-width: 768px) {
          /* Em desktop, adicionar efeito de smartphone */
          .impersonate-wrapper {
            border-left: 1px solid #e5e7eb;
            border-right: 1px solid #e5e7eb;
          }
        }
      `}</style>
    </div>
  );
}
