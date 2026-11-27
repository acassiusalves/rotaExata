import { Check, User, Wand2 } from 'lucide-react';
import { TabsList, TabsTrigger } from '@/components/ui/tabs';

const tabs = [
  { value: 'organize', label: 'Organizar', Icon: Wand2 },
  { value: 'assign', label: 'Atribuir', Icon: User },
  { value: 'review', label: 'Revisar', Icon: Check },
] as const;

export function RoutePlanningTabs() {
  return (
    <TabsList aria-label="Planejamento da rota" className="gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
      {tabs.map(({ value, label, Icon }) => (
        <TabsTrigger key={value} value={value}
          className="rounded-md px-4 py-2 text-sm font-medium data-[state=active]:bg-white data-[state=active]:text-primary data-[state=active]:shadow-sm dark:data-[state=active]:bg-slate-900">
          <Icon aria-hidden="true" className="mr-2 h-4 w-4" />
          {label}
        </TabsTrigger>
      ))}
    </TabsList>
  );
}
