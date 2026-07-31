import { computeSeverity } from './risk.js';
import { trafficStatsByRegion } from './providers/waze.js';

export function deriveOperationalOccurrences(regions, corData, wazeData = null) {
  const now = Date.now();
  const occurrences = [];
  const trafficByRegion = trafficStatsByRegion(wazeData);

  regions.forEach((region) => {
    const h01 = Number.isFinite(region.rainMmH01) ? region.rainMmH01 : 0;
    const h03 = Number.isFinite(region.rainMmH03) ? region.rainMmH03 : 0;
    const h24 = Number.isFinite(region.rainMmH24) ? region.rainMmH24 : 0;

    if (h01 >= 8 || h03 >= 18 || h24 >= 55) {
      occurrences.push(makeOccurrence(now, region, 'PLU-CRIT', 2, 'Chuva forte monitorada', [
        `${h01.toFixed(1)} mm na ultima hora, ${h03.toFixed(1)} mm em 3h`,
        `${h24.toFixed(1)} mm acumulados em 24h`,
        'Priorizar checagem de bolsao, drenagem e encostas',
      ]));
    } else if (h01 >= 2 || h03 >= 8 || h24 >= 25) {
      occurrences.push(makeOccurrence(now, region, 'PLU-ATN', 1, 'Chuva em acompanhamento', [
        `${h01.toFixed(1)} mm na ultima hora`,
        `${h24.toFixed(1)} mm acumulados em 24h`,
        'Manter monitoramento dos pluviometros da regiao',
      ]));
    }

    if (region.transformersDown >= 3) {
      occurrences.push(makeOccurrence(now, region, 'ENE-CRIT', 2, 'Transformadores criticos', [
        `${region.transformersDown} de ${region.transformersTotal} transformadores fora`,
        'Impacto potencial em comunidades e equipamentos urbanos',
        'Concessionaria deve ser acionada',
      ]));
    } else if (region.transformersDown > 0) {
      occurrences.push(makeOccurrence(now, region, 'ENE-ATN', 1, 'Transformador em falha', [
        `${region.transformersDown} transformador(es) fora de operacao`,
        'Monitorar reincidencia e area afetada',
        'Sem classificacao automatica de falta generalizada',
      ]));
    }

    if ((corData.heat?.level || 0) >= 3 && region.temp >= 32) {
      occurrences.push(makeOccurrence(now, region, 'CAL-03', 1, 'Calor em nivel operacional', [
        `Nivel de calor ${corData.heat.level} informado pelo COR`,
        `${region.temp.toFixed(1)}C estimados na regiao`,
        'Acompanhar pontos de maior vulnerabilidade',
      ]));
    }

    const traffic = trafficByRegion.get(region.id);
    if (traffic?.accidents) {
      occurrences.push(makeOccurrence(now, region, 'WAZ-ACC', 2, 'Acidente Waze confirmado', [
        `${traffic.accidents} acidente(s) com mais de 7 votos positivos`,
        `${traffic.trustedAlerts} alerta(s) confiaveis de transito na regiao`,
        `Maior confianca Waze: ${traffic.maxTrust}`,
      ]));
    } else if (traffic?.trustedAlerts) {
      occurrences.push(makeOccurrence(now, region, 'WAZ-TRF', traffic.maxJamLevel >= 4 ? 2 : 1, 'Transito Waze em atencao', [
        `${traffic.trustedAlerts} alerta(s) de transito com mais de 7 votos positivos`,
        `Maior nivel de lentidao observado: ${traffic.maxJamLevel || '-'}`,
        `Maior confianca Waze: ${traffic.maxTrust}`,
      ]));
    }
  });

  return occurrences.sort((a, b) => b.severity - a.severity || b.startedAt - a.startedAt);
}

export function applyOperationalOccurrences(regions, occurrences, wazeData = null) {
  const byRegion = new Map();
  const trafficByRegion = trafficStatsByRegion(wazeData);
  occurrences.forEach((occurrence) => {
    const list = byRegion.get(occurrence.regionId) || [];
    list.push(occurrence);
    byRegion.set(occurrence.regionId, list);
  });

  return regions.map((region) => {
    const list = byRegion.get(region.id) || [];
    const traffic = trafficByRegion.get(region.id);
    return {
      ...region,
      occurrences: list.length,
      trafficIdx: deriveTrafficImpact(region, traffic),
      wazeTrustedAlerts: traffic?.trustedAlerts || 0,
      wazeAccidents: traffic?.accidents || 0,
      wazeMaxTrust: traffic?.maxTrust || 0,
      wazeMaxJamLevel: traffic?.maxJamLevel || 0,
      operationalOccurrences: list,
      operationalSeverity: list.reduce((max, occurrence) => Math.max(max, occurrence.severity), computeSeverity(region)),
    };
  });
}

function makeOccurrence(now, region, type, severity, title, lines) {
  return {
    id: `${type}-${region.id}`,
    type,
    severity,
    title,
    lines,
    regionId: region.id,
    regionName: region.name,
    ap: region.ap,
    source: sourceForType(type),
    startedAt: now,
  };
}

function sourceForType(type) {
  if (type.startsWith('WAZ')) return 'Waze';
  if (type.startsWith('PLU')) return 'Pluviometros';
  if (type.startsWith('SIR')) return 'Sirenes COR';
  if (type.startsWith('CAL')) return 'Calor COR';
  if (type.startsWith('ENE')) return 'Operacional Energia';
  return 'JARVIS';
}

function deriveTrafficImpact(region, traffic) {
  if (traffic?.accidents > 0 || traffic?.maxJamLevel >= 4) return 2;
  if (traffic?.trustedAlerts > 0 || traffic?.maxJamLevel >= 3) return 1;
  const h01 = Number.isFinite(region.rainMmH01) ? region.rainMmH01 : 0;
  const h24 = Number.isFinite(region.rainMmH24) ? region.rainMmH24 : 0;
  if (h01 >= 8 || h24 >= 55 || region.rain >= 70) return 2;
  if (h01 >= 2 || h24 >= 25 || region.rain >= 35) return 1;
  return 0;
}
