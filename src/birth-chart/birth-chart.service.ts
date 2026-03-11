import { Injectable } from '@nestjs/common';

const SIGNS_ES = [
  'Aries', 'Tauro', 'Géminis', 'Cáncer', 'Leo', 'Virgo',
  'Libra', 'Escorpio', 'Sagitario', 'Capricornio', 'Acuario', 'Piscis',
];

const SYMBOLS = ['♈', '♉', '♊', '♋', '♌', '♍', '♎', '♏', '♐', '♑', '♒', '♓'];

// Day-of-year boundaries for tropical sun signs (Aries=0 .. Capricorn=11). Start of each sign.
const SUN_DOY_BOUNDS = [80, 110, 141, 172, 204, 235, 266, 296, 326, 356, 385, 415, 445];

function getDayOfYear(month: number, day: number): number {
  const days = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
  return days[month - 1] + day;
}

// Short descriptions per sign for Sol, Luna and Ascendente (in Spanish).
const SOL_DESCRIPTIONS: Record<string, string> = {
  Aries: 'Tu Sol en Aries marca una identidad de acción, valentía y liderazgo. Te impulsa a tomar la iniciativa y a defender lo que crees.',
  Tauro: 'Tu Sol en Tauro te conecta con la estabilidad, el placer sensorial y lo tangible. Buscas seguridad y belleza en lo que construyes.',
  Géminis: 'Tu Sol en Géminis destaca la comunicación, la curiosidad y la versatilidad. Tu mente ágil te lleva a conectar ideas y personas.',
  Cáncer: 'Tu Sol en Cáncer habla de sensibilidad, cuidado y raíces. Tu mundo emocional y tu hogar son centrales en tu manera de ser.',
  Leo: 'Tu Sol en Leo brilla en la creatividad, el reconocimiento y la generosidad. Te gusta aportar luz y calor a tu entorno.',
  Virgo: 'Tu Sol en Virgo se expresa en el servicio, el detalle y la mejora constante. Buscas ser útil y perfeccionar lo que tocas.',
  Libra: 'Tu Sol en Libra busca equilibrio, armonía y relaciones. La justicia y la belleza guían tu manera de relacionarte.',
  Escorpio: 'Tu Sol en Escorpio profundiza en lo intenso, lo transformador y lo oculto. Tienes capacidad de renovarte y de ver más allá.',
  Sagitario: 'Tu Sol en Sagitario expande con filosofía, viaje y búsqueda de sentido. Tu optimismo y tu sed de verdad te definen.',
  Capricornio: 'Tu Sol en Capricornio construye con responsabilidad, ambición y estructura. El tiempo y el esfuerzo son tus aliados.',
  Acuario: 'Tu Sol en Acuario innova con ideas, comunidad y visión de futuro. Tu identidad se vincula a lo colectivo y lo distinto.',
  Piscis: 'Tu Sol en Piscis fluye con la intuición, la compasión y lo artístico. Conectas con lo que está más allá de lo visible.',
};

const LUNA_DESCRIPTIONS: Record<string, string> = {
  Aries: 'Tu Luna en Aries necesita acción y autonomía. Las emociones se viven con intensidad y rapidez; te cuesta esperar.',
  Tauro: 'Tu Luna en Tauro busca calma y placer. Te nutres con rutinas, naturaleza y vínculos estables.',
  Géminis: 'Tu Luna en Géminis procesa las emociones hablando y conectando. La variedad y la información te calman.',
  Cáncer: 'Tu Luna en Cáncer está en su domicilio: las emociones y el hogar son el centro de tu mundo interior.',
  Leo: 'Tu Luna en Leo necesita ser vista y valorada. El afecto se expresa con calidez y creatividad.',
  Virgo: 'Tu Luna en Virgo se calma con orden y utilidad. Cuidas a los demás desde el detalle y el servicio.',
  Libra: 'Tu Luna en Libra busca armonía en las relaciones. El conflicto te desestabiliza; necesitas equilibrio y belleza.',
  Escorpio: 'Tu Luna en Escorpio siente todo con profundidad. Las emociones son intensas y a veces secretas.',
  Sagitario: 'Tu Luna en Sagitario busca sentido y libertad. El humor y la fe te ayudan a procesar lo que sientes.',
  Capricornio: 'Tu Luna en Capricornio se protege con estructura. Puedes parecer frío, pero tu compromiso es profundo.',
  Acuario: 'Tu Luna en Acuario necesita espacio y conexión con lo colectivo. Las emociones se viven con distancia y originalidad.',
  Piscis: 'Tu Luna en Piscis se funde con el otro y con lo invisible. La intuición y el arte te nutren.',
};

const ASCENDENTE_DESCRIPTIONS: Record<string, string> = {
  Aries: 'Con Ascendente en Aries proyectas energía, iniciativa y franqueza. Das la impresión de alguien seguro y decidido.',
  Tauro: 'Con Ascendente en Tauro transmites calma y presencia. Te perciben como alguien confiable y con los pies en la tierra.',
  Géminis: 'Con Ascendente en Géminis pareces ágil, curioso y comunicativo. La primera impresión es de ligereza y versatilidad.',
  Cáncer: 'Con Ascendente en Cáncer das una imagen sensible y protectora. Transmites cercanía y cuidado desde el primer contacto.',
  Leo: 'Con Ascendente en Leo tu presencia llama la atención. Proyectas confianza, calidez y un toque dramático.',
  Virgo: 'Con Ascendente en Virgo te ven ordenado y útil. La primera impresión es de discreción y competencia.',
  Libra: 'Con Ascendente en Libra causas buena impresión: amabilidad, equilibrio y gusto por la armonía se notan al instante.',
  Escorpio: 'Con Ascendente en Escorpio proyectas intensidad y misterio. Tu mirada y tu presencia dejan huella.',
  Sagitario: 'Con Ascendente en Sagitario transmites optimismo y apertura. Pareces alguien que busca aprender y explorar.',
  Capricornio: 'Con Ascendente en Capricornio das una imagen seria y responsable. Te perciben como alguien en quien confiar.',
  Acuario: 'Con Ascendente en Acuario pareces original y desapegado. La primera impresión es de libertad e ideas propias.',
  Piscis: 'Con Ascendente en Piscis proyectas suavidad e intuición. Transmites empatía y un aura algo evasiva.',
};

export interface BirthChartPreviewDto {
  birthDate: string;  // YYYY-MM-DD
  birthTime: string;  // HH:mm
  birthPlace: string;
}

export interface SignResult {
  sign: string;
  symbol: string;
  description: string;
}

export interface BirthChartPreviewResult {
  sun: SignResult;
  moon: SignResult;
  ascendant: SignResult;
}

@Injectable()
export class BirthChartService {
  getSunSign(_year: number, month: number, day: number): number {
    let doy = getDayOfYear(month, day);
    if (month <= 2) doy += 365;
    for (let i = 0; i < 12; i++) {
      if (doy >= SUN_DOY_BOUNDS[i] && doy < SUN_DOY_BOUNDS[i + 1]) return i;
    }
    return 0;
  }

  /** Approximate moon sign from date and time (simplified lunar cycle ~29.5 days). */
  getMoonSign(year: number, month: number, day: number, hour: number, minute: number): number {
    const date = new Date(year, month - 1, day, hour, minute, 0);
    const epoch = new Date(2000, 0, 6, 18, 14, 0); // known new moon
    const days = (date.getTime() - epoch.getTime()) / (1000 * 60 * 60 * 24);
    const lunarLongitude = (days * 13.176) % 360;
    const signIndex = Math.floor((lunarLongitude + 360) % 360 / 30) % 12;
    return signIndex;
  }

  /** Approximate ascendant sign from local time (≈2h per sign). */
  getAscendantSign(hour: number, minute: number): number {
    const totalHours = hour + minute / 60;
    const signIndex = Math.floor((totalHours / 2) % 12);
    return signIndex < 0 ? signIndex + 12 : signIndex;
  }

  getPreview(dto: BirthChartPreviewDto): BirthChartPreviewResult {
    const [y, m, d] = dto.birthDate.split('-').map(Number);
    const [h, min] = dto.birthTime.split(':').map(Number);

    const sunIndex = this.getSunSign(y, m, d);
    const moonIndex = this.getMoonSign(y, m, d, h ?? 12, min ?? 0);
    const ascIndex = this.getAscendantSign(h ?? 12, min ?? 0);

    const sunSign = SIGNS_ES[sunIndex];
    const moonSign = SIGNS_ES[moonIndex];
    const ascSign = SIGNS_ES[ascIndex];

    return {
      sun: {
        sign: sunSign,
        symbol: SYMBOLS[sunIndex],
        description: SOL_DESCRIPTIONS[sunSign] ?? '',
      },
      moon: {
        sign: moonSign,
        symbol: SYMBOLS[moonIndex],
        description: LUNA_DESCRIPTIONS[moonSign] ?? '',
      },
      ascendant: {
        sign: ascSign,
        symbol: SYMBOLS[ascIndex],
        description: ASCENDENTE_DESCRIPTIONS[ascSign] ?? '',
      },
    };
  }
}
