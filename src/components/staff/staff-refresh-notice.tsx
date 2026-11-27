import { Button } from '@/components/ui/button';

export function StaffRefreshNotice({retry}:{retry:()=>void}) {
  return <div role="status" className="flex items-center gap-3 rounded-md border p-3 text-sm">
    <p>A atualização falhou. Os últimos dados carregados continuam visíveis.</p>
    <Button variant="outline" size="sm" onClick={retry}>Tentar novamente</Button>
  </div>;
}
