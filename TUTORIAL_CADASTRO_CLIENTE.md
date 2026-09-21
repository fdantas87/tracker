# Guia do cliente: configurando o seu painel de tracking

Este guia cobre **só o seu lado**: o que fazer depois que o painel já está no ar.
A instalação (Supabase, banco, deploy, domínio) é feita pelo operador e está em
[ONBOARDING.md](./ONBOARDING.md) — **este arquivo não a duplica**, de propósito:
duas fontes para o mesmo procedimento já divergiram uma vez, e a divergência foi
justamente no passo que derrubou a captura em produção.

Tempo: ~10 min.

---

## Passo 1: criar o seu acesso

Abra o endereço do painel (ex.: `https://tracking.lojax.com.br`).

Se ninguém entrou nele ainda, a tela mostra **"Configurar pela primeira vez"**:

1. **Nome da organização** — aparece no cabeçalho do painel. Já vem sugerido;
   pode corrigir.
2. **Email** e **senha** (mínimo de 10 caracteres), duas vezes.
3. **Criar conta e entrar.**

Pronto: você já está dentro. Essa tela **some depois da primeira conta** e não
volta — dali em diante o endereço só mostra o login normal.

> Não apareceu essa tela e sim o login? Alguém já criou a conta. Peça a senha a
> quem instalou.

---

## Passo 2: cadastrar os destinos

**Configurações ➜ Contas.** É aqui que você diz para onde os eventos vão.

- **Pixel do Meta:** o ID do pixel e o **token da Conversions API (CAPI)**.
- **GA4:** o **Measurement ID** (`G-XXXXXXX`) e o **API Secret**.
- **Conta de anúncio** (opcional): o ID e o token de Ads.

Use o botão **Testar conexão** em cada uma.

> **"Verificar" não é erro.** No GA4 o Google não devolve nenhuma resposta que
> prove que a credencial está certa — nem com credencial errada ele reclama. Por
> isso o teste **envia um evento de verdade** e te dá o link do DebugView para
> conferir do outro lado. Resultado em azul com ícone de informação = deu certo,
> falta só você olhar.

---

## Passo 3: ligar o disparo automático

**Configurações ➜ Disparo.**

- **URL do cron:** o endereço do seu painel + `/api/cron/dispatch`
  (ex.: `https://tracking.lojax.com.br/api/cron/dispatch`).
- **Token do cron:** clique em gerar. Ele aparece **uma única vez** — copie
  antes de sair da tela.
- **Modo:** deixe em `adaptive` e janela de 15 minutos, salvo orientação
  diferente.

Sem a URL preenchida os eventos ficam parados na fila e **nada chega ao Meta**,
sem nenhum erro aparecer. É o passo mais fácil de esquecer e o mais caro.

---

## Passo 4: webhook da plataforma de pagamento

**Configurações ➜ Geral** → gere o **token do webhook** (também mostrado uma vez
só) e cadastre esta URL na sua plataforma:

```
https://tracking.lojax.com.br/api/webhook/compra/perfectpay?token=SEU_TOKEN
```

É isso que faz a **compra** virar evento de conversão, com o valor da venda.

---

## Passo 5: instalar o script nos sites

Em **todos** os sites que devem ser rastreados, no `<head>` ou antes de fechar o
`</body>`:

```html
<script src="https://tracking.lojax.com.br/track.js" defer></script>
```

> Cada site precisa estar autorizado no deploy (variável
> `TRACKING_ALLOWED_ORIGINS`). Vai rastrear um domínio novo? Avise o operador
> **antes** — sem isso o navegador bloqueia a captura daquele site em silêncio,
> sem erro visível.

---

## Passo 6: conferir que está capturando

Abra um dos seus sites **em janela anônima** (isso importa: logado no painel da
Vercel você atravessa proteções que um visitante comum não atravessa, e o teste
mente).

Depois, no painel:

- **Visitantes** — a sua visita deve aparecer.
- **Eventos** — o `PageView` deve estar lá. Ele fica alguns minutos como
  *pendente* antes de sair: é a janela de 15 minutos, é o comportamento certo.

---

## Perdi minha senha

Não há recuperação por email. Quem tem acesso ao Supabase do seu projeto resolve
em um minuto (**Authentication ➜ Users ➜ Reset password**) — fale com o
operador. Nenhum dado de tracking se perde nesse processo.

---

## Perguntas rápidas

**Preciso mexer em alguma coisa quando o sistema for atualizado?**
Não. As melhorias chegam sozinhas ao seu painel.

**Posso trocar o nome que aparece no painel?**
O do cabeçalho, sim — foi o que você digitou no passo 1. O da aba do navegador
vem de uma variável do deploy e precisa do operador.

**Os números de Vendas e de Visitantes não batem. Está errado?**
Não. **Vendas** mostra todas as compras; **Visitantes** só as que foram
atribuídas a uma visita conhecida. Compra em que não deu para identificar a
origem entra na primeira e não na segunda — é o esperado.
