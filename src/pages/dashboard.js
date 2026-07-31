import { pct, timeString } from '../lib/format.js';
import { destroyRegionDetailMap, regionMapContainerId, renderRegionDetailMap } from './regionMap.js';

const trafficLabels = ['Livre', 'Moderado', 'Intenso'];

const regionPopulationEstimate = {
  centro: 296000,
  zs: 380000,
  gt: 250000,
  zn: 950000,
  ig: 210000,
  barra: 300000,
  bangu: 400000,
  cg: 700000,
};

export function renderDashboard(root, vm, navigate, openRegion, closeRegion) {
  window.__jarvisOpenRegion = openRegion;
  window.__jarvisCloseRegion = closeRegion;

  if (vm.standalone) {
    renderStandaloneRegion(root, vm);
    return;
  }

  const previousRailScroll = root.querySelector('.rail')?.scrollTop || 0;
  const previousGridScroll = root.querySelector('.grid')?.scrollTop || 0;

  root.innerHTML = `
    <div class="shell">
      ${topbar(vm, navigate)}
      <div class="main">
        <aside class="rail">
          <div class="risk-ring" style="background:${vm.cityRing}">
            <div class="risk-ring-inner">
              <div>
                <div class="risk-value">${vm.cityRisk}</div>
                <div class="section-title" style="margin:4px 0 0">RISCO DA CIDADE</div>
              </div>
            </div>
          </div>
          <div class="pill" style="${vm.cityStatusStyle};margin:12px auto 0;display:flex;width:max-content">
            <span class="dot"></span>${vm.cityStatus}
          </div>

          <div class="section">
            ${summaryRow('Ocorrencias ativas', vm.totalOcc)}
            ${summaryRow('Regioes em alerta', vm.alertCount)}
            ${summaryRow('Temperatura media', vm.avgTemp)}
            ${summaryRow('Pluviometros ativos', vm.rainStationsTotal || '-')}
            ${summaryRow('Sirenes online', `${vm.sirensOnline}/${vm.sirensTotal || '-'}`)}
          </div>

          <div class="section">
            <div class="section-title">Ocorrencias ativas</div>
            ${vm.activeOccurrences.length ? vm.activeOccurrences.slice(0, 7).map((occurrence) => `
              <div class="feed-row">
                <span style="min-width:0">
                  <strong style="display:block;color:#dbe3ee;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${occurrence.regionName}</strong>
                  <span style="color:${occurrence.severity === 2 ? '#ff9591' : '#f0c069'};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:block">${occurrence.title}</span>
                </span>
                <span class="mono" style="color:#4a5a70">${occurrence.source}</span>
              </div>
            `).join('') : '<div class="feed-row">Sem ocorrencias nas fontes conectadas</div>'}
          </div>

          <div class="section">
            <div class="section-title">Boletim COR</div>
            <div class="summary-row">
              <span>Estagio</span>
              <strong class="mono">${vm.corData.cityStage?.label?.replace('Estágio', 'Estagio') || '-'}</strong>
            </div>
            <div class="summary-row">
              <span>Nivel de calor</span>
              <strong class="mono">${vm.corData.heat ? `NC ${vm.corData.heat.level}` : '-'}</strong>
            </div>
            <div style="margin-top:10px;color:#9fb0c7;font-size:11.5px;line-height:1.45">
              ${vm.corData.forecastNow?.sinotico || 'Aguardando previsao oficial.'}
            </div>
          </div>

          <div class="section">
            <div class="section-title">Ranking de risco</div>
            ${vm.ranked.slice(0, 5).map((region, index) => `
              <div class="rank-row">
                <span class="mono" style="color:#3d4d63">${String(index + 1).padStart(2, '0')}</span>
                <span style="flex:1">${region.name}</span>
                <strong class="mono" style="color:${region.colors.text}">${region.score}</strong>
              </div>
            `).join('')}
          </div>

          <div class="section">
            <div class="section-title">Atividade recente</div>
            ${vm.eventLog.length ? vm.eventLog.map((event) => `
              <div class="feed-row">
                <span style="min-width:0">
                  <strong style="display:block;color:#dbe3ee;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${event.regionName}</strong>
                  <span style="color:#9fb0c7;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:block">${event.title}</span>
                </span>
                <span class="mono" style="color:#4a5a70">${timeString(new Date(event.startedAt)).slice(0, 5)}</span>
              </div>
            `).join('') : '<div class="feed-row">Aguardando eventos</div>'}
          </div>
        </aside>

        <section class="content">
          ${feedStrip(vm)}
          <div class="kpis">
            ${vm.kpis.map((kpi) => `
              <div class="kpi">
                <div class="kpi-label">${kpi.label}</div>
                <div class="kpi-value">${kpi.value}</div>
              </div>
            `).join('')}
          </div>
          <div class="grid">
            ${regionGrid(vm)}
          </div>
        </section>
      </div>
      <div class="ticker">${vm.ticker}</div>
    </div>
  `;

  const rail = root.querySelector('.rail');
  if (rail) rail.scrollTop = previousRailScroll;
  const grid = root.querySelector('.grid');
  if (grid) grid.scrollTop = previousGridScroll;

  root.onclick = (event) => {
    const target = event.target;
    const mapButton = target.closest?.('[data-route="map"]');
    if (mapButton) {
      navigate('map');
      return;
    }

    const openButton = target.closest?.('[data-open-region]');
    if (openButton) {
      event.preventDefault();
      const regionId = openButton.dataset.openRegion;
      window.open(buildStandaloneRegionUrl(regionId), `jarvis_region_${regionId}`, 'noopener');
      return;
    }

    const closeButton = target.closest?.('[data-close-region]');
    if (closeButton) {
      closeRegion();
      return;
    }

    if (target.classList?.contains('region-modal')) {
      closeRegion();
    }
  };

  if (vm.openRegionId) {
    const openRegion = vm.regions.find((region) => region.id === vm.openRegionId);
    if (openRegion) renderRegionDetailMap(openRegion, vm);
    else destroyRegionDetailMap();
  } else {
    destroyRegionDetailMap();
  }
}

function topbar(vm) {
  return `
    <header class="topbar">
      <div class="brand">
        <div class="logo">
          <img class="logo-image" src="/imagen/logo_prefeitura_rio_cor_transparente.png" alt="" width="60" height="60" decoding="sync" loading="eager" fetchpriority="high" onerror="this.parentElement.classList.add('logo-missing')" />
          <span class="logo-fallback">Prefeitura<br>do Rio</span>
        </div>
        <div>
          <div class="title">JARVIS COR</div>
          <div class="subtitle">Centro de Operacoes e Resiliencia</div>
        </div>
      </div>
      <div class="spacer"></div>
      <div style="text-align:right">
        <div class="section-title" style="margin:0">HORA LOCAL</div>
        <div class="mono" data-local-clock style="font-weight:700">${vm.time}</div>
      </div>
      ${vm.liveWeather ? '<div class="pill" style="color:#5fb8ff;background:rgba(74,157,255,.1);border-color:rgba(74,157,255,.3)"><span class="dot"></span>Open-Meteo</div>' : ''}
      ${vm.corLive ? '<div class="pill" style="color:#4fe8d3;background:rgba(23,201,181,.1);border-color:rgba(23,201,181,.3)"><span class="dot"></span>COR APIs</div>' : ''}
      ${vm.wazeLive ? '<div class="pill" style="color:#f0c069;background:rgba(221,162,60,.1);border-color:rgba(221,162,60,.3)"><span class="dot"></span>Waze</div>' : ''}
      <button class="pill" data-route="map" type="button">Mapa Operacional</button>
      <div class="pill" style="color:#4fe8d3;background:rgba(23,201,181,.1);border-color:rgba(23,201,181,.3)"><span class="dot"></span>${vm.feeds.filter((feed) => feed.ok).length}/${vm.feeds.length} APIs</div>
    </header>
  `;
}

function summaryRow(label, value) {
  return `<div class="summary-row"><span>${label}</span><strong class="mono">${value}</strong></div>`;
}

function regionGrid(vm) {
  return vm.regions.map((region) => `
    ${regionCard(region, vm)}
    ${vm.openRegionId === region.id ? regionInlineDetailHtml(region, vm) : ''}
  `).join('');
}

function renderStandaloneRegion(root, vm) {
  const region = vm.regions.find((item) => item.id === vm.openRegionId);

  if (!region) {
    destroyRegionDetailMap();
    root.innerHTML = `
      <div class="standalone-shell">
        <div class="standalone-empty">Regiao nao encontrada. Voce pode fechar esta aba.</div>
      </div>
    `;
    return;
  }

  root.innerHTML = `<div class="standalone-shell">${regionInlineDetailHtml(region, vm)}</div>`;

  root.onclick = (event) => {
    const closeButton = event.target.closest?.('[data-close-region]');
    if (closeButton) {
      window.close();
    }
  };

  renderRegionDetailMap(region, vm);
}

function buildStandaloneRegionUrl(regionId) {
  return `${location.origin}${location.pathname}?standalone=1#region-${regionId}`;
}

function regionCard(region, vm) {
  const ring = `conic-gradient(${region.colors.border} ${region.score}%, rgba(255,255,255,.08) 0)`;
  return `
    <article class="card" style="--accent:${region.colors.border}">
      <div class="card-head">
        <div style="min-width:0">
          <div class="ap">${region.ap}</div>
          <div class="region-name">${region.name}</div>
          <div class="communities">${region.communities.slice(0, 2).join(' | ')}</div>
        </div>
        <div class="mini-ring" style="background:${ring}">
          <span style="color:${region.colors.text}">${region.score}</span>
        </div>
      </div>

      ${miniRegionMap(region, vm)}

      <div class="stats">
        ${stat('TEMP', `${region.temp.toFixed(1)}C`)}
        ${stat('CHUVA', pct(region.rain))}
        ${stat('TRANS.', trafficLabels[region.trafficIdx])}
      </div>
      <div class="stats">
        ${stat('TRANSF.', `${region.transformersTotal - region.transformersDown}/${region.transformersTotal}`)}
        ${stat('OCORR.', region.occurrences)}
        ${stat('RISCO', `<span style="color:${region.colors.text}">${region.colors.label}</span>`)}
      </div>
      <div class="stats">
        ${stat('MM 1H', Number.isFinite(region.rainMmH01) ? region.rainMmH01.toFixed(1) : '-')}
        ${stat('MM 24H', Number.isFinite(region.rainMmH24) ? region.rainMmH24.toFixed(1) : '-')}
        ${stat('SIRENES', region.sirensTotal ? `${region.sirensOnline}/${region.sirensTotal}` : '-')}
      </div>
      <div class="stats">
        ${stat('WAZE 8+', region.wazeTrustedAlerts || '-')}
        ${stat('ACID.', region.wazeAccidents || '-')}
        ${stat('JAM', region.wazeMaxJamLevel || '-')}
      </div>
      <button class="region-open-btn" type="button" data-open-region="${region.id}">ABRIR</button>
    </article>
  `;
}

function regionInlineDetailHtml(region, vm) {
  const occurrences = (vm.activeOccurrences || []).filter((occurrence) => occurrence.regionId === region.id);
  const wazeAlerts = (vm.wazeData.trustedAlerts || []).filter((alert) => alert.regionId === region.id);
  const triggeredSirens = (vm.corData.sirens || []).filter((siren) => siren.regionId === region.id && siren.triggered);
  const regionEvents = (vm.eventLog || []).filter((event) => event.regionId === region.id);
  const powerLine = region.transformersDown > 0
    ? `${region.transformersDown} de ${region.transformersTotal} transformadores fora de operacao`
    : 'Nenhum transformador fora';
  const statusLabel = region.colors.label === 'NORMAL' ? 'Normal' : region.colors.label;
  const sirenLine = triggeredSirens.length ? `${triggeredSirens.length} sirene(s) acionada(s) na regiao.` : 'Sirenes de encosta operando normalmente.';
  const trafficLine = `Status <strong style="color:${region.colors.text}">${statusLabel.toUpperCase()}</strong> - transito ${trafficLabels[region.trafficIdx].toLowerCase()}, chuva regional em ${pct(region.rain)}. ${powerLine}. ${wazeAlerts.length ? `${wazeAlerts.length} alerta(s) Waze 8+ seguem em observacao.` : 'Nenhum alerta Waze 8+ ativo no momento.'} ${sirenLine}`;
  const teamsInField = Math.max(2, 2 + occurrences.length + (region.transformersDown > 0 ? 1 : 0) + (triggeredSirens.length > 0 ? 1 : 0));
  const camerasTotal = region.transformersTotal * 8;
  const camerasActive = Math.max(0, camerasTotal - triggeredSirens.length - region.transformersDown);
  const population = regionPopulationEstimate[region.id];
  const shift = new Date(vm.now).getHours() >= 7 && new Date(vm.now).getHours() < 19 ? 'Turno A' : 'Turno B';
  return `
    <section class="region-inline-detail" id="${regionPanelId(region)}" style="--accent:${region.colors.border}">
      <button class="pill region-inline-close" type="button" data-close-region>FECHAR</button>
      <div class="region-inline-map" id="${regionMapContainerId(region)}"></div>
      <div class="region-inline-summary">
        <div class="region-detail-kpis inline">
          ${detailKpi('Risco', region.score)}
          ${detailKpi('Ocorrencias', occurrences.length)}
          ${detailKpi('Waze 8+', wazeAlerts.length)}
          ${detailKpi('Sirenes acionadas', triggeredSirens.length)}
          ${detailKpi('Chuva', pct(region.rain))}
          ${detailKpi('Transito', trafficLabels[region.trafficIdx])}
        </div>
        <div class="region-detail-layout">
          <div class="detail-box detail-box-main">
            <div class="section-title">Leitura operacional</div>
            <div class="region-detail-summary">${trafficLine}</div>
            <div class="section-title" style="margin-top:18px">Tendencia de risco - 7 dias</div>
            ${riskTrend(region)}
          </div>
          <div class="detail-box">
            <div class="section-title">Linha do tempo</div>
            ${detailTimeline(regionEvents, occurrences, wazeAlerts)}
          </div>
        </div>
        <div class="region-detail-grid inline cols-2">
          <div class="detail-box detail-box-list">
            <div class="section-title">Bairros, vias e pontos criticos</div>
            ${wazeAlerts.length ? wazeAlerts.slice(0, 6).map((alert) => detailLine(alert.street || 'Via sem nome', `${alert.type} | ${alert.trust} votos Waze`, alert.type === 'ACCIDENT' ? 2 : 1)).join('') : '<div class="detail-empty">Sem via Waze 8+ nessa regiao.</div>'}
          </div>
          <div class="detail-box detail-box-list">
            <div class="section-title">Infraestrutura e acao</div>
            ${detailInfraAction(region, powerLine, triggeredSirens, wazeAlerts, occurrences)}
          </div>
        </div>
        <div class="region-detail-grid inline cols-4">
          <div class="detail-box"><div class="section-title">Equipes em campo</div><div class="footstat">${teamsInField}</div></div>
          <div class="detail-box"><div class="section-title">Cameras ativas</div><div class="footstat">${camerasActive}<small>/${camerasTotal}</small></div></div>
          <div class="detail-box"><div class="section-title">Populacao estimada</div><div class="footstat">${Math.round(population / 1000)}k</div></div>
          <div class="detail-box"><div class="section-title">Plantao responsavel</div><div class="footstat footstat-text">COR-Rio - ${shift}</div></div>
        </div>
        <div class="region-detail-footer">Fontes: Waze, COR-Rio, Rede de Sirenes, OpenStreetMap, Alerta Rio - Atualizado as ${vm.time}</div>
      </div>
    </section>
  `;
}

function regionPanelId(region) {
  return `painel-${region.id}`;
}

function regionDetailHtml(region, vm) {
  if (!region) return '';
  const occurrences = (vm.activeOccurrences || []).filter((occurrence) => occurrence.regionId === region.id);
  const wazeAlerts = (vm.wazeData.trustedAlerts || []).filter((alert) => alert.regionId === region.id);
  const rainStations = (vm.corData.rainStations || []).filter((station) => station.regionId === region.id);
  const offlineSirens = (vm.corData.sirens || []).filter((siren) => siren.regionId === region.id && !siren.online);
  const statusLabel = region.colors.label === 'NORMAL' ? 'STATUS NORMAL' : `STATUS ${region.colors.label}`;
  const powerLine = region.transformersDown > 0
    ? `${region.transformersDown} de ${region.transformersTotal} transformadores fora de operacao`
    : 'Sem transformador fora no dado atual';
  const trafficLine = `Transito ${trafficLabels[region.trafficIdx].toLowerCase()}, chuva regional em ${pct(region.rain)}. ${powerLine}.`;
  const mapUrl = osmEmbedUrl(region);

  return `
    <div class="region-modal">
      <section class="region-detail">
        <div class="region-detail-head">
          <div>
            <div class="ap">${region.ap} · ${region.name.toUpperCase()}</div>
            <div class="region-detail-title">${region.name}</div>
            <div class="popup-sub">${region.communities.join(' | ')}</div>
          </div>
          <div class="detail-status" style="color:${region.colors.text};border-color:${region.colors.border}55;background:${region.colors.bg}">${statusLabel}</div>
          <a class="pill" href="#dashboard" data-close-region onclick="window.__jarvisCloseRegion && window.__jarvisCloseRegion()">Fechar</a>
        </div>

        <div class="region-detail-map">
          <iframe
            title="Mapa de ${region.name}"
            src="${mapUrl}"
            loading="lazy"
            referrerpolicy="no-referrer-when-downgrade"
          ></iframe>
        </div>

        <div class="region-detail-kpis">
          ${detailKpi('Risco', region.score)}
          ${detailKpi('Ocorr.', occurrences.length)}
          ${detailKpi('Waze 8+', wazeAlerts.length)}
          ${detailKpi('Sirenes off', offlineSirens.length)}
        </div>

        <div class="region-detail-summary">${trafficLine}</div>

        <div class="region-detail-grid">
          <div class="detail-box">
            <div class="section-title">Ocorrencias</div>
            ${occurrences.length ? occurrences.map((occurrence) => detailLine(occurrence.title, occurrence.lines?.[0] || occurrence.source, occurrence.severity)).join('') : '<div class="detail-empty">Sem ocorrencias derivadas das fontes conectadas.</div>'}
          </div>
          <div class="detail-box">
            <div class="section-title">Vias</div>
            ${wazeAlerts.length ? wazeAlerts.slice(0, 7).map((alert) => detailLine(alert.street || 'Via sem nome', `${alert.type} | ${alert.trust} votos Waze`, alert.type === 'ACCIDENT' ? 2 : 1)).join('') : '<div class="detail-empty">Sem via Waze 8+ nessa regiao.</div>'}
          </div>
          <div class="detail-box">
            <div class="section-title">Sensores e rede</div>
            ${rainStations.slice(0, 5).map((station) => detailLine(station.name || 'Pluviometro', `${num(station.h01)} mm em 1h | ${num(station.h24)} mm em 24h`, station.h01 >= 10 || station.h24 >= 50 ? 2 : 0)).join('')}
            ${offlineSirens.slice(0, 5).map((siren) => detailLine(siren.name || 'Sirene', 'offline/desativada', 2)).join('')}
            ${region.transformersDown > 0 ? detailLine('Transformadores', powerLine, region.transformersDown >= 3 ? 2 : 1) : ''}
            ${(!rainStations.length && !offlineSirens.length && region.transformersDown <= 0) ? '<div class="detail-empty">Sem sensor/rede em alerta nessa regiao.</div>' : ''}
          </div>
        </div>
      </section>
    </div>
  `;
}

function osmEmbedUrl(region) {
  const deltaLat = 0.035;
  const deltaLng = 0.055;
  const left = (region.lng - deltaLng).toFixed(6);
  const right = (region.lng + deltaLng).toFixed(6);
  const bottom = (region.lat - deltaLat).toFixed(6);
  const top = (region.lat + deltaLat).toFixed(6);
  const marker = `${region.lat.toFixed(6)},${region.lng.toFixed(6)}`;
  return `https://www.openstreetmap.org/export/embed.html?bbox=${left}%2C${bottom}%2C${right}%2C${top}&layer=mapnik&marker=${marker}`;
}

function detailKpi(label, value) {
  return `<div class="detail-kpi"><span>${label}</span><strong>${value}</strong></div>`;
}

function detailLine(title, text, severity = 0) {
  const color = severity === 2 ? '#ff9591' : severity === 1 ? '#f0c069' : '#9fb0c7';
  return `<div class="detail-line"><span style="background:${color}"></span><div><strong>${title}</strong><small>${text}</small></div></div>`;
}

function riskTrend(region) {
  const values = [-2, -1, -1, 0, 1, 0, 2].map((offset, index) => {
    const value = Math.max(8, Math.min(100, region.score + (offset * 7) + (index % 2 ? 5 : 0)));
    return { label: ['SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SAB', 'HOJE'][index], value };
  });
  return `
    <div class="risk-trend">
      ${values.map((item, index) => `
        <div class="risk-trend-item">
          <span style="height:${item.value}%${index === values.length - 1 ? ';background:var(--accent)' : ''}"></span>
          <small>${item.label}</small>
        </div>
      `).join('')}
    </div>
  `;
}

function detailTimeline(events, occurrences, wazeAlerts) {
  const items = [
    ...events.slice(0, 2).map((event) => ({
      time: timeString(new Date(event.startedAt)).slice(0, 5),
      title: event.title,
    })),
    ...occurrences.slice(0, 1).map((occurrence) => ({ time: 'Agora', title: occurrence.title })),
    ...wazeAlerts.slice(0, 1).map((alert) => ({ time: 'Waze', title: alert.street || 'Via em observacao' })),
  ].slice(0, 4);

  return items.length
    ? items.map((item) => `<div class="timeline-row"><strong>${item.time}</strong><span>${item.title}</span></div>`).join('')
    : '<div class="detail-empty">Sem atualizacao recente para esta regiao.</div>';
}

function detailInfraAction(region, powerLine, triggeredSirens, wazeAlerts, occurrences) {
  const rows = [
    `<div class="infra-row"><span>Sirenes de encosta</span><strong>${triggeredSirens.length ? `${triggeredSirens.length} ACIONADA(S)` : 'NENHUMA ACIONADA'}</strong></div>`,
    `<div class="infra-row"><span>Transformadores</span><strong>${region.transformersDown > 0 ? powerLine.toUpperCase() : 'NENHUM FORA'}</strong></div>`,
  ];
  if (wazeAlerts.length) rows.push(`<div class="infra-row"><span>Monitorar ${wazeAlerts[0].street || region.name}</span><strong>30 MIN</strong></div>`);
  if (occurrences.length) rows.push(`<div class="infra-row"><span>Acompanhar ocorrencias</span><strong>${occurrences.length} ATIVA(S)</strong></div>`);
  return rows.join('');
}

function miniRegionMap(region, vm) {
  const tiles = miniMapTiles(region.lat, region.lng, 13);
  const points = operationalMapPoints(region, vm, 13);
  const totalPoints = points.length;
  const wazeCount = points.filter((point) => point.kind === 'waze').length;
  const rainCount = points.filter((point) => point.kind === 'rain').length;
  const sirenCount = points.filter((point) => point.kind === 'siren').length;
  const powerCount = points.filter((point) => point.kind === 'power').length;
  return `
    <div class="card-map real-map">
      <div class="card-map-tiles" aria-label="Mapa real de ${region.name}">
        ${tiles.map((tile) => `
          <img
            src="https://tile.openstreetmap.org/${tile.z}/${tile.x}/${tile.y}.png"
            alt=""
            loading="lazy"
            style="left:${tile.left}px;top:${tile.top}px"
          />
        `).join('')}
        ${points.map((point) => `
          <span
            class="card-op-point ${point.kind} ${point.level}"
            title="${point.label}"
            style="left:${point.left}px;top:${point.top}px"
          ></span>
        `).join('')}
        ${totalPoints ? '' : '<div class="card-map-empty">sem ponto ativo</div>'}
        <div class="card-map-attribution">OSM</div>
      </div>
      <div class="card-map-info">
        <span class="ap">PONTOS REAIS</span>
        <strong>${totalPoints || 'Sem ativos'}</strong>
        <small>W:${wazeCount} P:${rainCount} S:${sirenCount} T:${powerCount}</small>
      </div>
    </div>
  `;
}

function operationalMapPoints(region, vm, zoom, containerW = 140, containerH = 92, tileSize = 128, project = true) {
  const items = [];
  const rainStations = (vm.corData.rainStations || []).filter((station) => station.regionId === region.id);
  const sirens = (vm.corData.sirens || []).filter((siren) => siren.regionId === region.id);
  const wazeAlerts = (vm.wazeData.trustedAlerts || []).filter((alert) => alert.regionId === region.id);
  const transformersDown = region.transformersDown || 0;

  rainStations.forEach((station) => {
    const h01 = Number.isFinite(station.h01) ? station.h01 : 0;
    const h24 = Number.isFinite(station.h24) ? station.h24 : 0;
    items.push({
      lat: station.lat,
      lng: station.lng,
      kind: 'rain',
      level: h01 >= 10 || h24 >= 50 ? 'critical' : h01 >= 3 || h24 >= 20 ? 'attention' : 'normal',
      label: `${station.name || 'Pluviometro'} - ${h01.toFixed(1)} mm/h`,
    });
  });

  sirens.filter((siren) => siren.triggered).forEach((siren) => {
    items.push({
      lat: siren.lat,
      lng: siren.lng,
      kind: 'siren',
      level: 'critical',
      label: `${siren.name || 'Sirene'} - acionada`,
    });
  });

  if (transformersDown > 0) {
    items.push({
      lat: region.lat,
      lng: region.lng,
      kind: 'power',
      level: transformersDown >= 3 ? 'critical' : 'attention',
      label: `${transformersDown} transformador(es) fora`,
    });
  }

  wazeAlerts.forEach((alert) => {
    items.push({
      lat: alert.lat,
      lng: alert.lng,
      kind: 'waze',
      level: alert.type === 'ACCIDENT' ? 'critical' : 'attention',
      label: `${alert.type} - ${alert.street || 'via sem nome'} - ${alert.trust} votos`,
    });
  });

  if (!project) return items.slice(0, 80);
  return items
    .map((point) => ({ ...point, ...projectPoint(region, point.lat, point.lng, zoom, containerW, containerH, tileSize) }))
    .filter((point) => point.left >= -8 && point.left <= containerW + 8 && point.top >= -8 && point.top <= containerH + 8)
    .slice(0, 28);
}

function projectPoint(region, lat, lng, zoom, containerW = 140, containerH = 92, tileSize = 128) {
  const center = latLngToTile(region.lat, region.lng, zoom);
  const point = latLngToTile(lat, lng, zoom);
  return {
    left: Math.round((point.x - center.x) * tileSize + containerW / 2),
    top: Math.round((point.y - center.y) * tileSize + containerH / 2),
  };
}

function miniMapTiles(lat, lng, zoom) {
  return mapTiles(lat, lng, zoom, 140, 92, 128);
}

function mapTiles(lat, lng, zoom, containerW, containerH, tileSize) {
  const projected = latLngToTile(lat, lng, zoom);
  const centerX = Math.floor(projected.x);
  const centerY = Math.floor(projected.y);
  const tiles = [];

  for (let dx = -1; dx <= 1; dx += 1) {
    for (let dy = -1; dy <= 1; dy += 1) {
      tiles.push({
        z: zoom,
        x: centerX + dx,
        y: centerY + dy,
        left: Math.round((centerX + dx - projected.x) * tileSize + containerW / 2),
        top: Math.round((centerY + dy - projected.y) * tileSize + containerH / 2),
      });
    }
  }

  return tiles;
}

function latLngToTile(lat, lng, zoom) {
  const latRad = lat * Math.PI / 180;
  const scale = 2 ** zoom;
  return {
    x: (lng + 180) / 360 * scale,
    y: (1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * scale,
  };
}

function stat(label, value) {
  return `<div><div class="stat-label">${label}</div><div class="stat-value">${value}</div></div>`;
}

function feedStrip(vm) {
  return `
    <div class="status-strip">
      <div class="feed-chip" style="color:#4a5a70;font-weight:800">FONTES DE DADOS</div>
      ${vm.feeds.map((feed) => `
        <div class="feed-chip">
          <span class="dot" style="color:${feed.ok ? '#4fe8d3' : '#ff6b6b'}"></span>
          <span>${feed.name}</span>
          <span class="mono" style="color:#4a5a70">${feed.latency}</span>
        </div>
      `).join('')}
    </div>
  `;
}
