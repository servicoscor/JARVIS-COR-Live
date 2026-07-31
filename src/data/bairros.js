import { normalizeKey } from '../lib/format.js';

const groups = [
  ['centro', ['Centro', 'Lapa', 'Gloria', 'Catumbi', 'Cidade Nova', 'Estacio', 'Rio Comprido', 'Santo Cristo', 'Gamboa', 'Saude', 'Caju', 'Sao Cristovao', 'Paqueta', 'Santa Teresa', 'Vasco da Gama', 'Mangueira']],
  ['zs', ['Botafogo', 'Flamengo', 'Catete', 'Cosme Velho', 'Laranjeiras', 'Urca', 'Leme', 'Copacabana', 'Ipanema', 'Leblon', 'Lagoa', 'Jardim Botanico', 'Gavea', 'Sao Conrado', 'Humaita', 'Vidigal', 'Rocinha']],
  ['gt', ['Tijuca', 'Vila Isabel', 'Grajau', 'Andarai', 'Maracana', 'Praca da Bandeira', 'Alto da Boa Vista']],
  ['zn', ['Ramos', 'Bonsucesso', 'Manguinhos', 'Olaria', 'Penha', 'Penha Circular', 'Vila da Penha', 'Vigario Geral', 'Meier', 'Todos os Santos', 'Cachambi', 'Engenho de Dentro', 'Engenho Novo', 'Agua Santa', 'Encantado', 'Piedade', 'Abolicao', 'Pilares', 'Sampaio', 'Riachuelo', 'Rocha', 'Sao Francisco Xavier', 'Del Castilho', 'Inhauma', 'Higienopolis', 'Jacare', 'Jacarezinho', 'Maria da Graca', 'Complexo do Alemao', 'Cacuia', 'Vaz Lobo', 'Benfica', 'Jardim America', 'Campinho', 'Turiacu', 'Bras de Pina', 'Tomas Coelho', 'Cordovil', 'Parada de Lucas', 'Engenho da Rainha', 'Lins de Vasconcelos', 'Vila Kosmos', 'Vicente de Carvalho', 'Vista Alegre', 'Cascadura', 'Madureira', 'Iraja', 'Colegio', 'Quintino Bocaiuva', 'Cavalcanti', 'Engenheiro Leal', 'Rocha Miranda', 'Honorio Gurgel', 'Osvaldo Cruz', 'Acari', 'Bento Ribeiro', 'Marechal Hermes', 'Barros Filho', 'Cidade Universitaria', 'Guadalupe', 'Coelho Neto', 'Ricardo de Albuquerque', 'Parque Anchieta', 'Anchieta', 'Pavuna', 'Mare', 'Vila Kennedy', 'Cocota', 'Freguesia (Ilha)', 'Jardim Guanabara', 'Taua', 'Ribeira', 'Zumbi', 'Bancarios', 'Portuguesa', 'Galeao', 'Praia da Bandeira', 'Pitangueiras', 'Monero', 'Jardim Carioca', 'Ilha do Governador']],
  ['barra', ['Barra da Tijuca', 'Recreio dos Bandeirantes', 'Camorim', 'Vargem Grande', 'Vargem Pequena', 'Itanhanga', 'Joa', 'Jacarepagua', 'Anil', 'Freguesia (Jacarepagua)', 'Pechincha', 'Taquara', 'Tanque', 'Curicica', 'Gardenia Azul', 'Cidade de Deus', 'Praca Seca', 'Vila Valqueire', 'Jardim Sulacap', 'Grumari', 'Bangu', 'Padre Miguel', 'Realengo', 'Deodoro', 'Vila Militar', 'Magalhaes Bastos', 'Gericino', 'Senador Camara', 'Campo dos Afonsos', 'Campo Grande', 'Santa Cruz', 'Cosmos', 'Inhoaiba', 'Guaratiba', 'Barra de Guaratiba', 'Sepetiba', 'Paciencia', 'Santissimo', 'Pedra de Guaratiba', 'Parque Columbia', 'Senador Vasconcelos']],
];

export const regionBairros = Object.fromEntries(groups);

export const bairroToRegion = Object.fromEntries(
  groups.flatMap(([regionId, names]) => names.map((name) => [normalizeKey(name), regionId])),
);

export function regionIdForFeature(props = {}) {
  const candidates = [props.nome, props.NOME, props.Nome, props.name, props.NAME, props.bairro, props.BAIRRO];
  for (const candidate of candidates) {
    const id = candidate && bairroToRegion[normalizeKey(candidate)];
    if (id) return id;
  }
  return null;
}

export function bairroName(props = {}) {
  return props.nome || props.NOME || props.Nome || props.name || props.NAME || '';
}
