'use client';
import React from 'react';

export default function DriverLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  
  return (
    <div className="flex min-h-screen w-full flex-col bg-muted">
       {/* Minimal layout for driver - can have its own header/footer later */}
       <main className="flex-1 p-4">{children}</main>
    </div>
  );
}
