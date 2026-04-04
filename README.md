# DevedorApp — VW Finanças

Controle de devedores e finanças pessoais com Open Finance integrado.

**Live:** [https://vhu-code.github.io/devedorapp](https://vhu-code.github.io/devedorapp)

## Funcionalidades

- **Devedores** — cadastro, pagamentos parciais/totais, contínuos, lembretes
- **Open Finance (Pluggy)** — conexão real com bancos (Nubank, Inter, etc.) via widget oficial
- **Finanças** — dashboard com patrimônio, gráficos por categoria, resumo mensal
- **Transações** — entradas/saídas com categorias e vinculação a bancos
- **Cobrança** — geração de mensagens (WhatsApp) com múltiplos tons
- **Sync automático** — GitHub Action sincroniza bancos a cada 6h

## Estrutura

```
devedorapp/
├── index.html                          # App completo (single-file)
├── manifest.json                       # PWA manifest
├── sw.js                               # Service Worker
├── icon-192.png                        # Ícone PWA
├── icon-512.png                        # Ícone PWA
├── .github/
│   └── workflows/
│       └── pluggy-sync.yml             # GitHub Action — sync Pluggy a cada 6h
└── sync/
    ├── pluggy-sync.js                  # Script Node.js de sincronização
    ├── package.json                    # Dependências (firebase-admin, node-fetch)
    └── package-lock.json               # Lock file
```

## Stack

- **Frontend:** HTML/CSS/JS (single-file), Chart.js
- **Backend:** Firebase Firestore (realtime sync)
- **Auth:** Google Sign-In (Firebase Auth)
- **Open Finance:** Pluggy API + Pluggy Connect Widget
- **CI/CD:** GitHub Actions (sync automático a cada 6h)
- **Hospedagem:** GitHub Pages

## Firebase

- **Projeto:** `meus-gastos-9d631`
- **Coleção:** `devedorapp/{uid}/`
  - `devedores` — cadastro de devedores
  - `bancos` — contas bancárias (dados da Pluggy)
  - `pluggy_items` — conexões Open Finance ativas
  - `lembretes` — lembretes de cobrança
  - `historico` — log de atividades
  - `config/financas` — transações, categorias, contas

## GitHub Secrets

| Secret | Uso |
|--------|-----|
| `PLUGGY_CLIENT_ID` | Autenticação na API Pluggy |
| `PLUGGY_CLIENT_SECRET` | Autenticação na API Pluggy |
| `FIREBASE_SERVICE_ACCOUNT` | Firebase Admin SDK para GitHub Action |

---

*VW Informática — Xique-Xique/BA*
