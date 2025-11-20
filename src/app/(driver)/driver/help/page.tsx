'use client';

import * as React from 'react';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Mail, MessageCircle, Phone } from 'lucide-react';

export default function DriverHelpPage() {
  return (
    <div className="space-y-4 p-4">
      <h1 className="text-2xl font-bold">Ajuda & Suporte</h1>

      <Card>
        <CardHeader>
          <CardTitle>Perguntas Frequentes</CardTitle>
          <CardDescription>Respostas para as dúvidas mais comuns</CardDescription>
        </CardHeader>
        <CardContent>
          <Accordion type="single" collapsible className="w-full">
            <AccordionItem value="item-1">
              <AccordionTrigger>Como iniciar uma rota?</AccordionTrigger>
              <AccordionContent>
                Para iniciar uma rota, acesse "Minhas Rotas Ativas", selecione a rota desejada e
                clique no botão "Iniciar" no topo da tela. O sistema ativará automaticamente o
                rastreamento GPS.
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="item-2">
              <AccordionTrigger>Como confirmar uma entrega?</AccordionTrigger>
              <AccordionContent>
                Durante a rota, clique no botão "Confirmar" ao lado de cada parada. Você precisará
                tirar uma foto da entrega e informar a forma de pagamento.
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="item-3">
              <AccordionTrigger>O que fazer em caso de falha na entrega?</AccordionTrigger>
              <AccordionContent>
                Ao confirmar a parada, selecione "Falha na entrega" e escolha o motivo (cliente
                ausente, endereço incorreto, etc.). Informe se foi até o local e tire uma foto
                como comprovante.
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="item-4">
              <AccordionTrigger>Como ativar as notificações?</AccordionTrigger>
              <AccordionContent>
                Na página inicial (Minhas Rotas), clique no botão "Ativar Notificações". Você
                precisará permitir o acesso às notificações nas configurações do navegador.
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="item-5">
              <AccordionTrigger>Posso finalizar a rota antes de completar todas as entregas?</AccordionTrigger>
              <AccordionContent>
                Você precisa concluir pelo menos 80% das entregas para finalizar a rota. Entregas
                concluídas incluem tanto as bem-sucedidas quanto as com falha registrada.
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Precisa de mais ajuda?</CardTitle>
          <CardDescription>Entre em contato conosco</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button variant="outline" className="w-full justify-start" asChild>
            <a href="tel:+5511999999999">
              <Phone className="mr-2 h-4 w-4" />
              Ligar para o suporte
            </a>
          </Button>
          <Button variant="outline" className="w-full justify-start" asChild>
            <a href="https://wa.me/5511999999999" target="_blank" rel="noopener noreferrer">
              <MessageCircle className="mr-2 h-4 w-4" />
              WhatsApp
            </a>
          </Button>
          <Button variant="outline" className="w-full justify-start" asChild>
            <a href="mailto:suporte@rotaexata.com.br">
              <Mail className="mr-2 h-4 w-4" />
              Email: suporte@rotaexata.com.br
            </a>
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Informações do Aplicativo</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Versão</span>
              <span className="font-medium">v1.2.3</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Última atualização</span>
              <span className="font-medium">19/11/2025</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
