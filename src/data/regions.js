export const regionsSeed = [
  { id: 'centro', ap: 'AP1', name: 'Centro', lat: -22.9068, lng: -43.1958, temp: 29, tempMin: 24, tempMax: 34, rain: 12, trafficIdx: 1, occurrences: 3, powerIdx: 0, vandalism: 1, communities: ['Providencia', 'Pinto', 'Mangueira'], transformersTotal: 14, transformersDown: 0, mapX: 46, mapY: 44 },
  { id: 'zs', ap: 'AP2', name: 'Zona Sul', lat: -22.9707, lng: -43.1823, temp: 27, tempMin: 22, tempMax: 32, rain: 8, trafficIdx: 2, occurrences: 5, powerIdx: 0, vandalism: 0, communities: ['Rocinha', 'Vidigal', 'Cantagalo'], transformersTotal: 19, transformersDown: 0, mapX: 40, mapY: 66 },
  { id: 'gt', ap: 'AP2', name: 'Grande Tijuca', lat: -22.9271, lng: -43.2306, temp: 28, tempMin: 23, tempMax: 33, rain: 22, trafficIdx: 1, occurrences: 2, powerIdx: 1, vandalism: 2, communities: ['Borel', 'Formiga', 'Salgueiro'], transformersTotal: 16, transformersDown: 1, mapX: 52, mapY: 40 },
  { id: 'zn', ap: 'AP3', name: 'Zona Norte', lat: -22.842, lng: -43.243, temp: 30, tempMin: 24, tempMax: 36, rain: 26, trafficIdx: 2, occurrences: 10, powerIdx: 1, vandalism: 3, communities: ['Complexo do Alemao', 'Manguinhos', 'Vila Kennedy', 'Cocota', 'Jardim Guanabara'], transformersTotal: 31, transformersDown: 2, mapX: 66, mapY: 25 },
  { id: 'barra', ap: 'AP4/AP5', name: 'Zona Oeste', lat: -22.9276, lng: -43.464, temp: 30, tempMin: 23, tempMax: 38, rain: 37, trafficIdx: 2, occurrences: 22, powerIdx: 2, vandalism: 10, communities: ['Vila Autodromo', 'Rio das Pedras', 'Gericino', 'Padre Miguel', 'Vila Kosmos', 'Vila do Ceu', 'Nova Alianca', 'Jardim Maravilha'], transformersTotal: 56, transformersDown: 7, mapX: 18, mapY: 56 },
];

export const streetMap = {
  centro: ['Av. Presidente Vargas', 'Rua Uruguaiana', 'Av. Rio Branco'],
  zs: ['Av. Vieira Souto', 'Rua Visconde de Piraja', 'Av. Niemeyer'],
  gt: ['Rua Conde de Bonfim', 'Av. Maracana', 'Rua Sao Francisco Xavier'],
  zn: ['Av. Suburbana', 'Av. Dom Helder Camara', 'Rua Leopoldina Rego', 'Estrada do Galeao'],
  barra: ['Av. das Americas', 'Av. Ayrton Senna', 'Rua Fonseca', 'Estrada do Mendanha', 'Av. Brasil', 'Estrada do Guandu', 'Av. Santa Cruz'],
};
