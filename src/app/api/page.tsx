import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Code } from "lucide-react";

export default function ApiPage() {
  return (
    <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
      <div className="flex items-center justify-between space-y-2">
        <h2 className="text-3xl font-bold tracking-tight">API</h2>
      </div>
      <Card className="min-h-[400px] flex items-center justify-center">
        <CardContent className="text-center">
            <Code className="mx-auto h-12 w-12 text-muted-foreground" />
          <h3 className="mt-4 text-lg font-semibold">Documentação da API</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            Esta seção conterá a documentação para integração com a API.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
