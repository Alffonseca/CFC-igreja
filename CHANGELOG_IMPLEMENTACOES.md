# Registro de Implementações - Sistema de Gestão de Igrejas

Este arquivo documenta as funcionalidades implementadas até o momento para facilitar a replicação deste sistema em novos projetos ou ambientes.

## 1. Gestão de Usuários e Permissões
- **Papéis (Roles):** Implementação dos níveis: `admin`, `pastor`, `secretaria`, `cell`, `membro`.
- **Controle de Acesso:**
  - **Admin:** Acesso total.
  - **Pastor:** Acesso a tudo, exceto usuários administradores e a "Zona de Perigo".
  - **Secretaria:** Acesso a Principal, Lançamentos Financeiros, Relatórios Financeiros, Mural, Chat e listagem de usuários (exceto administradores e pastores).
  - **Membro:** Acesso restrito ao Mural e Chat.
- **Status Online:** Indicador visual (bolinha verde para online, vermelha para offline) na listagem de usuários, visível para administradores.
- **Pesquisa de Usuários:** Campo de busca na tela de usuários para filtrar por nome ou nível de acesso.

## 2. Configurações e Interface
- **Zona de Perigo:** Visível e acessível apenas para administradores.
- **Upload de Logo:** Campos dedicados para Logo da Igreja e QR Code.
- **Backup e Restauração:** Seção dedicada nas configurações.

## 3. Como replicar este projeto
Ao iniciar um novo projeto no AI Studio, você pode usar este arquivo como roteiro. Basta pedir ao assistente:

> "Leia o arquivo CHANGELOG_IMPLEMENTACOES.md e aplique todas as funcionalidades listadas neste novo projeto, mantendo a estrutura de papéis e permissões."

---
*Este documento é um guia de referência para o desenvolvimento do sistema.*
