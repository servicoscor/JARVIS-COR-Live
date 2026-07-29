export const regionsSeed = [
  { id: 'centro', ap: 'AP1', name: 'Centro', lat: -22.9068, lng: -43.1958, temp: 29, tempMin: 24, tempMax: 34, rain: 12, trafficIdx: 1, occurrences: 3, powerIdx: 0, vandalism: 1, communities: ['Providencia', 'Pinto', 'Mangueira'], transformersTotal: 14, transformersDown: 0, mapX: 46, mapY: 44 },
  { id: 'zs', ap: 'AP2', name: 'Zona Sul', lat: -22.9707, lng: -43.1823, temp: 27, tempMin: 22, tempMax: 32, rain: 8, trafficIdx: 2, occurrences: 5, powerIdx: 0, vandalism: 0, communities: ['Rocinha', 'Vidigal', 'Cantagalo'], transformersTotal: 19, transformersDown: 0, mapX: 40, mapY: 66 },
  { id: 'gt', ap: 'AP2', name: 'Grande Tijuca', lat: -22.9271, lng: -43.2306, temp: 28, tempMin: 23, tempMax: 33, rain: 22, trafficIdx: 1, occurrences: 2, powerIdx: 1, vandalism: 2, communities: ['Borel', 'Formiga', 'Salgueiro'], transformersTotal: 16, transformersDown: 1, mapX: 52, mapY: 40 },
  { id: 'zn', ap: 'AP3', name: 'Zona Norte', lat: -22.8752, lng: -43.2698, temp: 30, tempMin: 25, tempMax: 36, rain: 34, trafficIdx: 2, occurrences: 9, powerIdx: 1, vandalism: 3, communities: ['Complexo do Alemao', 'Manguinhos', 'Vila Kennedy'], transformersTotal: 22, transformersDown: 2, mapX: 58, mapY: 27 },
  { id: 'ig', ap: 'AP3', name: 'Ilha do Governador', lat: -22.8095, lng: -43.2153, temp: 29, tempMin: 24, tempMax: 34, rain: 18, trafficIdx: 0, occurrences: 1, powerIdx: 0, vandalism: 0, communities: ['Cocota', 'Jardim Guanabara'], transformersTotal: 9, transformersDown: 0, mapX: 74, mapY: 22 },
  { id: 'barra', ap: 'AP4', name: 'Barra da Tijuca', lat: -23.0045, lng: -43.3651, temp: 28, tempMin: 23, tempMax: 33, rain: 15, trafficIdx: 2, occurrences: 4, powerIdx: 0, vandalism: 1, communities: ['Vila Autodromo', 'Rio das Pedras'], transformersTotal: 17, transformersDown: 0, mapX: 22, mapY: 72 },
  { id: 'bangu', ap: 'AP5', name: 'Bangu', lat: -22.8756, lng: -43.4653, temp: 31, tempMin: 26, tempMax: 37, rain: 45, trafficIdx: 1, occurrences: 7, powerIdx: 2, vandalism: 4, communities: ['Gericino', 'Padre Miguel', 'Vila Kosmos'], transformersTotal: 18, transformersDown: 3, mapX: 20, mapY: 40 },
  { id: 'cg', ap: 'AP5', name: 'Campo Grande', lat: -22.9028, lng: -43.5615, temp: 32, tempMin: 27, tempMax: 38, rain: 52, trafficIdx: 2, occurrences: 11, powerIdx: 2, vandalism: 5, communities: ['Vila do Ceu', 'Nova Alianca', 'Jardim Maravilha'], transformersTotal: 21, transformersDown: 4, mapX: 12, mapY: 55 },
];

export const streetMap = {
  centro: ['Av. Presidente Vargas', 'Rua Uruguaiana', 'Av. Rio Branco'],
  zs: ['Av. Vieira Souto', 'Rua Visconde de Piraja', 'Av. Niemeyer'],
  gt: ['Rua Conde de Bonfim', 'Av. Maracana', 'Rua Sao Francisco Xavier'],
  zn: ['Av. Suburbana', 'Av. Dom Helder Camara', 'Rua Leopoldina Rego'],
  ig: ['Estrada do Galeao', 'Av. Governador Leonel de Moura Brizola'],
  barra: ['Av. das Americas', 'Av. Ayrton Senna'],
  bangu: ['Rua Fonseca', 'Estrada do Mendanha', 'Av. Brasil'],
  cg: ['Estrada do Guandu', 'Av. Santa Cruz'],
};
