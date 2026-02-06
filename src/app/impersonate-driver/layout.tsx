'use client';

export default function ImpersonateDriverLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      {/* Estilos globais para viewport mobile */}
      <style jsx global>{`
        /* Forçar viewport mobile */
        body {
          max-width: 100vw;
          overflow-x: hidden;
        }

        /* Container principal */
        .impersonate-container {
          min-height: 100vh;
          background: #f5f5f5;
        }

        /* Wrapper simulando smartphone */
        .impersonate-wrapper {
          min-height: 100vh;
          max-width: 428px;
          margin: 0 auto;
          background: white;
          position: relative;
        }

        @media (min-width: 768px) {
          /* Em desktop, adicionar bordas e sombra */
          .impersonate-wrapper {
            border-left: 1px solid #e5e7eb;
            border-right: 1px solid #e5e7eb;
            box-shadow: 0 0 30px rgba(0, 0, 0, 0.1);
          }
        }

        /* Garantir que todo conteúdo respeite o max-width */
        .impersonate-wrapper > * {
          max-width: 428px;
        }
      `}</style>

      <div className="impersonate-container">
        <div className="impersonate-wrapper">
          {children}
        </div>
      </div>
    </>
  );
}
