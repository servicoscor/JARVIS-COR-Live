# Deploy JARVIS COR

Fluxo recomendado:

1. A maquina de desenvolvimento publica no GitHub.
2. O servidor `10.50.30.161` puxa do GitHub.
3. O servidor roda `npm ci`, `npm run build` e reinicia `server.js`.

## Publicar daqui para o GitHub

```powershell
.\scripts\publish-github.ps1 -Message "Atualiza painel operacional"
```

## Primeira instalacao no servidor

No servidor `10.50.30.161`:

```powershell
cd C:\
git clone https://github.com/servicoscor/JARVIS-COR-Live.git
cd C:\JARVIS-COR-Live
npm install
npm run build
$env:HOST="0.0.0.0"
$env:PORT="4173"
npm start
```

Libere a porta se outra maquina precisar acessar:

```powershell
New-NetFirewallRule -DisplayName "JARVIS COR 4173" -Direction Inbound -Action Allow -Protocol TCP -LocalPort 4173
```

URL:

```text
http://10.50.30.161:4173/
```

## Atualizar manualmente no servidor

```powershell
C:\JARVIS-COR-Live\scripts\server-pull-deploy.ps1 -RepoPath C:\JARVIS-COR-Live -Branch main -Port 4173
```

## Deixar puxando automaticamente

Para deixar o servidor verificando o GitHub a cada 60 segundos:

```powershell
C:\JARVIS-COR-Live\scripts\server-watch-git.ps1 -RepoPath C:\JARVIS-COR-Live -Branch main -Port 4173 -IntervalSeconds 60
```

Se preferir algo mais controlado, crie uma tarefa no Agendador do Windows chamando `server-pull-deploy.ps1` a cada 1 minuto.
