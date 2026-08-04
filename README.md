# JARVIS COR Live

Painel operacional web para monitoramento de risco urbano do Rio de Janeiro, uso interno do COR (Centro de Operações e Resiliência). Este documento descreve o estado técnico atual de cada parte do sistema.

---

## 1. Arquitetura geral

Aplicação client-side (SPA) construída em **Vite + JavaScript puro**, sem framework (sem React/Vue). Toda a renderização é feita via strings de template HTML injetadas com `innerHTML`, sem virtual DOM. O estado vive em um objeto único (`state`) dentro de `src/main.js`, e cada mudança relevante dispara uma reconstrução completa do HTML da tela ativa.

Por trás, um servidor **Node.js puro** (`server.js`, sem Express) cumpre dois papéis:
- Serve os arquivos estáticos gerados pelo build (`dist/`) e as imagens (`imagen/`).
- Atua como **proxy** para as APIs externas (contorna CORS e evita expor as chamadas diretamente do navegador) e agora também como **backend de persistência** (histórico de risco).

Não há framework de backend, ORM ou banco de dados relacional — a única persistência é um arquivo `data/risk-history.jsonl` (append-only).

---

## 2. Stack e dependências

- **Build**: Vite 7
- **Runtime do servidor**: Node.js (produção rodando em v18.19.1 — abaixo do recomendado pelo Vite, que pede 20.19+ ou 22.12+; build ainda funciona, mas é uma atualização pendente)
- **Mapas**: Leaflet 1.9.4 (via CDN, `unpkg.com`), tiles do OpenStreetMap
- **Fontes**: Inter + IBM Plex Mono (Google Fonts)
- **Dependências npm**: nenhuma em produção (`dependencies: {}`); apenas `vite` como devDependency
- **Sem framework de testes** instalado no projeto

---

## 3. Fontes de dados (integrações reais)

Todas via proxy do `server.js`, sob `/api/*`:

| Rota | Origem | Frequência de atualização no cliente |
|---|---|---|
| `/api/sirenes` | `websirene.rio.rj.gov.br` (XML) | 2 min |
| `/api/estagio-cidade` | `appcor.cor-rio.work` | 2 min |
| `/api/calor` | `appcor.cor-rio.work` | 2 min |
| `/api/pluviometricos` | `websempre.rio.rj.gov.br` (JSON) | 2 min |
| `/api/previsao-estendida` | `sistema-alerta-rio.com.br` (XML) | 2 min |
| `/api/previsao-agora` | `sistema-alerta-rio.com.br` (XML) | 2 min |
| `/api/waze-tvt` | Waze Partner Hub | 1 min |
| Open-Meteo | Direto do navegador (não passa pelo proxy) | 5 min |
| RainViewer | Direto do navegador, usado só no mapa operacional | — |

**Novo:** `/api/history` (implementado nesta rodada) — não é uma fonte externa, é o endpoint interno de persistência (ver seção 7).

Cada uma dessas fontes tem parsing e normalização dedicados em `src/lib/providers/corApis.js` (sirenes, estágio, calor, pluviômetros, previsão) e `src/lib/providers/waze.js` (trânsito/acidentes). Falhas de qualquer fonte são isoladas — uma API fora do ar não derruba as outras, e o indicador de status (feed strip) reflete isso individualmente.

---

## 4. Regiões e geografia

- `src/data/regions.js`: seed de **5 regiões operacionais** — Centro (AP1), Zona Sul (AP2), Grande Tijuca (AP2), Zona Norte (AP3, incorpora Ilha do Governador) e Zona Oeste (AP4/AP5, incorpora Barra da Tijuca, Bangu e Campo Grande). Cada região tem centro geográfico (lat/lng), comunidades associadas e contadores estáticos de transformadores (total/fora).
- `src/data/bairros.js`: mapeamento **bairro → região operacional** (usado pelo mapa geral e pela associação de sirenes/estações por proximidade).
- Associação de sirenes, pluviômetros e alertas de trânsito às regiões é feita por **distância geográfica** (`nearestRegionId`), não por nome — робusto a qualquer reagrupamento futuro de regiões.

---

## 5. Cálculo de risco

`src/lib/risk.js` concentra toda a lógica:
- `computeSeverity(region)`: retorna 0 (normal), 1 (atenção) ou 2 (crítico), a partir de chuva, ocorrências, trânsito, energia, vandalismo e transformadores.
- `riskScore(region)`: score numérico 0–100 usado nos anéis visuais e ranking.
- Todas as entradas passam por `safeNum()` (`src/lib/format.js`) — nenhum campo `NaN`/`undefined` vindo de uma API externa consegue mais contaminar o cálculo (bug real corrigido nesta rodada).

---

## 6. Ocorrências operacionais

`src/lib/occurrences.js` deriva ocorrências automaticamente (nunca há input manual) a partir de:
- Chuva acima de limiares (mm/h e mm/24h) → `PLU-ATN` / `PLU-CRIT`
- Sirene **acionada** (campo `status` real da API, não o campo `online` de conectividade) → `SIR-ACIONADA`
- Transformadores fora de operação → `ENE-ATN` / `ENE-CRIT`
- Alertas de trânsito/acidente do Waze com **mais de 7 votos de confirmação** → `WAZ-ACC` / `WAZ-TRF`

Cada ocorrência carrega região, severidade, título e linhas de detalhe, usadas no dashboard, no mapa e no ticker.

---

## 7. Persistência (novo)

Antes desta rodada, **nada era salvo** — todo o sistema operava só com o estado do momento. Agora:

- `POST /api/history`: recebe um snapshot `{ ts, regions: { <id>: { score, severity, ... } } }` e grava uma linha em `data/risk-history.jsonl`.
- `GET /api/history?days=N`: agrega por dia (fuso America/São_Paulo) e devolve score médio/máximo por região para os últimos N dias (máx. 30).
- Cliente (`src/main.js`) grava um snapshot a cada 10 min e busca o histórico a cada 10 min.
- O gráfico "Tendência de risco · 7 dias" no painel de região (`riskTrend()` em `src/pages/dashboard.js`) consome esse histórico real. Dias sem dado suficiente aparecem com uma **barra tracejada** — o sistema não inventa valor histórico.
- Arquivo com retenção simples (poda automática acima de 25 mil linhas); ignorado pelo Git (`data/` no `.gitignore`), pois é dado de runtime, não código.

**Limitação atual**: histórico começa vazio a cada novo ambiente/deploy que apague o arquivo; não há backup automático desse arquivo.

---

## 8. Alertas ativos (novo)

Antes: o painel era inteiramente passivo. Agora:

- `src/lib/alerts.js`: toca um som curto (Web Audio API, sem dependência de arquivo de áudio) quando uma ocorrência **crítica nova** é detectada. Preferência liga/desliga persistida em `localStorage`.
- `src/main.js` (`detectNewCriticalOccurrences`): compara ocorrências críticas do ciclo atual contra as já vistas — só alerta uma vez por ocorrência (não repete a cada re-render).
- Toast visual no canto superior direito do dashboard, auto-dispensado em 12s.
- **Limitação**: por política de autoplay dos navegadores, o som só funciona depois de um clique inicial no botão "Ativar alertas sonoros".

---

## 9. Frontend — páginas

### Dashboard principal (`src/pages/dashboard.js`)
- Grid fixo de 5 colunas (uma por região), sem necessidade de rolagem geral da página em telas de desktop.
- Cada card tem mini-mapa (mosaico de tiles OSM, 140×92px) com pontos reais de chuva/sirene/transformador/Waze.
- Barra lateral com resumo da cidade, ocorrências ativas e boletim COR.
- Botão **ABRIR** abre o painel de detalhe da região em **aba separada do navegador** (não mais inline).

### Painel de detalhe de região
- Mapa Leaflet dedicado (`src/pages/regionMap.js`) com marcadores reais (sirene acionada, Waze 8+, transformador fora, ocorrência) e **tour automático** (visão geral por 10s, depois visita cada ponto ativo).
- Layout sem scroll geral — cada bloco de conteúdo tem overflow próprio.
- KPIs, leitura operacional (texto gerado dinamicamente), tendência de risco real, linha do tempo, infraestrutura e ação, bairros/vias críticos.
- Blocos "Equipes em campo", "População estimada" e "Plantão responsável" **não têm fonte real** (ver seção 11) — "Plantão" é o único parcialmente real (turno calculado pelo horário atual).

### Mapa Operacional (`src/pages/map.js`)
- Mapa geral da cidade com bairros via GeoJSON, camadas independentes: radar de chuva (RainViewer), pluviômetros, sirenes acionadas, transformadores, Waze 8+, ocorrências.

---

## 10. Roteamento

Sem biblioteca de rotas — controlado manualmente via `location.hash`:
- `#dashboard` (padrão) / `#map` → alterna entre dashboard e mapa operacional.
- `#region-<id>` → abre o painel inline daquela região (comportamento legado, ainda funcional mas não mais acionado pela UI).
- `?standalone=1#region-<id>` → aba dedicada de região (fluxo atual do botão ABRIR), com atualização contínua de dados.

---

## 11. Pendências conhecidas (sem fonte de dado real)

| Item | Status |
|---|---|
| Câmeras ativas | Removido do painel — sem API de CFTV integrada |
| Equipes em campo | Valor derivado (fórmula local), não vem de sistema de despacho real |
| População estimada | Valor fixo por região, sem integração com censo/IBGE |
| Plantão responsável | Turno (A/B) calculado a partir do horário real — parcialmente real |
| Risco por bairro | Removido — não existe cálculo de risco no nível de bairro, só por região |

---

## 12. Débito técnico / recomendações

- **Sem testes automatizados** — `risk.js` e `occurrences.js` são lógica pura e seriam os primeiros candidatos (já foram a origem de 2 bugs reais nesta rodada: `NaN` no risco e race condition entre clima/COR).
- **Sem README anterior** — este documento supre essa lacuna.
- Dois arquivos de protótipo antigos na raiz do repositório (`Jarvis Rio Map.html`, `Jarvis Rio.dc.html`) não são usados pelo build atual — candidatos a remoção.
- Node 18 em produção — atualização para 20+/22+ recomendada pelo próprio Vite.
- Renderização via `innerHTML` completo a cada ciclo funciona bem na escala atual (5 regiões), mas não escalaria indefinidamente sem uma estratégia de diff.
- Sem controle de acesso/autenticação identificado — assume-se proteção apenas por estar na rede interna.

---

## 13. Deploy

```bash
# No servidor (10.50.30.161)
cd /var/www/html/JARVIS-COR-Live
git pull origin main
npm ci
npm run build
sudo systemctl restart jarvis-cor
```

Verificação:
```bash
sudo systemctl status jarvis-cor --no-pager --lines=20
curl -I http://127.0.0.1:4173/
```

Serviço gerenciado via `systemd` (`deploy/jarvis-cor.service`). Deploy manual via `git pull` — sem CI/CD automatizado.
