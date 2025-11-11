# 🎨 Expandable Badge - Guia de Uso

Componente de badge animado com efeito de expansão no hover, perfeito para indicadores na página de pedidos.

## 📦 Componentes Criados

### 1. `ExpandableBadge` (Base)
Badge customizável com controle total sobre cores e estilos.

### 2. `StatusBadge` (Variantes Pré-definidas)
Badge com variantes de cor para diferentes status.

---

## 🚀 Como Usar

### Importação

```tsx
import { ExpandableBadge, StatusBadge } from '@/components/ui/expandable-badge';
```

---

## 📖 Exemplos

### 1. Badge Básico

```tsx
import { Truck } from 'lucide-react';

<ExpandableBadge
  icon={<Truck className="w-7 h-7" />}
  title="Em Rota"
  hoverColor="#dbeafe"
/>
```

### 2. Badge com Variante de Status

```tsx
import { CheckCircle, AlertTriangle, XCircle, Package } from 'lucide-react';

// Sucesso (Verde)
<StatusBadge
  variant="success"
  icon={<CheckCircle className="w-7 h-7" />}
  title="Entregue"
/>

// Aviso (Amarelo)
<StatusBadge
  variant="warning"
  icon={<AlertTriangle className="w-7 h-7" />}
  title="Pendente"
/>

// Erro (Vermelho)
<StatusBadge
  variant="danger"
  icon={<XCircle className="w-7 h-7" />}
  title="Falhou"
/>

// Lunna (Azul)
<StatusBadge
  variant="lunna"
  icon={<Package className="w-7 h-7" />}
  title="Lunna"
/>
```

### 3. Múltiplos Indicadores (Menu)

```tsx
import { Truck, CheckCircle, XCircle, Clock } from 'lucide-react';

<div className="flex gap-2 p-2 bg-white rounded-2xl shadow-md">
  <StatusBadge
    variant="success"
    icon={<CheckCircle className="w-7 h-7" />}
    title="Entregue"
  />

  <StatusBadge
    variant="warning"
    icon={<Clock className="w-7 h-7" />}
    title="Em Rota"
  />

  <StatusBadge
    variant="danger"
    icon={<XCircle className="w-7 h-7" />}
    title="Falhou"
  />

  <StatusBadge
    variant="info"
    icon={<Truck className="w-7 h-7" />}
    title="A Caminho"
  />
</div>
```

---

## 🎨 Variantes Disponíveis

| Variante | Cor de Fundo | Cor do Texto | Uso |
|----------|--------------|--------------|-----|
| `default` | Cinza | Cinza escuro | Status neutro |
| `success` | Verde claro | Verde escuro | Entregue, Sucesso |
| `warning` | Amarelo claro | Amarelo escuro | Pendente, Atenção |
| `danger` | Vermelho claro | Vermelho escuro | Falha, Erro |
| `info` | Azul claro | Azul escuro | Informação |
| `lunna` | Azul Lunna | Azul Lunna | Pedidos do Lunna |

---

## ⚙️ Props

### `ExpandableBadge`

| Prop | Tipo | Obrigatório | Padrão | Descrição |
|------|------|-------------|--------|-----------|
| `icon` | `React.ReactNode` | ✅ | - | Ícone a ser exibido |
| `title` | `string` | ✅ | - | Texto que aparece no hover |
| `className` | `string` | ❌ | - | Classes CSS customizadas |
| `iconClassName` | `string` | ❌ | - | Classes para o ícone |
| `hoverColor` | `string` | ❌ | `#eee` | Cor do fundo no hover |

### `StatusBadge`

Mesmas props do `ExpandableBadge`, exceto:

| Prop | Tipo | Obrigatório | Padrão | Descrição |
|------|------|-------------|--------|-----------|
| `variant` | `'default' \| 'success' \| 'warning' \| 'danger' \| 'info' \| 'lunna'` | ❌ | `default` | Variante de cor |

---

## 🎬 Animação

O componente possui animação suave de expansão:

1. **Estado Normal**: 70px de largura, mostra apenas o ícone
2. **Estado Hover**: 130px de largura, mostra ícone + texto
3. **Transição**: 200ms com easing suave

---

## 💡 Exemplo Completo - Página de Pedidos

```tsx
'use client';

import { StatusBadge } from '@/components/ui/expandable-badge';
import { Truck, CheckCircle, XCircle, Clock, Package } from 'lucide-react';

export default function PedidosPage() {
  return (
    <div className="space-y-4">
      {/* Cabeçalho com indicadores */}
      <div className="flex gap-2 p-2 bg-white rounded-2xl shadow-md w-fit">
        <StatusBadge
          variant="lunna"
          icon={<Package className="w-7 h-7" />}
          title="Lunna"
        />

        <StatusBadge
          variant="info"
          icon={<Truck className="w-7 h-7" />}
          title="Em Rota"
        />

        <StatusBadge
          variant="success"
          icon={<CheckCircle className="w-7 h-7" />}
          title="Entregue"
        />

        <StatusBadge
          variant="danger"
          icon={<XCircle className="w-7 h-7" />}
          title="Falhou"
        />

        <StatusBadge
          variant="warning"
          icon={<Clock className="w-7 h-7" />}
          title="Pendente"
        />
      </div>

      {/* Tabela de pedidos */}
      <table>
        {/* ... */}
      </table>
    </div>
  );
}
```

---

## 🎨 Customização Avançada

### Badge com Cor Customizada

```tsx
<ExpandableBadge
  icon={<Star className="w-7 h-7 text-yellow-500" />}
  title="Favorito"
  className="bg-yellow-50 text-yellow-700"
  hoverColor="#fef9c3"
/>
```

### Badge com Ícone Customizado

```tsx
<StatusBadge
  variant="lunna"
  icon={
    <div className="w-7 h-7 flex items-center justify-center">
      <Moon className="w-5 h-5 fill-[#0095F6]" />
    </div>
  }
  title="Sistema Lunna"
/>
```

---

## 📱 Responsividade

O componente é totalmente responsivo e funciona bem em:
- Desktop (hover normal)
- Tablet (hover normal)
- Mobile (pode usar `:active` ou touch)

---

## ♿ Acessibilidade

- ✅ Foco visível
- ✅ Transições suaves
- ✅ Contraste adequado
- ✅ Semântica clara

---

## 🔧 Integração com Sistema Existente

Para usar na página de pedidos do Lunna, substitua os badges atuais:

```tsx
// Antes
<Badge variant="secondary">
  <Package className="h-4 w-4" />
  Lunna
</Badge>

// Depois
<StatusBadge
  variant="lunna"
  icon={<Package className="w-7 h-7" />}
  title="Lunna"
/>
```

---

## 🎯 Casos de Uso

1. **Indicadores de Status** - Pedidos, rotas, entregas
2. **Menu de Ações** - Botões com ícones expansíveis
3. **Filtros Visuais** - Filtrar por status com indicação visual
4. **Dashboard** - Métricas e KPIs interativos

---

## 🚀 Próximos Passos

1. Use o componente na página de pedidos
2. Customize as cores conforme necessário
3. Adicione mais variantes se necessário
4. Teste a animação em diferentes navegadores

---

**Componente pronto para uso!** 🎉
