'use client';

import { Skeleton } from '@/components/ui/skeleton';

interface RouteCardSkeletonProps {
  count?: number;
}

export function RouteCardSkeleton({ count = 1 }: RouteCardSkeletonProps) {
  return (
    <>
      {Array.from({ length: count }).map((_, index) => (
        <div
          key={index}
          className="flex flex-col items-stretch justify-start rounded-xl shadow-sm bg-card border overflow-hidden"
        >
          {/* Map Thumbnail Skeleton */}
          <Skeleton className="w-full aspect-[2/1]" />

          {/* Content */}
          <div className="flex w-full grow flex-col items-stretch justify-center gap-4 p-4">
            {/* Header with Status */}
            <div className="flex justify-between items-start">
              <Skeleton className="h-6 w-32" />
              <Skeleton className="h-6 w-24 rounded-full" />
            </div>

            {/* Stats */}
            <div className="flex items-center gap-4">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-4 w-16" />
            </div>

            {/* Action Button */}
            <Skeleton className="h-10 w-full mt-2" />
          </div>
        </div>
      ))}
    </>
  );
}

export function StatCardSkeleton() {
  return (
    <div className="flex min-w-[158px] flex-1 flex-col gap-2 rounded-xl p-4 bg-card border">
      <Skeleton className="h-4 w-16" />
      <Skeleton className="h-9 w-12" />
    </div>
  );
}

export function MyRoutesPageSkeleton() {
  return (
    <div className="flex flex-col min-h-screen">
      {/* Headline */}
      <Skeleton className="h-8 w-48 mx-4 mt-5 mb-3" />

      {/* Stats */}
      <div className="flex flex-wrap gap-4 p-4">
        <StatCardSkeleton />
        <StatCardSkeleton />
        <StatCardSkeleton />
      </div>

      {/* Section Header */}
      <Skeleton className="h-6 w-40 mx-4 mt-5 mb-3" />

      {/* Route Cards */}
      <div className="px-4 pb-4 space-y-4">
        <RouteCardSkeleton count={2} />
      </div>
    </div>
  );
}
