/**
 * One-off generator for src/data/portugal.json.
 * Builds a Portugal spot map from the surf-forecast.com break directory,
 * merging real profile data from beaches.json where available.
 * Run: npx tsx scripts/gen-portugal.ts
 */
import { writeFileSync } from 'node:fs'
import beaches from '../src/data/beaches.json' with { type: 'json' }

// region -> list of [name, forecastSlug]
const DIRECTORY: Record<string, Array<[string, string]>> = {
  'Beira': [
    ['Cortegaca', 'Cortegaca'], ['Costa Nova', 'Costa-Nova'], ['Esmoriz', 'Esmoriz'],
    ['Espinho', 'Espinho'], ['Figueira da Foz - Buarcos', 'Buarcos'],
    ['Figueira da Foz - Cabedelo', 'Cabedelo'], ['Figueira da Foz - Gala', 'Gala'],
    ['Furadouro', 'Furadouro'], ['Maceda', 'Maceda'], ['Murtinheira', 'Murtinheira'],
    ['Nazare', 'Nazare'], ['Pedrogao', 'Pedrogao'], ['Praia da Barra', 'Praiada-Barra'],
    ['Praia da Leirosa', 'Praia-da-Leirosa'], ['Praia da Tocha', 'Praia-da-Tocha'],
    ['Praia da Torreira', 'Praia-da-Torreira'], ['Praia da Vagueira', 'Praia-da-Vagueira'],
    ['Praia da Vieira', 'Praia-da-Vieira'], ['Praia de Mira', 'Praiade-Mira'],
    ['Praia do Norte', 'Praia-do-Norte-1'], ['Praia do Osso da Baleia', 'Praia-do-Osso-da-Baleia'],
    ['Praia Paredes', 'Praia-Paredes'], ['Sao Jacinto', 'Sao-Jacinto'],
    ['Sao Pedro de Moel', 'Sao-Pedrode-Muel'], ['Silvalde', 'Silvalde'],
  ],
  'Douro and Minho': [
    ['A Ver o Mar', 'A-Ver-o-Mar'], ['Afife', 'Afife'], ['Agucadoura', 'Agucadoura'],
    ['Azurara', 'Azurara'], ['Barra do Douro', 'Barrado-Douro'], ['Canidelo', 'Canidelo'],
    ['Cavalos de Fao', 'Cavalos-de-Fao'], ['Esposende', 'Esposende'], ['Kings Rock', 'Kings-Rock'],
    ['Leca', 'Leca'], ['Luz', 'Luz'], ['Matosinhos', 'Matosinhos'], ['Mindelo', 'Mindelo'],
    ['Miramar', 'Miramar'], ['Moledo', 'Moledo'], ['Ofir', 'Ofir'],
    ['Povoa do Varzim', 'Povoado-Varzim'], ['Praia da Amorosa', 'Praia-da-Amorosa'],
    ['Praia do Aterro', 'Praia-do-Aterro'], ['Praia do Cabedelo', 'Praia-do-Cabedelo'],
    ['Praia do Rock', 'Praia-do-Rock'], ['Sacor', 'Sacor'], ['Viana do Castelo', 'Vianado-Castelo'],
    ['Vila do Conde', 'Vilado-Conde'], ['Vila Praia de Ancora', 'Vila-Praiade-Ancora'],
  ],
  'Ericeira': [
    ['Backdoor', 'Backdoor'], ['Cave', 'Cave'], ['Coxos', 'Coxos'], ['Crazy Left', 'Crazy-Left'],
    ['Foz do Lizandro', 'Fozdo-Lizandro'], ['Furnas', 'Furnas'], ['Limipicos', 'Limipicos'],
    ['Malhadinha', 'Malhadinha'], ['Pedra Branca', 'Pedra-Branca'], ['Pontinha', 'Pontinha'],
    ['Praia do Norte', 'Praiado-Norte'], ['Praia do Peixe', 'Praiado-Peixe'],
    ['Praia do Sul', 'Praia-do-Sul-1'], ['Reef', 'Reef'], ['Ribeira D\'ilhas', 'Ribeira-Dilhas'],
    ['Sao Juliao', 'Sao-Juliao'], ['Sao Lourenco', 'Sao-Lourenco'], ['The Reef', 'The-Reef'],
  ],
  'Lisboa': [
    ['Adraga', 'Adraga'], ['Azarujinha', 'Azarujinha'], ['Bafureira', 'Bafureira'],
    ['Bica', 'Bica'], ['Bicas', 'Bicas_1'], ['Bolina', 'Bolina'], ['Carcavelos', 'Carcavelos'],
    ['Caxias', 'Caxias'], ['Costa da Caparica', 'Costada-Caparica'], ['Cresmina', 'Cresmina'],
    ['Fonte da Telha', 'Fonte-da-Telha'], ['Lagoa de Albufeira', 'Lagoa-de-Albufeira'],
    ['Monte Estoril', 'Monte-Estoril'], ['Paco D\'arcos', 'Paco-D-arcos'], ['Parede', 'Parede'],
    ['Poca', 'Poca'], ['Praia da Foz Cabo Espichel Sesimbra', 'Praia-da-Foz-Cabo-Espichel-Sesimbra'],
    ['Praia da Rainha', 'Praiada-Rainha'], ['Praia da Saude', 'Praia-da-Saude'],
    ['Praia das Macas', 'Praiadas-Macas'], ['Praia do Castello', 'Praiado-Castello'],
    ['Praia do Guincho', 'Praiado-Guincho'], ['Praia do Magoito', 'Praia-do-Magoito'],
    ['Praia do Meco', 'Praia-do-Meco'], ['Praia do Tamariz', 'Praiado-Tamariz'],
    ['Praia Grande', 'Praia-Grande'], ['Praia Pequena', 'Praia-Pequena'],
    ['Santo Amaro', 'Santo-Amaro'], ['Sao Joao', 'Sao-Joao'], ['Sao Pedro', 'Sao-Pedro-1'],
    ['Torre', 'Torre'],
  ],
  'Madeira': [
    ['Achadas Da Cruz', 'Achadas-Da-Cruz'], ['Cabo Girao', 'Cabo-Girao'],
    ['Cais do Funchal', 'Cais-do-Funchal'], ['Contreira', 'Contreira'], ['Faial', 'Faial'],
    ['Faja da Areia', 'Fajada-Areia'], ['Faja Dos Padres', 'Faja-Dos-Padres'],
    ['Jardim do Mar', 'Jardimdo-Mar'], ['Lugar De Baixo', 'Lugar-De-Baixo'],
    ['Machico', 'Machico'], ['Madalena do Mar', 'Madalena-do-Mar'], ['Paul do Mar', 'Pauldo-Mar'],
    ['Pizo', 'Pizo'], ['Ponta Delgada', 'Ponta-Delgada'], ['Ponta do Pargo', 'Ponta-do-Pargo'],
    ['Ponta do Sol', 'Pontado-Sol'], ['Ponta Pequena', 'Ponta-Pequena'],
    ['Porto da Cruz', 'Porto-Da-Cruz'], ['Porto Moniz', 'Porto-Moniz'],
    ['Praia Formosa', 'Praia-Formosa-2'], ['Ribeira da Janela', 'Ribeirada-Janela'],
  ],
  'Peniche': [
    ['Almagreira', 'Almagreira'], ['Baia', 'Baia'], ['Baleal Reef', 'Baleal-Reef'],
    ['Baleal Sul', 'Baleal-Sul'], ['Belgas', 'Belgas'], ['Cantinho', 'Cantinho'],
    ['Consolacao Lefts', 'Consolacao-Lefts'], ['Consolacao Rights', 'Consolacao-Rights'],
    ['Ferrel', 'Ferrel'], ['Foz do Arelho', 'Fozdo-Arelho'], ['Lagide', 'Lagide'],
    ['Mini Pipe', 'Mini-Pipe'], ['Molho Leste', 'Molhe-Leste'], ['Porto Batel', 'Porto-Batel'],
    ['Praia Azul', 'Praia-Azul_1'], ['Praia da Areia Branca', 'Praiada-Areia-Branca'],
    ['Praia do Baleal', 'Praiado-Baleal'], ['Praia do Cerro', 'Praia-do-Cerro'],
    ['Santa Cruz', 'Santa-Cruz'], ['Supertubos', 'Supertubos'],
  ],
  'Alentejo': [
    ['Aberta A Nova', 'Aberta-A-Nova'], ['Almograve', 'Almograve'], ['Burrinho', 'Burrinho'],
    ['Cabo de Sines', 'Cabode-Sines'], ['Carvalhal', 'Carvalhal'], ['Cogumelo', 'Cogumelo'],
    ['Comporta', 'Comporta'], ['Malhao', 'Malhano'], ['Melides', 'Melides'],
    ['Porto Covo', 'Porto-Covo'], ['Praia do Pego', 'Praia-do-Pego'],
    ['Praia dos Aivados', 'Aivados'], ['Sanguessuga', 'Sanguessuga'], ['Sao Torpes', 'Sao-Torpes'],
    ['Troia', 'Troia'], ['Vila Nova de Milfontes', 'Vila-Novade-Milfontes'],
    ['Zambujeira do Mar', 'Zambujeira-do-Mar'],
  ],
  'Algarve': [
    ['Albufeira', 'Albufeira'], ['Alfagar', 'Alfagar'], ['Alvor', 'Alvor'],
    ['Amoreira', 'Amoreira'], ['Arrifana', 'Arrifana'],
    ['Barranco da Belharucas', 'Barranco-da-Belharucas'], ['Beliche', 'Beliche'],
    ['Burgau', 'Burgau'], ['Carrapateira', 'Carrapateira'], ['Carriagem', 'Carriagem'],
    ['Castelejo', 'Castelejo'], ['Cordoama', 'Cordama'], ['Figueiros', 'Figueiros'],
    ['Forte Novo', 'Forte-Novo-Quarteira'], ['Ilha de Faro', 'Ilha-de-Faro'],
    ['Ilha de Tavira', 'Ilha-de-Tavira'], ['Ilha Deserta', 'Ilha-Deserta'],
    ['Ilha do Farol', 'Ilha-do-Farol'], ['Ingrina', 'Ingrina'], ['Julias', 'Julias'],
    ['Lage do Pescador', 'Lage-do-Pescador'], ['Luz', 'Luz-1'],
    ['Mareta', 'Mareta'], ['Martinhal', 'Martinhal'], ['Meia Praia', 'Meia-Praia'],
    ['Monte Clerigo', 'Monte-Clerigo'], ['Ponta Ruiva', 'Ponta-Ruiva'],
    ['Praia da Falesia', 'Praia-da-Falesia'], ['Praia da Rocha', 'Praiada-Rocha'],
    ['Praia de Altura', 'Praia-de-Altura'], ['Praia de Faro', 'Praia-de-Faro'],
    ['Praia de Odeceixe', 'Praiade-Odeceixe'], ['Praia do Amado', 'Praiado-Amado'],
    ['Praia do Bordeira', 'Praia-do-Bordeira'], ['Praia do Cabeco', 'Praia-do-Cabeco'],
    ['Rocha Negra', 'Luz-Rocha-Negra'], ['Salema', 'Salema'], ['Tonel', 'Tonel'],
    ['Vale do Lobo', 'Vale-do-Lobo'], ['Vale Figueira', 'Vale-Figueira'],
    ['Vila Real de Santo Antonio', 'Vila-Real-de-Santo-Antonia'], ['Zavial', 'Zavial'],
  ],
  'Azores': [
    ['Faial - Praia do Almoxarife', 'Praiado-Almoxarife'],
    ['Faial - Praia do Norte', 'Praiado-Norte-Azores'], ['Graciosa - Lagou', 'Lagou'],
    ['Graciosa - Porto da Praia', 'Portoda-Praia'], ['San Jorge - Faja dos Cubres', 'Fajados-Cubres'],
    ['San Jorge - Punta da Caldeira', 'Puntada-Caldeira'], ['San Miguel - Areias', 'Areias'],
    ['San Miguel - Baixa de Viola', 'Baixade-Viola'], ['San Miguel - Ponta dos Mosteiros', 'Pontados-Mosteiros'],
    ['San Miguel - Populo', 'Populo'], ['San Miguel - Rabo de Peixe', 'Rabode-Peixe'],
    ['San Miguel - Ribeira Grande', 'Ribeira-Grande'], ['San Miguel - Ribeira Quente', 'Ribeira-Quente'],
    ['San Miguel - Santa Iria', 'Santa-Iria'], ['Santa Maria - Anjos', 'Anjos'],
    ['Santa Maria - Praia Formosa', 'Praia-Formosa'], ['Terceira - Baia Das Quatro Ribeiras', 'Baia-Das-Quatro-Ribeiras'],
    ['Terceira - Contendas', 'Contendas'], ['Terceira - Ponta do Queimado', 'Pontado-Queimado'],
    ['Terceira - Porto Martins', 'Porto-Martins'], ['Terceira - Porto Novo', 'Porto-Novo'],
    ['Terceira - Praia da Vitoria', 'Praia-da-Vitoria'], ['Terceira - Praia do Norte', 'Praia-do-Norte'],
    ['Terceira - Praia Vitoria', 'Praia-Vitoria'], ['Terceira - Santa Catarina', 'Santa-Catarina'],
    ['Terceira - Sao Mateus da Calheta', 'Sao-Mateusda-Calherta'], ['Terceira - Vila Nova', 'Vila-Nova'],
  ],
}

const slugify = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

// Index existing real beach data by normalized name for enrichment.
const byName = new Map<string, any>()
for (const b of beaches) {
  if (b.country === 'Portugal') byName.set(slugify(b.name), b)
}

const out: any[] = []
for (const [region, spots] of Object.entries(DIRECTORY)) {
  for (const [name, forecastSlug] of spots) {
    const key = slugify(name)
    const existing = byName.get(key)
    const base = {
      id: existing?.id ?? `${slugify(name)}-pt`,
      name,
      country: 'Portugal',
      region,
      forecastSlug,
      forecastUrl: `https://www.surf-forecast.com/breaks/${forecastSlug}/forecasts/latest/six_day`,
      providers: ['surf-forecast', 'open-meteo'],
    }
    if (existing) {
      out.push({
        ...base,
        lat: existing.lat, lon: existing.lon,
        waveType: existing.waveType, skillLevel: existing.skillLevel,
        bestTide: existing.bestTide, bestSwellDir: existing.bestSwellDir,
        bestWindDir: existing.bestWindDir, camUrl: existing.camUrl ?? null,
        enriched: true,
      })
    } else {
      out.push({
        ...base,
        lat: null, lon: null, waveType: [], skillLevel: [],
        bestTide: null, bestSwellDir: null, bestWindDir: null, camUrl: null,
        enriched: false,
      })
    }
  }
}

writeFileSync(
  new URL('../src/data/portugal.json', import.meta.url),
  JSON.stringify(out, null, 2) + '\n',
)
const enriched = out.filter(o => o.enriched).length
console.log(`Wrote ${out.length} Portugal spots (${enriched} enriched, ${out.length - enriched} name-only).`)
