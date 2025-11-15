import React from 'react';
import Image from 'next/image';

export const DriverLocationPulse: React.FC<{ size?: number }> = ({ size = 128 }) => {
  return (
    <div
      style={{
        width: `${size}px`,
        height: `${size}px`,
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        pointerEvents: 'auto', // Permitir cliques no ícone
      }}
    >
      <style>{`
        @keyframes pulse-driver-location {
          0% {
            transform: scale(1);
            opacity: 0.7;
          }
          50% {
            transform: scale(1.2);
            opacity: 0.3;
          }
          100% {
            transform: scale(1.4);
            opacity: 0;
          }
        }

        .driver-pulse-ring {
          content: "";
          position: absolute;
          width: 100%;
          height: 100%;
          border-radius: 50%;
          background: rgba(209, 0, 0, 0.3);
          animation: pulse-driver-location 2s infinite;
          pointer-events: none;
        }
      `}</style>
      <div className="driver-pulse-ring" />
      <Image
        src="/icons/driver-marker.svg"
        alt="Localização do Motorista"
        width={size}
        height={size}
        style={{
          position: 'relative',
          zIndex: 10,
          pointerEvents: 'none',
          transform: 'rotate(0deg)', // Garantir rotação correta
        }}
        unoptimized
      />
    </div>
  );
};
