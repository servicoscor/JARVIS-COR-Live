import { streetMap } from '../data/regions.js';
import { rand } from './format.js';

export function buildEvent(region) {
  const streets = streetMap[region.id] || ['via principal da regiao'];
  const street = streets[Math.floor(Math.random() * streets.length)];
  const pool = [];
  const accMm = (region.rain * 0.7 + rand(0, 12)).toFixed(0);
  const rateMm = (region.rain / 9 + rand(0.2, 2.5)).toFixed(1);

  pool.push({
    type: 'PLU-04',
    title: 'PLUVIOMETRO ATIVOU',
    lines: [
      `${rateMm} mm na ultima hora, perto de ${street}`,
      `${accMm} mm acumulados desde as 3h`,
      region.rain > 50 ? 'Ritmo com potencial de alagamento em 20-30 min' : region.rain > 25 ? 'Chuva moderada, ainda controlavel' : 'Chuva fraca e isolada',
    ],
  });

  if (region.trafficIdx === 2) pool.push({ type: 'TRF-11', title: 'TRANSITO TRAVOU', lines: [`${street} abaixo de 12 km/h`, 'CET-Rio acionada', 'Sem previsao de liberacao'] });
  if (region.occurrences > 5) pool.push({ type: 'OCR-02', title: 'OCORRENCIA ABERTA', lines: [`${region.occurrences} chamados abertos na regiao`, 'Equipe de campo enviada', 'Atualizacao estimada em 15 min'] });
  if (region.powerIdx >= 1) pool.push({ type: 'ENE-09', title: region.powerIdx === 2 ? 'FALTA DE ENERGIA' : 'INSTABILIDADE ELETRICA', lines: [`Comunidades afetadas: ${region.communities.slice(0, 2).join(', ')}`, 'Concessionaria acionada', `Perto de ${street}`] });
  if (region.transformersDown >= 1) pool.push({ type: 'TRF-13', title: region.transformersDown >= 3 ? 'TRANSFORMADORES CRITICOS' : 'TRANSFORMADOR EM FALHA', lines: [`${region.transformersDown} de ${region.transformersTotal} transformadores fora`, `Concentrado perto de ${street}`, 'Manutencao em monitoramento'] });
  if (region.vandalism > 2) pool.push({ type: 'VAN-05', title: 'REGISTRO DE VANDALISMO', lines: [`${region.vandalism} registros nas ultimas 24h`, `Foco em ${region.communities[0]}`, 'Guarda Municipal notificada'] });

  pool.push({ type: 'CAM-07', title: 'CAMERA REDIRECIONADA', lines: [`Operador apontou camera proxima de ${street}`, `${region.temp.toFixed(1)}C no sensor local`, 'Sem anormalidade visivel no momento'] });
  return pool[Math.floor(Math.random() * pool.length)];
}
