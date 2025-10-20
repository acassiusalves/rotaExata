import React from 'react';

export const DriverLocationPulse: React.FC<{ size?: number }> = ({ size = 44.8 }) => {
  return (
    <div
      style={{
        width: `${size}px`,
        height: `${size}px`,
        position: 'relative',
        transform: 'rotate(45deg)',
      }}
    >
      <style>{`
        @keyframes pulse-driver-location {
          to {
            transform: perspective(${size * 7.5}px) translateZ(${size * 3.75}px);
            opacity: 0;
          }
        }

        .driver-pulse-before,
        .driver-pulse-after {
          content: "";
          position: absolute;
          inset: 0;
          border-radius: 50% 50% 0 50%;
          background: transparent;
          background-image: radial-gradient(circle ${size * 0.25}px at 50% 50%, transparent 94%, #10b981);
        }

        .driver-pulse-after {
          animation: pulse-driver-location 1s infinite;
          transform: perspective(${size * 7.5}px) translateZ(0px);
        }
      `}</style>
      <div className="driver-pulse-before" />
      <div className="driver-pulse-after" />
    </div>
  );
};
