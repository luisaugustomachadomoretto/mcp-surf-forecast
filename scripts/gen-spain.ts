/**
 * One-off generator for src/data/spain.json.
 * Mirrors scripts/gen-portugal.ts: builds a Spain spot map from the
 * surf-forecast.com break directory (Spain / Europe), merging real profile
 * data from beaches.json where available. Coordinates/attributes are filled
 * later by scripts/enrich-spain.ts.
 * Run: npx tsx scripts/gen-spain.ts
 */
import { writeFileSync } from 'node:fs'
import beaches from '../src/data/beaches.json' with { type: 'json' }

// region -> list of [name, forecastSlug] (slugs taken from the directory links)
const DIRECTORY: Record<string, Array<[string, string]>> = {
  'Andalucia': [
    ['Barbate River', 'Barbate-River'], ['Bolonia', 'Bolonia'], ['Cabo Roche', 'Cabo-Roche'],
    ['Calita', 'Calita_1'], ['Canos de Meca', 'Canosde-Meca'], ['Chiclana de la Frontera', 'Chiclanadela-Frontera'],
    ['Chipiona', 'Chipiona'], ['Conil', 'Conil'], ['Conil de la Frontera', 'Conildela-Frontera'],
    ['El Balneario', 'El-Balneario'], ['El Cano de la Culata', 'El-Cano-de-la-Culata'],
    ['El Castillo', 'El-Castillo'], ['El Chanquete', 'El-Chanquete'], ['El Sunset (Benalmadena)', 'El-Sunset-Benalmadena'],
    ['Faro de Trafalgar', 'Faro-de-Trafalgar'], ['Fuengirola', 'Fuengirola'], ['Getares', 'Getares'],
    ['Guadalmar', 'Guadalmar'], ['Isla Canela', 'Isla-Canela'], ['La Barossa', 'La-Barossa'],
    ['La Cabanita', 'La-Cabanita'], ['La Chucha', 'La-Chucha'], ['La Herradura', 'La-Herradura-Andalucia'],
    ['La Muralla', 'La-Muralla'], ['La Playita', 'La-Playita_1'], ['La Yerbabuena', 'La-Yerbabuena'],
    ['Largos', 'Largos'], ['Las Caracolas', 'Las-Caracolas'], ['Las Redes', 'Las-Redes'],
    ['Los Lances', 'Los-Lances'], ['Marbella - Playa del Cable', 'Marbella-Playa-del-Cable'],
    ['Matalascanas', 'Matalascanas'], ['Mazagon', 'Mazagon'], ['Melilla Beach', 'Melilla-Beach'],
    ['Mojacar', 'Mojacar-Beach-Pier'], ['Molino de Papel', 'Molino-de-Papel'],
    ['Pico de el Puerto', 'Picodeel-Puerto'], ['Pico de las Cocheras', 'Picodelas-Cocheras'],
    ['Playa Central', 'Isla-Cristina'], ['Playa de Camposoto', 'Playa-Campo-Sota'],
    ['Playa de Carchuna', 'Playade-Carchuna'], ['Playa de Hierbabuena', 'Playade-Hierbabuena'],
    ['Playa de la Barrosa', 'Playadela-Barrosa'], ['Playa de la Canaleta', 'La-Canaleta'],
    ['Playa de Lagos', 'Playade-Lagos'], ['Playa de Regla', 'Playade-Regla'],
    ['Playa de Tres Piedras', 'Playade-Tres-Piedras'], ['Playa el Bombo', 'Playa-El-Bombo'],
    ['Playa El Palmar', 'Playa-El-Palmar'], ['Playa la Carihuela', 'Playala-Carihuela'],
    ['Puerto Cabopino', 'Cabopino'], ['Puerto Marina', 'Puerto-Marina'], ['Punta del Moral', 'Punta-del-Moral'],
    ['Punta Umbria (Playa Camaron)', 'Playa-El-Camaron'], ['Torre Gorda', 'Torre-Gorda'],
    ['Zahara de los Atunes', 'Zaharadelos-Atunes'],
  ],
  'Asturias': [
    ['Cabo Lastres', 'Cabo-Lastres'], ['Cala De Meron', 'Calade-Meron'], ['Concha de Artedo', 'Playa-Conchade-Artedo'],
    ['El Mongol', 'El-Mongol'], ['La Arena', 'La-Arena'], ['La Nora', 'La-Nora'], ['La Paloma', 'La-Paloma_1'],
    ['Playa Aguilera', 'Playa-Aguilera'], ['Playa Bahinas', 'Playa-Bahinas'], ['Playa de Andrin', 'Playade-Andrin'],
    ['Playa de Arnao', 'Playade-Arnao'], ['Playa de Barayo', 'Playade-Barrayo'], ['Playa de Bayas', 'Playade-Bayas'],
    ['Playa de Cadavedo', 'Playade-Cadavedo'], ['Playa de Candas', 'Playade-Candas'],
    ['Playa de Cervigon', 'Playade-Cervigon'], ['Playa de Cueva', 'Playade-Cueva'],
    ['Playa de Espana', 'Playade-Espana'], ['Playa de Frexulfe', 'Playade-Frexulfe'],
    ['Playa de la Atalaya y Cazanera', 'Playadela-Atalayay-Cazanera'], ['Playa de la Cagonera', 'Playadela-Cagonera'],
    ['Playa de la Griega', 'Playadela-Griega'], ['Playa de Lastres', 'Playade-Lastres'],
    ['Playa de Llumeres', 'Playade-Llumeres'], ['Playa de Luanco', 'Playade-Luanco'],
    ['Playa de Mendia', 'Playade-Mendia'], ['Playa de Navia', 'Playade-Navia'],
    ['Playa de Niembro', 'Playade-Niembro'], ['Playa de Oleiros', 'Playade-Oleiros'],
    ['Playa de Otur', 'Playade-Otur'], ['Playa de Palombina', 'Playade-Palombina'],
    ['Playa de Penarronda', 'Playade-Penarronda'], ['Playa de Penarrubia', 'Playade-Penarrubia'],
    ['Playa de Salinas', 'Playade-Salinas'], ['Playa de San Antolin', 'Playade-San-Antolin'],
    ['Playa de San Juan', 'Playade-San-Juan-and-Espartal'], ['Playa de San Lorenzo', 'Playade-San-Lorenzo'],
    ['Playa de San Martin', 'Playade-San-Martin'], ['Playa de San Pedro', 'Playade-San-Pedro'],
    ['Playa de Santa Marina', 'Playade-Santa-Marina_Ribadesalla'], ['Playa de Tapia', 'Playade-Tapia'],
    ['Playa de Torimbia', 'Playade-Torimbia'], ['Playa de Tranqueru', 'Playade-Tranqueru'],
    ['Playa de Vega', 'Playade-Vega_1'], ['Playa de Vidiago', 'Playade-Vidiago'],
    ['Playa de Viso', 'Playade-Viso'], ['Playa de Xago', 'Playade-Xago'], ['Playa del Moro', 'Playadeel-Moro'],
    ['Playa los Frailes', 'Playalos-Frailes'], ['Playa Santa Maria del Mar', 'Playa-Santa-Mariadel-Mar'],
    ['Playa Tenrero', 'Playa-Tenrero'], ['Puerto de Vega', 'Puertode-Vega'], ['Rodiles', 'Rodiles'],
    ['Rodiles - Main Beach', 'Rodiles_Main-Beach'], ['Salinas', 'Salinas'], ['Tapia de Casariego', 'Tapiade-Casariego'],
    ['Xivares', 'Xivares'],
  ],
  'Balearic Islands': [
    ['Formentera - Playa des Mitgjorn', 'Playa-des-Mitgjorn'], ['Ibiza - Cala Nova', 'Cala-Nova'],
    ['Ibiza - Punta Xarraca', 'Punta-Xarraca-Ibiza'], ['Mallorca - Cala Major', 'Cala-Major-Mallorca'],
    ['Mallorca - Cala Mesquida', 'Calo-Mesquida-Mallorca'], ['Mallorca - Cala Ratjada', 'Cala-Ratjada'],
    ['Mallorca - Es Trenc', 'Es-Trenc'], ['Mallorca - Malpas', 'Malpas'], ['Mallorca - Paguera Tora', 'Paguera-Tora-Mallorca'],
    ['Mallorca - Son Serra de Marina', 'Son-Serra-de-Marina'], ['Mallorca - Son Serra Nova', 'Son-Serra-Nova'],
    ['Menorca - Son Bou', 'Son-Bou'],
  ],
  'Catalunia': [
    ['Aiguadolc', 'Aiguadolc'], ['Arenys de Mar', 'Arenys-de-Mar'], ['Barceloneta', 'Barceloneta'],
    ['Bogatell', 'Bogatell'], ['Cabrera', 'Cabrera'], ['Cala de Santa Cristina', 'Calade-Santa-Cristina'],
    ['Comandancia', 'Comandancia'], ['Desembocadura del Tordera', 'Desembocaduradel-Tordera'],
    ['El Masnou', 'Masnou'], ['Empuriabrava', 'Empuriabrava'], ['Garraf', 'Garraf'], ['La Rotonda', 'La-Rotonda'],
    ['Latigo', 'Latigo'], ['Miami Platja', 'Miami-Platja'], ['Montgat', 'Montgat'], ['Nova Mar Bella', 'Nova-Mar-Bella-Barcelona'],
    ["Peyo's", 'Peyo-s'], ['Platja de Sant Pol', 'Platja-de-Sant-Pol'], ['Playa de Premia', 'Playade-Premia'],
    ['Playa de Sant Sebastia', 'Playade-Sant-Sebastia'], ['Port de Mataro', 'Port-de-Mataro'],
    ['Port Ginesta', 'Port-Ginesta-Castelldefels'], ['Roc San Cayetano', 'Roc-San-Cayetano'],
    ['Saint Andreu de Llavaneres', 'Saint-Andreu-de-Llavaneres'], ["Sant Marti d'Empuries", 'Sant-Marti'],
    ['Sant Pol de Mar', 'Sant-Pol-de-ar'], ['Segur de Calafell', 'Segur-de-Calafell'],
    ['Torre Bank', 'Torre-Bank'], ['Vilassar de Mar', 'Vilassar'],
  ],
  'Galicia': [
    ['Louro (Playa Area Maior)', 'Playade-Louro'], ['Matadeiro', 'Matadeiro'], ['Nemina', 'Nemina'],
    ['Pantin', 'Pantin'], ['Pedra do Sal', 'Pedra-do-Sal'], ['Playa Aguieira', 'Playa-Aguieira'],
    ['Playa da A Marosa', 'Playa-A-Marosa'], ['Playa de Area', 'Playade-Area'],
    ['Playa de Baldayo - La Laguna', 'Playade-Baldanio'], ['Playa de Baleo', 'Playade-Baleo'],
    ['Playa de Barona', 'Playade-Barona'], ['Playa de Barra', 'Playade-Barra'],
    ['Playa de Barranan', 'Playade-Barranan'], ['Playa de Bastiagueiro', 'Playade-Bastiagueiros'],
    ['Playa de Caion', 'Playade-Caion'], ['Playa de Campelo', 'Playade-Campelo'],
    ['Playa de Carino', 'Playade-Carino'], ['Playa de Carnota', 'Playade-Carnota'],
    ['Playa de Castro', 'Playade-Castro'], ['Playa de Doninos', 'Playade-Doninos'],
    ['Playa de Espasante', 'Playade-Espasante'], ['Playa de Esteiro', 'Playade-Esteiro'],
    ['Playa de Fonforron', 'Playade-Fonforron'], ['Playa de Ladeira', 'Playade-Ladeira'],
    ['Playa de Lanzada', 'Playade-Lanzada'], ['Playa de Larino', 'Playade-Larino'],
    ['Playa de Madorra', 'Playade-Madorra'], ['Playa de Malpica', 'Playade-Malpica'],
    ['Playa de Melide', 'Playade-Melide'], ['Playa de Montalbo', 'Playade-Montalbo'],
    ['Playa de Nerga', 'Playade-Negra'], ['Playa de Patos (El Pico)', 'Playade-Patos'],
    ['Playa de Razo', 'Playade-Razo'], ['Playa de Rio Sieira / As Furnas', 'Playade-Rio-Sieira'],
    ['Playa de Sabon', 'Playade-Sabon'], ['Playa de San Cibrao', 'Playade-San-Cibrao'],
    ['Playa de San Miguel de Reinante', 'Playade-San-Miguelde-Reinante'], ['Playa de San Roman', 'Playade-San-Roman'],
    ['Playa de San Xurxo', 'Playade-San-Xurxo'], ['Playa de Sarrigal', 'Playade-Sarrigal'],
    ['Playa de Seaia', 'Playade-Seaia'], ['Playa de Soesto', 'Playa-de-Soesto'],
    ['Playa de Traba', 'Playade-Traba'], ['Playa do Carreiro', 'Playado-Carreiro'],
    ['Playa do Orzan', 'Playade-Orzan'], ['Playa do Rostro', 'Playado-Rostro'],
    ['Playa Rapadoira', 'Playa-Rapadoira'], ['Ponzos', 'Ponzos'], ['Ria Foz', 'Ria-Foz'],
    ['Santa Comba', 'Sta-Comba'], ['Santa Maria de Oia', 'Santa-Mariade-Oia'], ['Serans', 'Serans'],
    ['Valdovino', 'Valdovino'], ['Villarrube', 'Villarrube'],
  ],
  'Murcia': [
    ['La Manga', 'La-Manga'], ['Pico de el Errizo', 'Picodeel-Errizo'], ['Pico de la Autopista', 'Picodela-Autopista'],
    ['Playa de Entremares', 'Playade-Entremares'], ['Playa de Levante', 'Playade-Levante'],
    ['Punta de la Raja', 'Puntadela-Raja'],
  ],
  'Pais Vasco': [
    ['Bakio', 'Bakio'], ['Barinatxe - La Salvaje', 'La-Salvaje'], ['Deba', 'Deba'], ['Guibeleco', 'Guibeleco'],
    ['Hondarribia', 'Hondarribia'], ['Isla de Izaro', 'Islade-Izaro'], ['Karramarro', 'Karramarro'],
    ['La Arena', 'La-Arena-1'], ['La Concha', 'La-Concha'], ['Menakoz', 'Menakoz'], ['Mundaka', 'Mundaka'],
    ['Mutriku', 'Mutriku'], ['Orio', 'Orio'], ['Orrua', 'Orrua'], ['Pena Roja', 'Pena-Roja'],
    ['Playa de Aizkorri', 'Playade-Aizkorri'], ['Playa de Arrietara', 'Playade-Arrietara'],
    ['Playa de Arrigunaga', 'Playade-Arrigunaga'], ['Playa de Barrika', 'Playade-Barrika'],
    ['Playa de Ereaga', 'Playade-Ereaga'], ['Playa de Gaztetape', 'Playade-Gaztetape'],
    ['Playa de Gros', 'Playade-Gros'], ['Playa de karraspio', 'Playade-Karraspio'],
    ['Playa de Laga', 'Playade-Laga'], ['Playa de Laida', 'Playade-Laida'], ['Playa de Ogeia', 'Playade-Ogeia'],
    ['Playa de Ondarreta - Pikua', 'Playade-Ondarreta_Pikua'], ['Playa de Ondarreta (Pico del Tenis)', 'Playade-Ondarreta_Picodel-Tenis'],
    ['Plentzia', 'Plentzia'], ['Punta Galea', 'Punta-Galea'], ['Roca Puta', 'Roca-Puta'],
    ['Sopelana', 'Sopelana'], ['Zarautz', 'Zarautz'], ['Zumaya (Playa de Itxurun)', 'Zumaya'],
    ['Zurriola hondartza', 'Zurriola-hondartza'],
  ],
  'Cantabria': [
    ['Ajo', 'Ajo'], ['Copacabana', 'Copacabana'], ['El Arenal', 'El-Arenal_1'], ['El Brusco', 'El-Brusco'],
    ['El Huerto', 'El-Huerto'], ['El Sardinero - Primera', 'Playade-Sardinero'], ['El Sardinero - Segunda', 'El-Sardinero'],
    ['Islares', 'Islares'], ['Laredo', 'Laredo'], ['Liencres', 'Liencres'], ['Los Locos', 'Los-Locos'],
    ['Noja', 'Noja'], ['Playa de Arenillas', 'Playade-Arenillas'], ['Playa de Arenillas 2', 'Playade-Arenillas_1'],
    ['Playa de Berria', 'Playade-Berria'], ['Playa de Brazomar', 'Playade-Brazomar'],
    ['Playa de Galizano', 'Playade-Galizano'], ['Playa de Gerra', 'Playade-Gerra'],
    ['Playa de la Concha', 'Playadela-Concha'], ['Playa de Langre', 'Playade-Langre'],
    ['Playa de los Barcos', 'Playadelos-Barcos'], ['Playa de Meron', 'Playade-Meron'],
    ['Playa de Miono', 'Playade-Miono'], ['Playa de Orinon', 'Playade-Orinon'],
    ['Playa de Oyambre', 'Playade-Oyambre'], ['Playa de Ris', 'Playade-Ris'],
    ['Playa de Robayera', 'Playade-Robayera'], ['Playa de Somo', 'Playade-Somo'],
    ['Playa de Tagle', 'Playade-Tagle'], ['San Vicente', 'San-Vicentedela-Barquera'],
    ['San Vicente Rivermouth', 'San-Vicente_Rivermouth'], ['Sopico', 'Sopico'],
  ],
  'Valencia': [
    ['Aiguaoliva', 'Aiguaoliva'], ['Benicassim', 'Benicassim'], ['Cabo de las Huertas', 'La-Punta_Cabo-Huertas'],
    ['Calita', 'Calita'], ['Calp', 'Calpe-Rock'], ['Derecha de la Cala', 'Derecha'],
    ['El Cantal Roig', 'Cantal-Roig'], ['El Jucar', 'El-Jucar'], ['El Perello', 'El-Perello'],
    ['Jucar', 'Jucar'], ['La Mata', 'La-Mata'], ['La Placa', 'La-Placa'], ['La Siesta', 'La-Siesta'],
    ['La Zenia', 'La-Zenia'], ['Malva Rosa', 'Malva-Rosa'], ['Montgo di Bongo', 'Montgo-di-Bongo'],
    ['Moraira', 'Moraira'], ["Moraira - Platja de l'Ampolla", 'Platja-de-l-Ampolla'],
    ['Oliva Beach', 'Olivia-Beach'], ['Pico Madrid', 'Pico-Madrid'], ['Playa de Levante', 'Playade-Lavante_Las-Arenas'],
    ['Playa de San Juan', 'Playa-de-San-Juan-Alicante'], ['Playa del Dosel', 'Playadel-Dosel'],
    ['Playa del Torres', 'Playa-del-Torres'], ['Playa Finestrat', 'Playa-Finestrat'],
    ['Playa Poniente', 'Playa-Poniente-Benidorm'], ['Port Saplaya', 'Port-Saplaya'],
    ['Puerto Benidorm', 'Puerto-Benidorm'], ['Punta Prima', 'Punta-Prima'], ['Sierra de Irta', 'Sierra-de-Irta'],
    ['The Box', 'The-Box_2'],
  ],
}

const slugify = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

const byName = new Map<string, any>()
for (const b of beaches) {
  if (b.country === 'Spain') byName.set(slugify(b.name), b)
}

const out: any[] = []
for (const [region, spots] of Object.entries(DIRECTORY)) {
  for (const [name, forecastSlug] of spots) {
    const key = slugify(name)
    const existing = byName.get(key)
    const base = {
      id: existing?.id ?? `${slugify(name)}-es`,
      name,
      country: 'Spain',
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
  new URL('../src/data/spain.json', import.meta.url),
  JSON.stringify(out, null, 2) + '\n',
)
const enriched = out.filter(o => o.enriched).length
console.log(`Wrote ${out.length} Spain spots (${enriched} enriched, ${out.length - enriched} name-only).`)
