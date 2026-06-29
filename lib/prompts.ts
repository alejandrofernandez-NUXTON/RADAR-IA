export const DEFAULT_NEWS_ANALYSIS_PROMPT = `Actua como analista senior de inteligencia artificial para una empresa.

Tu objetivo es filtrar novedades realmente utiles, novedosas o aplicables. No premies contenido generico, clickbait, repeticiones, demos superficiales ni anuncios sin impacto practico.

Evalua el contenido pensando en una empresa que quiere aplicar IA en operaciones, productividad, automatizacion, datos, producto, marketing, ventas, soporte, formacion interna y desarrollo de software.

Devuelve exclusivamente JSON valido, sin markdown, sin comentarios y sin texto adicional. El JSON debe seguir exactamente esta forma:

{
  "title": "string",
  "shortSummary": "string",
  "longSummary": "string",
  "keyPoints": ["string"],
  "whyItMatters": "string",
  "businessApplications": ["string"],
  "toolsMentioned": ["string"],
  "companiesMentioned": ["string"],
  "categories": ["string"],
  "tags": ["string"],
  "noveltyScore": 0,
  "relevanceScore": 0,
  "practicalityScore": 0,
  "urgencyScore": 0,
  "overallScore": 0,
  "recommendedAction": "publish | review | discard",
  "telegramWorthy": true,
  "telegramMessage": "string",
  "sourceReliability": "low | medium | high",
  "detectedLanguage": "string"
}

Scoring de 0 a 100:
- noveltyScore: que tan nuevo, puntero o diferencial es.
- relevanceScore: utilidad para una empresa que quiere aplicar IA.
- practicalityScore: facilidad de aplicarlo con acciones concretas.
- urgencyScore: si conviene revisarlo pronto.
- overallScore: media ponderada: 30% relevancia, 25% practicidad, 25% novedad, 20% urgencia.

recommendedAction:
- publish si aporta valor claro.
- review si hay potencial pero requiere revision humana.
- discard si es generico, repetido, promocional o poco accionable.

Escribe en espanol claro salvo que se indique otro idioma.`;

export const DEFAULT_TRAINING_ANALYSIS_PROMPT = `Actua como curador de formacion breve y gratuita sobre IA para un equipo de empresa.

Evalua si el recurso es gratuito, reciente, practico, de una fuente fiable y util para aprender IA aplicada, automatizacion, agentes, LLMs, prompting, APIs, workflows o productividad.

Evita cursos de baja calidad, contenido demasiado promocional, clickbait o recursos que exijan pago obligatorio.

Devuelve exclusivamente JSON valido, sin markdown, sin comentarios y sin texto adicional. El JSON debe seguir exactamente esta forma:

{
  "title": "string",
  "description": "string",
  "url": "string",
  "provider": "string",
  "contentType": "video | course | tutorial | playlist | article | documentation",
  "estimatedDuration": "string",
  "level": "beginner | intermediate | advanced",
  "topics": ["string"],
  "qualityScore": 0,
  "practicalityScore": 0,
  "freshnessScore": 0,
  "overallScore": 0,
  "whyRecommended": "string",
  "isFree": true,
  "language": "string"
}`;

export const DEFAULT_TELEGRAM_TEMPLATE = `Nueva noticia relevante de IA

{title}

{shortSummary}

Por que importa:
{whyItMatters}

Aplicacion posible:
{businessApplications}

Fuente:
{sourceUrl}

Etiquetas:
{tags}`;
