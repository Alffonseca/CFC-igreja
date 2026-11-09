# Registro de Implementações - Sistema de Gestão de Igrejas

Este arquivo documenta as funcionalidades implementadas até o momento para facilitar a replicação deste sistema em novos projetos ou ambientes.

## 1. Gestão de Usuários e Permissões
- **Papéis (Roles):** Implementação dos níveis: `admin`, `pastor`, `secretaria`, `cell`, `membro`.
- **Controle de Acesso:**
  - **Admin:** Acesso total.
  - **Pastor:** Acesso a tudo, exceto usuários administradores e a "Zona de Perigo".
  - **Secretaria:** Acesso a Principal, Lançamentos Financeiros, Relatórios Financeiros, Mural, Chat e listagem de usuários (exceto administradores e pastores).
  - **Membro:** Acesso restrito ao Mural e Chat.
- **Status Online:** Indicador visual (bolinha verde para online, vermelha para offline) na listagem de usuários, visível para administradores. O tamanho do indicador foi aumentado para melhor visibilidade.
- **Pesquisa de Usuários:** Campo de busca na tela de usuários para filtrar por nome ou nível de acesso.
- **Chat:** Possibilidade de deletar mensagens individuais enviadas pelo próprio usuário (ícone de lixeira ao passar o mouse sobre a mensagem).
- **Chat:** Suporte a emojis e envio de arquivos/imagens (upload para Firebase Storage).
- **Chat (Melhorias):**
  - **Notificação Privada:** Alerta visual (modal) quando uma mensagem privada é recebida, permitindo navegação rápida para a conversa.
  - **Tratamento de Erros:** Exibição de mensagem amigável na tela caso o upload de arquivos falhe (devido a restrições de CORS).
  - **Deleção Segura:** O botão "Apagar mensagens enviadas" agora deleta apenas as mensagens enviadas pelo próprio usuário logado, evitando erros de permissão.

## 2. Configurações e Interface
- **Zona de Perigo:** Visível e acessível apenas para administradores.
- **Upload de Logo:** Campos dedicados para Logo da Igreja e QR Code.
- **Backup e Restauração:** Seção dedicada nas configurações.

## 3. Relatórios
- **Seletor de Período Inteligente:** O seletor de data agora alterna entre seleção de dia (modo diário) e mês (modo mensal), melhorando a usabilidade na geração de relatórios.

## 5. Segurança
- **Hardening de Regras de Segurança:** Implementação de regras de segurança mais robustas no Firestore, incluindo validação de campos, proteção de campos imutáveis e controle de acesso baseado em papéis (RBAC).

## 6. Como replicar este projeto
Ao iniciar um novo projeto no AI Studio, você pode usar este arquivo como roteiro. Basta pedir ao assistente:

> "Leia o arquivo CHANGELOG_IMPLEMENTACOES.md e aplique todas as funcionalidades listadas neste novo projeto, mantendo a estrutura de papéis e permissões."

---
*Este documento é um guia de referência para o desenvolvimento do sistema.*

## 7. Alterações Recentes (Versão 2.0.0)

- **Notificações Globais de Mensagens Privadas:**
  - A lógica de escuta de mensagens foi movida de `Chat.tsx` para `Layout.tsx`.
  - Implementado alerta visual global que redireciona para o chat.
  - Adicionado filtro de 5 segundos para evitar alertas de mensagens antigas e verificação para não exibir o alerta se o usuário já estiver na tela de chat.

- **Expansão de Imagens no Mural:**
  - Adicionada funcionalidade de clique para expandir imagens no `Mural.tsx`.
  - Implementado modal com fundo desfocado para visualização em tela cheia.

- **Atualização de Versão:**
  - Versão do projeto atualizada para `2.0.0` no `package.json` e exibida na tela de login (`Login.tsx`).

- **Flexibilidade no Dashboard:**
  - O Dashboard agora exibe a mensagem de dízimos/ofertas mesmo que o QR Code não esteja cadastrado, permitindo maior flexibilidade para o pastor.

- **Oferta de Missões (Isolamento de Cálculo):**
  - A Oferta de Missões (3º Domingo / SEMEQ) foi desvinculada do cálculo do Total Arrecadado geral da igreja, da Taxa da Sede (25%) e do total diário dos cultos.
  - O valor de Missões permanece exibido exclusivamente em sua coluna, campo e resumo oficial dedicados.

- **Desdobramento e Calibração das Taxas Oficiais (Substituição dos 25%):**
  - A taxa anterior de 25% foi removida e substituída por 3 linhas oficiais calculadas sobre a Arrecadação com alíquotas calibradas exatamente com os boletos emitidos da IEQ:
    1. `(+) TAXA NACIONAL (5,00% SOBRE A ARRECADAÇÃO)` -> R$ 231,00 (+ R$ 15,00 de missões = R$ 246,00).
    2. `(+) TAXA ESTADUAL (11,0714% SOBRE A ARRECADAÇÃO)` -> R$ 511,50 (+ R$ 15,00 de missões = R$ 526,50).
    3. `(+) TAXA REGIONAL (3,9143% SOBRE A ARRECADAÇÃO)` -> R$ 180,84 (sem acréscimo de missões).
  - Atualizado em 100% dos módulos do sistema:
    - Tela de Lançamentos do REFC (`RefcEntryForm.tsx`);
    - Tabela de Saídas e Resumo Oficial;
    - Relatório Impresso e PDF do REFC (`QuadrangularReport.tsx`);
    - Planilha Oficial Exportada para Excel (`.xlsx`);
    - Resumo da folha de Entradas;
    - Sincronização automática com os lançamentos de saída do Caixa Geral;
    - Cards de conferência de Boletos no Menu Principal (`Dashboard.tsx`);
- **Novo Card de Saldo Acumulado no Painel Geral (`Dashboard.tsx`):**
  - Adicionado card dedicado "Saldo Acumulado" somando os saldos de todas as movimentações financeiras de todos os meses cadastrados no histórico da igreja (`(Dízimos Totais + Ofertas Totais) - Despesas Totais`).
  - O painel agora apresenta de forma clara e comparativa:
    1. **Dízimos** (do mês selecionado);
    2. **Ofertas** (do mês selecionado);
    3. **Despesas** (do mês selecionado);
    4. **Saldo Mensal** (resultado líquido apenas do mês selecionado);
    5. **Saldo Acumulado** (caixa geral total acumulado de todos os meses históricos).
  - Inclui indicação visual da quantidade de meses apurados e destaque de caixa.
- **Sincronização Exata dos Boletos no Financeiro e Unificação com o Painel Geral:**
  - O card de **Despesas** no Painel Geral (`Dashboard.tsx`) agora está 100% sincronizado com o **Total Geral de Saídas do Mês** do REFC (`RefcEntryForm.tsx` e `QuadrangularReport.tsx`).
  - O valor dos boletos na planilha de saídas do REFC e no relatório impresso/Excel passou a exibir o valor real a pagar (com o repasse de 50% de Missões nos boletos Nacional e Estadual: R$ 246,00 e R$ 526,50), garantindo que a soma dos boletos (R$ 953,34) + contas de consumo (água, luz, etc.) bata com exatidão tanto no formulário de lançamentos quanto no card do painel principal.
  - A função de auto-salvamento das despesas agora grava os totais consolidados no Firestore em tempo real.
