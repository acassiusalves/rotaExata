'use client';

import * as React from 'react';
import {
  Bar,
  BarChart,
  ResponsiveContainer,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import {
  ChartConfig,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart';
import type { RouteInfo } from '@/lib/types';
import { Timestamp } from 'firebase/firestore';

interface ChartProps {
  routes: (RouteInfo & { plannedDate: Timestamp, status: string })[];
}

const deliveriesChartConfig = {
  deliveries: {
    label: 'Entregas',
    color: 'hsl(var(--primary))',
  },
} satisfies ChartConfig;

export function DeliveriesChart({ routes }: ChartProps) {
  const deliveriesData = React.useMemo(() => {
    const today = new Date();
    const hourlyCounts: { [key: string]: number } = {};

    for (let i = 8; i <= 18; i++) {
        const hour = i.toString().padStart(2, '0');
        hourlyCounts[`${hour}:00`] = 0;
    }
    
    routes.forEach(route => {
        const routeDate = route.plannedDate.toDate();
        if (routeDate.toDateString() === today.toDateString()) {
            const hour = routeDate.getHours().toString().padStart(2, '0');
            const hourKey = `${hour}:00`;
            if (hourKey in hourlyCounts) {
                hourlyCounts[hourKey] += route.stops?.length || 0;
            }
        }
    });

    return Object.entries(hourlyCounts).map(([hour, deliveries]) => ({
      hour,
      deliveries,
    }));
  }, [routes]);


  return (
    <ChartContainer config={deliveriesChartConfig} className="h-[300px] w-full">
      <BarChart
        accessibilityLayer
        data={deliveriesData}
        margin={{
          top: 20,
          right: 20,
          bottom: 20,
          left: 0,
        }}
      >
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="hour"
          tickLine={false}
          tickMargin={10}
          axisLine={false}
          tickFormatter={(value) => value.slice(0, 5)}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          tickMargin={10}
          allowDecimals={false}
        />
        <Tooltip
          cursor={false}
          content={<ChartTooltipContent indicator="dot" />}
        />
        <Bar dataKey="deliveries" fill="var(--color-deliveries)" radius={4} />
      </BarChart>
    </ChartContainer>
  );
}

const statusChartConfig = {
    dispatched: { label: "Despachada", color: "hsl(var(--chart-4))" },
    in_progress: { label: "Em Andamento", color: "hsl(var(--chart-1))" },
    completed: { label: "Concluída", color: "hsl(var(--chart-2))" },
} satisfies ChartConfig;


export function StatusChart({ routes }: ChartProps) {
  const statusData = React.useMemo(() => {
    const counts = {
      dispatched: 0,
      in_progress: 0,
      completed: 0,
    };
    routes.forEach(route => {
      if (route.status in counts) {
        counts[route.status as keyof typeof counts]++;
      }
    });
    
    return Object.entries(counts).map(([name, value]) => ({
        name: statusChartConfig[name as keyof typeof statusChartConfig].label,
        value,
        color: statusChartConfig[name as keyof typeof statusChartConfig].color
    })).filter(item => item.value > 0);
  }, [routes]);


  return (
    <ChartContainer config={statusChartConfig} className="h-[300px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <ChartTooltip
            cursor={false}
            content={<ChartTooltipContent hideLabel />}
          />
          <Pie
            data={statusData}
            dataKey="value"
            nameKey="name"
            cx="50%"
            cy="50%"
            outerRadius={100}
            innerRadius={60}
            paddingAngle={5}
            labelLine={false}
          >
            {statusData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.color} />
            ))}
          </Pie>
          <ChartLegend
            layout="vertical"
            align="right"
            verticalAlign="middle"
            content={<ChartLegendContent />}
          />
        </PieChart>
      </ResponsiveContainer>
    </ChartContainer>
  );
}
