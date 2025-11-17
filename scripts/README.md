# Scripts de Migração e Manutenção

Este diretório contém scripts para manutenção e migração de dados do sistema Rota Exata.

## 📋 Scripts Disponíveis

### `update-driver-deliveries.ts`

**Objetivo:** Calcular e atualizar o total de entregas de cada motorista baseado no histórico de rotas existentes.

**O que faz:**
1. Busca todas as rotas do sistema
2. Conta quantas entregas foram concluídas com sucesso (`deliveryStatus === 'completed'`) por cada motorista
3. Atualiza o campo `totalDeliveries` no documento de cada motorista

**Quando usar:**
- Após implementar o sistema de contagem de entregas
- Para corrigir dados inconsistentes
- Para recalcular totais após mudanças no sistema

## 🚀 Como Executar

### Pré-requisitos

1. **Arquivo de Credenciais do Firebase:**
   - Você precisa ter o arquivo `serviceAccountKey.json` na raiz do projeto
   - Este arquivo contém as credenciais do Firebase Admin SDK
   - Para obter: Firebase Console → Project Settings → Service Accounts → Generate New Private Key

2. **Dependências instaladas:**
   ```bash
   npm install
   ```

### Executando o Script

```bash
npx tsx scripts/update-driver-deliveries.ts
```

### Exemplo de Saída

```
🚀 Iniciando atualização de total de entregas dos motoristas...

📦 Buscando todas as rotas...
✅ Encontradas 45 rotas

📊 Contagem de entregas por motorista:
────────────────────────────────────────────────────────────
👤 João Silva (abc123): 28 entregas
👤 Maria Santos (def456): 15 entregas
👤 Pedro Costa (ghi789): 12 entregas
────────────────────────────────────────────────────────────

📝 Total de motoristas: 3

🔄 Atualizando documentos dos motoristas...

  ✅ João Silva: 28 entregas → atualizado
  ✅ Maria Santos: 15 entregas → atualizado
  ✅ Pedro Costa: 12 entregas → atualizado

✨ Sucesso! 3 motoristas atualizados com sucesso!

🎉 Migração concluída!

✅ Script finalizado com sucesso!
```

## ⚠️ Avisos Importantes

1. **Backup:** Sempre faça backup dos dados antes de executar scripts de migração
2. **Ambiente:** Certifique-se de estar executando no ambiente correto (desenvolvimento/produção)
3. **Credenciais:** Nunca compartilhe ou commite o arquivo `serviceAccountKey.json`
4. **Testes:** Teste primeiro em ambiente de desenvolvimento

## 📝 Notas

- O script é idempotente - pode ser executado múltiplas vezes sem causar problemas
- Apenas conta entregas com status `completed` (entregas bem-sucedidas)
- Entregas com status `failed` não são contabilizadas
- O script atualiza também o campo `updatedAt` de cada motorista
