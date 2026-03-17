/**
 * Database seeder. Run with: npm run seed (from backend folder)
 * All seeded users (admins and clients) use password: password123
 */
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const DEFAULT_PASSWORD = 'password123';
const SIGNS_ES = [
  'Aries', 'Tauro', 'Géminis', 'Cáncer', 'Leo', 'Virgo',
  'Libra', 'Escorpio', 'Sagitario', 'Capricornio', 'Acuario', 'Piscis',
];

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

async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

async function main() {
  const hashedPassword = await hashPassword(DEFAULT_PASSWORD);

  // ——— Admins ———
  const admin1 = await prisma.user.upsert({
    where: { email: 'admin@astar.com' },
    update: {},
    create: {
      email: 'admin@astar.com',
      name: 'Admin Principal',
      passwordHash: hashedPassword,
      role: 'admin',
      isActive: true,
      subscriptionStatus: 'active',
    },
  });

  const admin2 = await prisma.user.upsert({
    where: { email: 'maria@astar.com' },
    update: {},
    create: {
      email: 'maria@astar.com',
      name: 'María García',
      passwordHash: hashedPassword,
      role: 'admin',
      isActive: true,
      subscriptionStatus: 'active',
    },
  });

  console.log('Admins created:', admin1.email, admin2.email);

  // ——— Birth chart interpretations (based on currently hardcoded content) ———
  for (const sign of SIGNS_ES) {
    await prisma.birthChartInterpretation.upsert({
      where: {
        type_sign: {
          type: 'sun',
          sign,
        },
      },
      update: {
        description: SOL_DESCRIPTIONS[sign] ?? '',
      },
      create: {
        type: 'sun',
        sign,
        description: SOL_DESCRIPTIONS[sign] ?? '',
      },
    });
    await prisma.birthChartInterpretation.upsert({
      where: {
        type_sign: {
          type: 'moon',
          sign,
        },
      },
      update: {
        description: LUNA_DESCRIPTIONS[sign] ?? '',
      },
      create: {
        type: 'moon',
        sign,
        description: LUNA_DESCRIPTIONS[sign] ?? '',
      },
    });
    await prisma.birthChartInterpretation.upsert({
      where: {
        type_sign: {
          type: 'ascendant',
          sign,
        },
      },
      update: {
        description: ASCENDENTE_DESCRIPTIONS[sign] ?? '',
      },
      create: {
        type: 'ascendant',
        sign,
        description: ASCENDENTE_DESCRIPTIONS[sign] ?? '',
      },
    });
  }
  console.log('Birth chart interpretations upserted:', SIGNS_ES.length * 3);

  // ——— Clients (many) ———
  const clientsData = [
    { email: 'ana.lopez@email.com', name: 'Ana López', birthDate: '1992-03-15', birthPlace: 'Madrid, España', birthTime: '08:30', subscriptionStatus: 'active' as const },
    { email: 'carlos.martin@email.com', name: 'Carlos Martín', birthDate: '1988-07-22', birthPlace: 'Barcelona, España', birthTime: '14:00', subscriptionStatus: 'active' as const },
    { email: 'lucia.fernandez@email.com', name: 'Lucía Fernández', birthDate: '1995-11-08', birthPlace: 'Valencia, España', birthTime: '06:45', subscriptionStatus: 'active' as const },
    { email: 'pablo.sanchez@email.com', name: 'Pablo Sánchez', birthDate: '1985-01-30', birthPlace: 'Sevilla, España', birthTime: '18:20', subscriptionStatus: 'inactive' as const },
    { email: 'elena.rodriguez@email.com', name: 'Elena Rodríguez', birthDate: '1990-05-12', birthPlace: 'Buenos Aires, Argentina', birthTime: '12:00', subscriptionStatus: 'active' as const },
    { email: 'diego.gonzalez@email.com', name: 'Diego González', birthDate: '1982-09-25', birthPlace: 'Ciudad de México, México', birthTime: '22:15', subscriptionStatus: 'cancelled' as const },
    { email: 'sofia.ramirez@email.com', name: 'Sofía Ramírez', birthDate: '1998-02-14', birthPlace: 'Lima, Perú', birthTime: '09:00', subscriptionStatus: 'active' as const },
    { email: 'javier.torres@email.com', name: 'Javier Torres', birthDate: '1979-12-03', birthPlace: 'Santiago, Chile', birthTime: '07:30', subscriptionStatus: 'active' as const },
    { email: 'isabel.moreno@email.com', name: 'Isabel Moreno', birthDate: '1993-06-18', birthPlace: 'Bogotá, Colombia', birthTime: '16:45', subscriptionStatus: 'inactive' as const },
    { email: 'andres.herrera@email.com', name: 'Andrés Herrera', birthDate: '1987-04-09', birthPlace: 'Quito, Ecuador', birthTime: '11:20', subscriptionStatus: 'active' as const },
    { email: 'carmen.diaz@email.com', name: 'Carmen Díaz', birthDate: '1991-10-27', birthPlace: 'Córdoba, Argentina', birthTime: '05:50', subscriptionStatus: 'active' as const },
    { email: 'miguel.ruiz@email.com', name: 'Miguel Ruiz', birthDate: '1984-08-11', birthPlace: 'Montevideo, Uruguay', birthTime: '13:10', subscriptionStatus: 'cancelled' as const },
    { email: 'laura.vargas@email.com', name: 'Laura Vargas', birthDate: '1996-01-05', birthPlace: 'Medellín, Colombia', birthTime: '20:00', subscriptionStatus: 'active' as const },
    { email: 'ricardo.castro@email.com', name: 'Ricardo Castro', birthDate: '1976-03-28', birthPlace: 'Caracas, Venezuela', birthTime: '10:30', subscriptionStatus: 'inactive' as const },
    { email: 'patricia.ortiz@email.com', name: 'Patricia Ortiz', birthDate: '1989-12-21', birthPlace: 'La Paz, Bolivia', birthTime: '15:45', subscriptionStatus: 'active' as const },
    { email: 'fernando.silva@email.com', name: 'Fernando Silva', birthDate: '1994-07-07', birthPlace: 'Asunción, Paraguay', birthTime: '08:00', subscriptionStatus: 'active' as const },
    { email: 'natalia.mendoza@email.com', name: 'Natalia Mendoza', birthDate: '1980-11-16', birthPlace: 'San José, Costa Rica', birthTime: '19:20', subscriptionStatus: 'active' as const },
    { email: 'roberto.guerrero@email.com', name: 'Roberto Guerrero', birthDate: '1992-02-29', birthPlace: 'Panamá City, Panamá', birthTime: '06:00', subscriptionStatus: 'inactive' as const },
  ];

  const clients: { id: string; email: string }[] = [];
  for (const c of clientsData) {
    const user = await prisma.user.upsert({
      where: { email: c.email },
      update: {},
      create: {
        email: c.email,
        name: c.name,
        passwordHash: hashedPassword,
        role: 'client',
        isActive: true,
        subscriptionStatus: c.subscriptionStatus,
        birthDate: c.birthDate,
        birthPlace: c.birthPlace,
        birthTime: c.birthTime,
      },
    });
    clients.push({ id: user.id, email: user.email });
  }
  console.log('Clients created:', clients.length);

  // ——— Reports: many variants (birth_chart, solar_return, numerology, lunar, etc.) ———
  const birthChartContents = [
    JSON.stringify([{ id: 'sun', title: 'Sol en Escorpio — Casa VIII', content: 'Tu esencia se expresa a través de la transformación profunda. Poder interior magnético y capacidad de regeneración.' }, { id: 'moon', title: 'Luna en Piscis — Casa IV', content: 'Emociones oceánicas, mundo interior vasto. Hogar emocional rico en imaginación.' }, { id: 'asc', title: 'Ascendente en Leo', content: 'Te presentas con calidez, creatividad y presencia. Magnetismo natural.' }]),
    JSON.stringify([{ id: 'sun', title: 'Sol en Aries — Casa I', content: 'Energía pionera y liderazgo. Tu identidad se expresa con valentía y dinamismo.' }, { id: 'moon', title: 'Luna en Cáncer — Casa IV', content: 'Emociones profundamente ligadas al hogar y la familia. Necesidad de seguridad emocional.' }, { id: 'asc', title: 'Ascendente en Sagitario', content: 'Optimismo y búsqueda de sentido. Te muestras abierto y filosófico.' }]),
    JSON.stringify([{ id: 'sun', title: 'Sol en Libra — Casa VII', content: 'El equilibrio y las relaciones son centrales. Diplomacia y sentido estético.' }, { id: 'moon', title: 'Luna en Tauro — Casa II', content: 'Estabilidad emocional a través de lo material y los sentidos.' }, { id: 'asc', title: 'Ascendente en Acuario', content: 'Originalidad y visión de futuro. Te presentas como innovador.' }]),
  ];
  const solarReturnContents = [
    JSON.stringify({ theme: { title: 'Transformación y Redefinición', subtitle: 'Año de consolidación emocional.' }, sections: [{ id: 'career', title: 'Carrera', content: 'Sol RS en Casa V con Saturno en Casa X. Creatividad y logros profesionales.' }, { id: 'love', title: 'Amor', content: 'Venus RS en Casa VII. Profundización en vínculos.' }] }),
    JSON.stringify({ theme: { title: 'Expansión y Oportunidades', subtitle: 'Júpiter favorece crecimiento.' }, sections: [{ id: 'money', title: 'Recursos', content: 'Casa II activada. Revisión de valores y abundancia.' }, { id: 'health', title: 'Salud', content: 'Casa VI en foco. Hábitos y servicio.' }] }),
    JSON.stringify({ theme: { title: 'Comunicación y Redes', subtitle: 'Mercurio y Casa III destacados.' }, sections: [{ id: 'study', title: 'Estudio', content: 'Ideal para formación y viajes cortos.' }, { id: 'siblings', title: 'Entorno cercano', content: 'Vínculos con hermanos o vecinos se activan.' }] }),
  ];
  const numerologyContents = [
    JSON.stringify({ numbers: [{ number: '7', label: 'Camino de Vida', desc: 'Introspección' }, { number: '3', label: 'Expresión', desc: 'Creatividad' }, { number: '9', label: 'Año Personal', desc: 'Cierre de ciclos' }], interpretations: [{ id: 'path', title: 'Camino de Vida', content: 'Buscador natural, mente analítica.' }, { id: 'year', title: 'Año Actual', content: 'Soltar lo que ya no resuena.' }] }),
    JSON.stringify({ numbers: [{ number: '1', label: 'Camino de Vida', desc: 'Liderazgo' }, { number: '5', label: 'Expresión', desc: 'Libertad' }, { number: '4', label: 'Año Personal', desc: 'Estructura' }], interpretations: [{ id: 'path', title: 'Camino de Vida', content: 'Pionero, independiente.' }, { id: 'year', title: 'Año Actual', content: 'Construcción y disciplina.' }] }),
    JSON.stringify({ numbers: [{ number: '6', label: 'Camino de Vida', desc: 'Servicio' }, { number: '2', label: 'Expresión', desc: 'Cooperación' }, { number: '8', label: 'Año Personal', desc: 'Abundancia' }], interpretations: [{ id: 'path', title: 'Camino de Vida', content: 'Responsabilidad y amor.' }, { id: 'year', title: 'Año Actual', content: 'Materialización y poder personal.' }] }),
  ];

  const reportTitlesByType: Record<string, string[]> = {
    birth_chart: ['Carta Natal', 'Carta Natal Completa', 'Mapa Astral de Nacimiento'],
    solar_return: ['Revolución Solar 2026', 'Revolución Solar 2025', 'Revolución Solar Anual'],
    numerology: ['Numerología Personal', 'Análisis Numerológico', 'Números de Vida'],
    lunar: ['Informe Lunar Mensual', 'Fases Lunares y Tu Carta', 'Luna y Emociones'],
    transits: ['Tránsitos del Mes', 'Tránsitos 2026', 'Planetas en Movimiento'],
  };

  let reportCount = 0;
  for (const client of clients) {
    for (let r = 0; r < 5; r++) {
      const type = ['birth_chart', 'solar_return', 'numerology', 'lunar', 'transits'][r];
      const titles = reportTitlesByType[type] || [type];
      const content =
        type === 'birth_chart'
          ? birthChartContents[reportCount % birthChartContents.length]
          : type === 'solar_return'
            ? solarReturnContents[reportCount % solarReturnContents.length]
            : type === 'numerology'
              ? numerologyContents[reportCount % numerologyContents.length]
              : type === 'lunar'
                ? JSON.stringify({ title: 'Informe Lunar', sections: [{ id: '1', title: 'Luna en signos', content: 'La Luna transita y afecta tus emociones según tu carta.' }] })
                : JSON.stringify({ title: 'Tránsitos', sections: [{ id: '1', title: 'Planetas', content: 'Mercurio, Venus y Marte en movimiento este mes.' }] });
      await prisma.report.create({
        data: {
          userId: client.id,
          type,
          title: titles[reportCount % titles.length],
          content,
        },
      });
      reportCount++;
    }
  }
  console.log('Reports created:', reportCount);

  // ——— Messages ———
  const months = ['Enero 2026', 'Febrero 2026', 'Marzo 2026', 'Abril 2026', 'Mayo 2026'];
  const monthlyContents = [
    'El Sol en Capricornio ilumina tu Casa II. Foco en recursos y autoestima.',
    'Venus entra en tu Casa VII. Relaciones más armónicas.',
    'Marte transita tu Casa X. Acción en la carrera.',
    'Júpiter en tu Casa IX. Expansión y viajes.',
    'Saturno y la estructura. Momento de consolidar.',
  ];
  const questionContents = [
    '¿Es buen momento para cambiar de trabajo?',
    '¿Cómo mejorar mi relación con el dinero?',
    '¿Qué indica Júpiter para este año?',
    '¿Debo mudarme según mi carta?',
    '¿Cuándo es favorable para emprender?',
  ];
  const answerContents = [
    'Júpiter en Casa VI indica expansión en el trabajo diario. Crece donde estás.',
    'Casa II activada: revisa creencias sobre el merecimiento.',
    'El tránsito de Júpiter favorece estudio y visión a largo plazo.',
    'Mercurio en Casa IV sugiere reflexión sobre el hogar.',
    'Venus en Casa X favorece imagen profesional. Aprovecha.',
  ];

  let messageCount = 0;
  for (let i = 0; i < clients.length; i++) {
    const client = clients[i];
    for (let m = 0; m < 5; m++) {
      const month = months[m];
      const idx = (i + m) % 5;
      await prisma.message.create({
        data: {
          userId: client.id,
          type: 'monthly',
          content: monthlyContents[idx],
          monthLabel: month,
        },
      });
      messageCount++;
      await prisma.message.create({
        data: {
          userId: client.id,
          type: 'question',
          content: questionContents[idx],
          monthLabel: month,
        },
      });
      messageCount++;
      await prisma.message.create({
        data: {
          userId: client.id,
          type: 'answer',
          content: answerContents[idx],
          monthLabel: month,
        },
      });
      messageCount++;
    }
  }
  console.log('Messages created:', messageCount);

  // ——— Notifications ———
  const notifTemplates = [
    { title: 'Tu reporte lunar está listo', body: 'Nuevo análisis disponible.', category: 'reporte', read: false },
    { title: 'Oferta especial', body: '20% de descuento en Revolución Solar.', category: 'oferta', read: true },
    { title: 'Recordatorio de renovación', body: 'Tu suscripción se renueva en 5 días.', category: 'suscripción', read: false },
    { title: 'Nuevo mensaje recibido', body: 'Respuesta a tu consulta.', category: 'mensaje', read: false },
    { title: 'Bienvenido a Astar', body: 'Tu cuenta está activa.', category: 'sistema', read: true },
    { title: 'Mensaje mensual disponible', body: 'Tu mensaje astrológico del mes.', category: 'mensaje', read: false },
  ];
  let notifCount = 0;
  for (const client of clients) {
    for (const t of notifTemplates) {
      await prisma.notification.create({
        data: { userId: client.id, title: t.title, body: t.body, category: t.category, read: t.read },
      });
      notifCount++;
    }
  }
  console.log('Notifications created:', notifCount);

  // ——— Blog: many posts ———
  const blogPosts = [
    { title: 'Introducción a la Astrología Moderna', status: 'published', content: 'La astrología moderna combina tradición y psicología. En este artículo exploramos cómo leer tu carta natal como un mapa de potenciales y desafíos. Los signos, las casas y los planetas forman un lenguaje simbólico que puede iluminar tu camino.' },
    { title: 'La Luna y las Emociones', status: 'published', content: 'La Luna en la carta natal representa nuestras necesidades emocionales, la madre, el hogar interior y cómo nos nutrimos. Según el signo y la casa en que se encuentre, revela patrones profundos de reacción emocional.' },
    { title: 'Revolución Solar: Tu Año Personal', status: 'published', content: 'Cada año, cuando el Sol vuelve a la posición exacta que tenía en tu nacimiento, se levanta una carta llamada Revolución Solar. Esta carta describe los temas del año que comienza: trabajo, amor, salud, viajes.' },
    { title: 'Numerología y Camino de Vida', status: 'published', content: 'Tu número de camino de vida se calcula a partir de tu fecha de nacimiento. Reduce el día, mes y año a un solo dígito (o números maestros 11, 22, 33). Ese número describe tu misión y tus dones.' },
    { title: 'Mercurio Retrógrado: Guía Práctica', status: 'published', content: 'Mercurio retrógrado ocurre varias veces al año. Se asocia con retrasos en comunicaciones, viajes y tecnología. En lugar de temerlo, podemos usarlo para revisar, reescribir y reconectar.' },
    { title: 'Venus en los Signos', status: 'published', content: 'Venus rige el amor, el dinero, la belleza y los valores. Según el signo en que esté en tu carta, muestra cómo amas, qué te atrae y cómo te relacionas con el placer y la armonía.' },
    { title: 'Marte: Acción y Deseo', status: 'published', content: 'Marte representa la energía, la iniciativa, la ira sana y el deseo. Su signo y casa en tu carta natal muestran cómo actúas bajo presión y qué te impulsa a moverte.' },
    { title: 'Las Casas Astrológicas', status: 'published', content: 'Las doce casas representan áreas de la vida: identidad, recursos, comunicación, hogar, creatividad, trabajo, pareja, transformación, filosofía, carrera, amistades y el inconsciente. Cada planeta en una casa colorea esa área.' },
    { title: 'Eclipses y Cambios', status: 'published', content: 'Los eclipses suelen marcar momentos de cambio o revelación. Lunar y solar actúan de forma distinta. Te explicamos cómo interpretarlos en tu carta y en tránsito.' },
    { title: 'Saturno: Estructura y Karma', status: 'published', content: 'Saturno simboliza la disciplina, los límites, el tiempo y las lecciones kármicas. Su paso por signos y casas puede sentirse pesado, pero construye bases sólidas cuando lo trabajamos.' },
    { title: 'Júpiter: Expansión y Oportunidad', status: 'published', content: 'Júpiter trae crecimiento, optimismo y oportunidades. Donde está Júpiter en tránsito o en tu carta, hay potencial de ampliar horizontes, estudiar o viajar.' },
    { title: 'Plutón y la Transformación', status: 'published', content: 'Plutón rige la muerte simbólica y el renacimiento. Su tránsito por un signo o casa puede ser intenso: destruye lo que ya no sirve para que nazca algo más auténtico.' },
    { title: 'Nodos Lunares: Camino del Alma', status: 'published', content: 'El Nodo Norte y el Nodo Sur marcan un eje de desarrollo. El Sur es la herencia y la zona de confort; el Norte es la dirección de crecimiento. Interpretar este eje da claves kármicas.' },
    { title: 'Astrología y Psicología', status: 'draft', content: 'Carl Jung y otros psicólogos han usado la astrología como mapa del inconsciente. Exploramos los puentes entre ambos lenguajes.' },
    { title: 'Próximo: Tránsitos de 2027', status: 'draft', content: 'Avance del próximo año astrológico. Contenido en preparación.' },
  ];
  for (const post of blogPosts) {
    await prisma.blogPost.create({
      data: { title: post.title, status: post.status, content: post.content },
    });
  }
  console.log('Blog posts created:', blogPosts.length);

  // ——— Base de conocimiento: categories + many entries ———
  const knowledgeCategories = [
    'Símbolos del Zodíaco',
    'Planetas',
    'Casas Astrológicas',
    'Aspectos',
    'Significadores Clásicos',
    'Interpretación General',
  ];
  const categoryEntries: Record<string, string[]> = {
    'Símbolos del Zodíaco': [
      'Aries: iniciativa, impulso, liderazgo, fuego cardinal.',
      'Tauro: estabilidad, recursos, sensualidad, tierra fija.',
      'Géminis: comunicación, curiosidad, dualidad, aire mutable.',
      'Cáncer: emociones, hogar, protección, agua cardinal.',
      'Leo: creatividad, corazón, reconocimiento, fuego fijo.',
      'Virgo: servicio, análisis, salud, tierra mutable.',
      'Libra: equilibrio, pareja, belleza, aire cardinal.',
      'Escorpio: transformación, poder, tabú, agua fija.',
      'Sagitario: filosofía, viajes, verdad, fuego mutable.',
      'Capricornio: estructura, ambición, tiempo, tierra cardinal.',
      'Acuario: innovación, grupo, libertad, aire fijo.',
      'Piscis: disolución, compasión, arte, agua mutable.',
    ],
    'Planetas': [
      'Sol: identidad, vitalidad, padre, ego consciente.',
      'Luna: emociones, madre, hogar, inconsciente.',
      'Mercurio: mente, comunicación, comercio, hermanos.',
      'Venus: amor, dinero, belleza, valores.',
      'Marte: acción, deseo, ira, iniciativa.',
      'Júpiter: expansión, suerte, filosofía, ley.',
      'Saturno: límites, disciplina, tiempo, estructura.',
      'Urano: cambio súbito, innovación, rebeldía.',
      'Neptuno: idealismo, ilusión, arte, espiritualidad.',
      'Plutón: poder, transformación, muerte y renacimiento.',
    ],
    'Casas Astrológicas': [
      'Casa I: identidad, cuerpo, forma de aparecer.',
      'Casa II: recursos, valores, posesiones.',
      'Casa III: comunicación, hermanos, viajes cortos.',
      'Casa IV: hogar, raíces, madre, final de vida.',
      'Casa V: creatividad, hijos, placer, juego.',
      'Casa VI: trabajo, salud, servicio, rutinas.',
      'Casa VII: pareja, socios, enemigos declarados.',
      'Casa VIII: transformación, muerte, recursos ajenos, sexo.',
      'Casa IX: filosofía, viajes largos, ley, educación superior.',
      'Casa X: carrera, madre/padre simbólico, reputación.',
      'Casa XI: amistades, grupos, proyectos futuros.',
      'Casa XII: inconsciente, sacrificio, karma, enemigos ocultos.',
    ],
    'Aspectos': [
      'Conjunción: fusión de energías, énfasis.',
      'Oposición: tensión entre dos polos, proyección.',
      'Trígono: fluidez, talento natural, armonía.',
      'Cuadratura: fricción, desafío, motor de acción.',
      'Sextil: oportunidad, apoyo, conexión.',
      'Quincuncio: ajuste incómodo, necesidad de adaptación.',
    ],
    'Significadores Clásicos': [
      'Sol/Luna: padre/madre, consciencia/inconsciente.',
      'Mercurio: contratos, estudios, vecinos.',
      'Venus: matrimonio, ingresos por arte o belleza.',
      'Marte: conflictos, cirugía, deporte.',
      'Júpiter: jueces, profesores, viajes largos.',
      'Saturno: ancianos, responsabilidad, pérdidas.',
    ],
    'Interpretación General': [
      'Siempre considerar signo, casa y aspectos de un planeta.',
      'Los ángulos (Asc, MC, Desc, IC) son puntos sensibles.',
      'Retrogradación invita a revisar el tema del planeta.',
      'Los nodos lunares dan eje kármico de desarrollo.',
      'Los eclipses activan casas y planetas por contacto.',
    ],
  };

  for (const catTitle of knowledgeCategories) {
    const cat = await prisma.knowledgeCategory.create({
      data: { title: catTitle },
    });
    const entries = categoryEntries[catTitle] || [];
    for (const entryContent of entries) {
      await prisma.knowledgeEntry.create({
        data: { categoryId: cat.id, content: entryContent },
      });
    }
  }
  const totalEntries = Object.values(categoryEntries).reduce((s, arr) => s + arr.length, 0);
  console.log('Knowledge base: categories', knowledgeCategories.length, ', entries', totalEntries);

  // ——— Pedidos (Orders): many per client ———
  const orderTypes = ['suscripción', 'pregunta_extra', 'revolución_solar', 'carta_natal', 'sesión_privada', 'pack_mensual'];
  const orderAmounts = ['29 USD', '9 USD', '49 USD', '39 USD', '89 USD', '19 USD'];
  const orderMethods = ['tarjeta', 'PayPal', 'transferencia', 'tarjeta', 'PayPal', 'tarjeta'];
  let orderCount = 0;
  const now = new Date();
  for (const client of clients) {
    const numOrders = 3 + (orderCount % 5);
    for (let o = 0; o < numOrders; o++) {
      const idx = (orderCount + o) % orderTypes.length;
      const createdAt = new Date(now);
      createdAt.setDate(createdAt.getDate() - orderCount * 7 - o * 2);
      await prisma.order.create({
        data: {
          userId: client.id,
          type: orderTypes[idx],
          amount: orderAmounts[idx],
          method: orderMethods[idx],
          createdAt,
        },
      });
      orderCount++;
    }
  }
  console.log('Orders created:', orderCount);

  // ——— Preguntas (Questions): many per client ———
  const questionTexts = [
    '¿Es buen momento para cambiar de trabajo? Siento que necesito un cambio.',
    '¿Cómo puedo mejorar mi relación con el dinero según mi carta natal?',
    '¿Qué me indica el tránsito de Júpiter para este año?',
    '¿Debo mudarme? ¿Qué ciudad favorece mi carta?',
    '¿Cuándo es favorable para emprender un proyecto propio?',
    '¿Hay indicadores de pareja estable en mi carta?',
    '¿Qué significa mi Luna en Escorpio en Casa VIII?',
    '¿Cómo trabajar mi Saturno en la Casa VII?',
    '¿Los eclipses de este año me afectan mucho?',
    '¿Puedo confiar en un socio según nuestra sinastría?',
    '¿Qué carrera me conviene según mi MC y Saturno?',
    '¿Cómo manejar la ansiedad según mi carta?',
    '¿Mi hijo tiene una carta muy difícil? ¿Cómo apoyarlo?',
    '¿El retorno de Saturno qué implica para mí?',
    '¿Qué número de camino de vida tengo y qué significa?',
  ];
  const statuses: Array<'new' | 'waiting' | 'answered'> = ['new', 'waiting', 'answered', 'answered', 'answered'];
  let questionCount = 0;
  for (const client of clients) {
    const numQuestions = 2 + (questionCount % 4);
    for (let q = 0; q < numQuestions; q++) {
      const status = statuses[(questionCount + q) % statuses.length];
      await prisma.question.create({
        data: {
          userId: client.id,
          question: questionTexts[(questionCount + q) % questionTexts.length],
          status,
        },
      });
      questionCount++;
    }
  }
  console.log('Questions created:', questionCount);

  console.log('Seed completed successfully.');
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
