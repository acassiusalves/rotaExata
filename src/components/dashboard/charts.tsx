'use client';

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

const deliveriesData = [
  { hour: '08:00', deliveries: 2 },
  { hour: '09:00', deliveries: 5 },
  { hour: '10:00', deliveries: 12 },
  { hour: '11:00', deliveries: 15 },
  { hour: '12:00', deliveries: 8 },
  { hour: '13:00', deliveries: 7 },
  { hour: '14:00', deliveries: 18 },
  { hour: '15:00', deliveries: 22 },
  { hour: '16:00', deliveries: 20 },
  { hour: '17:00', deliveries: 16 },
  { hour: '18:00', deliveries: 10 },
];

const deliveriesChartConfig = {
  deliveries: {
    label: 'Entregas',
    color: 'hsl(var(--primary))',
  },
} satisfies ChartConfig;

export function DeliveriesChart() {
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

const statusData = [
  { name: 'Em Rota', value: 45, color: 'hsl(var(--chart-1))' },
  { name: 'Atribuído', value: 25, color: 'hsl(var(--chart-2))' },
  { name: 'Entregue', value: 85, color: 'hsl(var(--chart-3))' },
  { name: 'Criado', value: 15, color: 'hsl(var(--chart-4))' },
  { name: 'Cancelado', value: 5, color: 'hsl(var(--chart-5))' },
];

const statusChartConfig = {
    "Em Rota": { label: "Em Rota" },
    "Atribuído": { label: "Atribuído" },
    "Entregue": { label: "Entregue" },
    "Criado": { label: "Criado" },
    "Cancelado": { label: "Cancelado" },
} satisfies ChartConfig;


export function StatusChart() {
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
