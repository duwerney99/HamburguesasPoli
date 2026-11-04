from pathlib import Path
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, PageBreak, Table, TableStyle,
    KeepTogether, Preformatted, ListFlowable, ListItem
)
from reportlab.pdfgen import canvas
from pypdf import PdfReader, PdfWriter
from io import BytesIO

ROOT = Path(r"C:\Users\NUVA\Documents\documentos hamburguesas poli")
TMP = ROOT / "tmp" / "architecture_activity"
OUT = ROOT / "output" / "pdf"
SRC = Path(r"C:\Users\NUVA\Downloads\Estilos arquitectónicos y selección justificada — Secret Bite Web (Parte 1).pdf")
TMP.mkdir(parents=True, exist_ok=True)
OUT.mkdir(parents=True, exist_ok=True)

PAGE_W, PAGE_H = letter
NAVY = colors.HexColor("#17365D")
BLUE = colors.HexColor("#DCE6F1")
PALE = colors.HexColor("#F4F7FA")
GRAY = colors.HexColor("#666666")
GRID = colors.HexColor("#D9D9D9")
RED = colors.HexColor("#9C2F2F")

styles = getSampleStyleSheet()
styles.add(ParagraphStyle(name="DocTitle", parent=styles["Title"], fontName="Helvetica-Bold", fontSize=20, leading=25, textColor=colors.black, alignment=TA_CENTER, spaceAfter=16))
styles.add(ParagraphStyle(name="Subtitle", parent=styles["Normal"], fontName="Helvetica", fontSize=12, leading=18, textColor=colors.black, alignment=TA_CENTER, spaceAfter=10))
styles.add(ParagraphStyle(name="H1x", parent=styles["Heading1"], fontName="Helvetica-Bold", fontSize=15, leading=19, textColor=colors.black, spaceBefore=14, spaceAfter=8, keepWithNext=True))
styles.add(ParagraphStyle(name="H2x", parent=styles["Heading2"], fontName="Helvetica-Bold", fontSize=12.5, leading=16, textColor=colors.black, spaceBefore=11, spaceAfter=6, keepWithNext=True))
styles.add(ParagraphStyle(name="Bodyx", parent=styles["BodyText"], fontName="Helvetica", fontSize=11.2, leading=16.8, textColor=colors.black, spaceAfter=8, alignment=TA_LEFT))
styles.add(ParagraphStyle(name="Smallx", parent=styles["BodyText"], fontName="Helvetica", fontSize=9, leading=12, textColor=colors.black, spaceAfter=4))
styles.add(ParagraphStyle(name="Captionx", parent=styles["BodyText"], fontName="Helvetica-Oblique", fontSize=9.5, leading=13, textColor=GRAY, alignment=TA_CENTER, spaceBefore=5, spaceAfter=10))
styles.add(ParagraphStyle(name="Codex", parent=styles["Code"], fontName="Courier", fontSize=7.7, leading=10, leftIndent=8, rightIndent=8, spaceBefore=5, spaceAfter=8, backColor=PALE, borderPadding=6))


def P(text, style="Bodyx"):
    return Paragraph(text, styles[style])


def bullet_items(items):
    return ListFlowable([ListItem(P(item), leftIndent=12) for item in items], bulletType="bullet", leftIndent=22, bulletFontName="Helvetica", bulletFontSize=8, spaceAfter=8)


def table(data, widths, header=True, font=8.2):
    prepared = []
    for row in data:
        prepared.append([cell if hasattr(cell, "wrap") else Paragraph(str(cell), styles["Smallx"]) for cell in row])
    t = Table(prepared, colWidths=widths, repeatRows=1 if header else 0, hAlign="CENTER")
    commands = [
        ("GRID", (0, 0), (-1, -1), 0.5, GRID),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("FONTNAME", (0, 0), (-1, -1), "Helvetica"),
        ("FONTSIZE", (0, 0), (-1, -1), font),
    ]
    if header:
        commands += [("BACKGROUND", (0, 0), (-1, 0), NAVY), ("TEXTCOLOR", (0, 0), (-1, 0), colors.white), ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold")]
        for i in range(1, len(data)):
            if i % 2 == 0:
                commands.append(("BACKGROUND", (0, i), (-1, i), PALE))
    t.setStyle(TableStyle(commands))
    return t


def footer(canvas_obj, doc):
    canvas_obj.saveState()
    canvas_obj.setFont("Helvetica", 8)
    canvas_obj.setFillColor(GRAY)
    canvas_obj.drawString(0.75 * inch, 0.45 * inch, "Secret Bite Web")
    canvas_obj.restoreState()


def build_pdf(path, story):
    doc = SimpleDocTemplate(str(path), pagesize=letter, rightMargin=0.72*inch, leftMargin=0.72*inch, topMargin=0.72*inch, bottomMargin=0.72*inch)
    doc.build(story, onFirstPage=footer, onLaterPages=footer)


def architecture_table_actual():
    data = [
        [P("Componente", "Smallx"), P("Evidencia en el repositorio", "Smallx"), P("Interpretación", "Smallx")],
        ["Cliente", "client/src/App.jsx y client/src/api.js", "SPA React que consume JSON por HTTP"],
        ["Servidor", "server/src/app.js", "API REST Express; rutas, validación y reglas concentradas"],
        ["Persistencia", "server/src/db.js y SQLite", "Esquema relacional; repositorio parcial"],
        ["Despliegue", "Un proceso Node y una base local", "Monolito desplegado como unidad"],
        ["Pruebas", "server/test/api.test.js", "Integración con SQLite en memoria, no puertos simulados"],
    ]
    return table(data, [1.05*inch, 2.25*inch, 3.35*inch])


def main_story():
    s = []
    s += [P("6 Prompt original y contexto de generación", "H1x")]
    s += [P("El código se generó en Codex para escritorio con agentes de arquitectura y desarrollo. La familia del modelo fue GPT-5; la versión exacta no quedó visible en el registro exportado. El prompt inicial indicó las tecnologías, pero no nombró un estilo arquitectónico ni pidió compararlo antes de programar.")]
    s += [P("Prompt inicial conservado", "H2x")]
    original = "Necesito realizar una aplicacion con javaScript en express y con react hooks donde podamos desarrollar el README que tenemos en la carpeta, si necesitas aclarar mas para empezar a utilizar el agente de arquitecto y el agente de desarrollo entonces me dices que informacion necesitas, ya hay varios archivos en la carpeta, tengo notas de voz, y tambien varias notas mas"
    s += [Preformatted(original, styles["Codex"])]
    s += [P("El pedido de React y Express determinó indirectamente una relación cliente-servidor. En cambio, la organización interna del backend quedó abierta. El agente arquitecto recomendó un monolito modular con capas y repositorios; el código generado conservó un monolito simple con separación técnica básica.")]

    s += [P("7 Consulta independiente sobre el código actual", "H1x")]
    s += [P("La consulta se realizó en un contexto separado y se contrastó con el repositorio. La respuesta identifica el estilo implementado y distingue la arquitectura actual de la arquitectura objetivo.")]
    s += [P("Pregunta", "H2x"), Preformatted("¿Qué estilo arquitectónico emplea este código, cómo se manifiesta y cuál debió emplearse frente a los escenarios de calidad de Secret Bite Web?", styles["Codex"])]
    s += [P("Respuesta documentada", "H2x")]
    s += [P("El código emplea una arquitectura cliente-servidor: una SPA React consume una API REST Express. El backend es un monolito con una base SQLite compartida. Existe una separación técnica básica entre presentación, API y persistencia, pero no un monolito modular formal. Autenticación, hamburguesas, campañas y votos no están aislados mediante módulos con interfaces públicas; además, varios handlers HTTP ejecutan SQL directamente. Por ello tampoco hay una arquitectura hexagonal completa.")]
    s += [architecture_table_actual(), P("Tabla 1. Evidencia del estilo implementado en el repositorio.", "Captionx")]
    s += [P("Para el MVP actual, el monolito simple mantiene bajo el costo de construcción. Para incorporar pedidos y otras capacidades sin degradar la mantenibilidad, el sistema debería evolucionar hacia un monolito modular cliente-servidor. Cada dominio tendría controller, service y repository propios, y la persistencia se aislaría mediante puertos y adaptadores. Microservicios y eventos añadirían complejidad operativa desproporcionada para el alcance y el equipo.")]

    s += [P("8 Contraste de decisiones arquitectónicas", "H1x")]
    contrast = [
        ["Aspecto", "Estilo empleado", "Estilo recomendado por la consulta", "Decisión previa del equipo"],
        ["Estilo principal", "Monolito simple con capas técnicas", "Monolito modular", "Monolito modular"],
        ["Distribución", "SPA React + API REST + SQLite", "Cliente-servidor", "Cliente-servidor"],
        ["Interior", "Rutas y reglas juntas en app.js; SQL también en handlers", "Controller-Service-Repository por dominio", "Capas por módulo y puertos selectivos"],
        ["Pruebas", "Integración con SQLite en memoria", "Reglas con repositorios falsos más integración real", "Núcleo aislado de la base"],
        ["Clasificación", "Cliente-servidor indicado indirectamente; monolito simple espontáneo", "Propuesto después de revisar código y escenarios", "Decisión documentada antes de la consulta"],
    ]
    s += [table(contrast, [1.05*inch, 1.75*inch, 2.0*inch, 1.85*inch], font=7.5), P("Tabla 2. Contraste entre el código, la consulta y la decisión del equipo.", "Captionx")]
    s += [P("La diferencia es verificable: el diseño del equipo y la recomendación del asistente coinciden en el objetivo modular, pero el código no materializa todavía esas fronteras. Pedir tecnologías no fue suficiente para obtener la estructura interna esperada.")]

    s += [P("9 Experimento de reformulación", "H1x")]
    s += [P("Se ejecutaron dos variantes aisladas con el mismo tipo de asistente y el mismo alcance: un esqueleto del módulo Votación. La primera pidió estudiar alternativas; la segunda impuso el estilo y reglas de dependencia.")]
    s += [P("Variante A estudio previo", "H2x")]
    prompt_a = "Antes de generar código, compara capas, monolito modular, microservicios y hexagonal frente a 500 votos concurrentes, p95 <= 2 s, rechazo de duplicados, autorización por roles, incorporación futura de Pedidos y pruebas sin base real. Elige y justifica el estilo. Luego genera el esqueleto del módulo Votación con JavaScript, Express y React."
    s += [Preformatted(prompt_a, styles["Codex"])]
    s += [P("Resultado. El asistente eligió un monolito modular con arquitectura hexagonal dentro de Votación. Propuso módulos de negocio, un puerto VoteRepository, un caso de uso CastVote, adaptador PostgreSQL, pruebas con un repositorio falso y una prueba de carga. También aclaró que p95 y cero votos perdidos deben medirse; la arquitectura por sí sola no los demuestra.")]
    s += [P("Variante B estilo explícito", "H2x")]
    prompt_b = "Genera el módulo Votación de Secret Bite con un monolito modular cliente-servidor. Dentro del módulo usa Controller -> Service -> Repository, define VoteRepository como puerto y adaptadores PostgreSQL y SQLite. Ningún controller ejecuta SQL. Conserva UNIQUE(user_id,campaign_id), 403 para CLIENT al crear campañas y pruebas de reglas sin base real."
    s += [Preformatted(prompt_b, styles["Codex"])]
    s += [P("Resultado. El asistente siguió la estructura pedida sin volver a debatir el estilo. Produjo una API pública del módulo, carpetas http, application, ports, infrastructure y domain, y separó adaptadores PostgreSQL y SQLite. La salida fue más determinista y más fácil de revisar contra reglas de dependencias.")]
    comparison = [
        ["Criterio", "Original", "Variante A estudia", "Variante B explícita"],
        ["Elección", "Monolito simple espontáneo", "Elige modular + hexagonal", "Aplica modular + capas + puerto"],
        ["Fronteras", "No verificables", "Propone módulos por negocio", "Nombra carpetas y dependencias permitidas"],
        ["SQL en handlers", "Sí", "Lo evita mediante repositorio", "Lo prohíbe expresamente"],
        ["Pruebas sin DB", "No; usa SQLite en memoria", "FakeVoteRepository", "InMemoryVoteRepository"],
        ["Riesgo", "Desviación respecto del diseño", "Puede elegir otra opción si cambian supuestos", "Puede obedecer un estilo inadecuado si el equipo se equivoca"],
    ]
    s += [table(comparison, [1.1*inch, 1.75*inch, 1.9*inch, 1.9*inch], font=7.7), P("Tabla 3. Comparación de las tres generaciones.", "Captionx")]

    s += [P("10 Conclusiones y recomendación", "H1x")]
    s += [bullet_items([
        "El asistente eligió espontáneamente un monolito simple porque el prompt original fijó tecnologías y alcance, pero no fronteras internas.",
        "Cuando se le pidió estudiar alternativas, eligió una combinación coherente con la decisión previa del equipo y explicó los compromisos.",
        "Cuando el estilo se indicó de forma explícita, la estructura fue más consistente y verificable: ningún controller ejecutó SQL y las reglas se probaron mediante puertos.",
        "La mejor estrategia combina ambos enfoques: pedir primero una comparación breve basada en escenarios y, después de aprobar la decisión, generar con reglas arquitectónicas explícitas y criterios de aceptación.",
    ])]
    s += [P("Recomendación de prompt", "H2x")]
    improved = "Analiza primero capas, monolito modular, microservicios y hexagonal frente a los escenarios de calidad adjuntos. Presenta una matriz corta y recomienda una opción, sin generar código. Tras la aprobación, implementa Secret Bite como SPA React + API REST Express en un monolito modular. Separa Usuarios, Catálogo, Campañas y Votación. Dentro de cada módulo usa route/controller/service/repository; los controllers no ejecutan SQL. Define puertos para persistencia, conserva UNIQUE(user_id,campaign_id), responde 403 a CLIENT al crear campañas y añade pruebas unitarias con repositorios falsos, integración concurrente y carga p95 < 2 s. Entrega árbol de archivos, decisiones, código y evidencia de pruebas."
    s += [Preformatted(improved, styles["Codex"])]
    s += [P("Limitaciones del experimento", "H2x")]
    s += [bullet_items([
        "Se evaluó un solo sistema y una sola familia de modelo.",
        "Las respuestas de un modelo generativo pueden variar entre ejecuciones.",
        "Las variantes produjeron esqueletos, no una segunda aplicación completa.",
        "El objetivo de 500 votos y p95 menor de dos segundos no se verificó con una prueba de carga en infraestructura productiva.",
        "Pedidos sigue siendo una capacidad futura; no está implementada en el MVP revisado.",
    ])]

    s += [P("11 Registro de uso de inteligencia artificial", "H1x")]
    log = [
        ["Herramienta", "Uso", "Versión registrada", "Verificación humana"],
        ["Codex escritorio", "Inspección del repositorio y desarrollo del MVP", "Familia GPT-5; versión exacta no visible", "Se ejecutaron build, seed y cuatro pruebas"],
        ["Agente documentador", "Comparó guía, PDF y código", "Misma plataforma; versión exacta no visible", "Se contrastaron rutas, esquema y pruebas"],
        ["Dos ejecuciones aisladas", "Variantes A y B del experimento", "Mismo tipo de agente", "Se compararon estructura, dependencias y limitaciones"],
    ]
    s += [table(log, [1.25*inch, 2.0*inch, 1.55*inch, 1.85*inch], font=7.8)]
    evolution = [
        ["Prompt", "Cambio principal", "Motivo"],
        ["Original", "Solo tecnologías y alcance", "Construir el MVP"],
        ["Consulta", "Entrega el código y pregunta estilo usado/debido", "Separar evidencia del código de la decisión previa"],
        ["Variante A", "Obliga a comparar antes de generar", "Evaluar si la IA razona la elección"],
        ["Variante B", "Fija estilo y reglas verificables", "Evaluar obediencia y consistencia estructural"],
        ["Mejorado", "Dos etapas: decisión aprobada y generación restringida", "Reducir decisiones implícitas y facilitar revisión"],
    ]
    s += [Spacer(1, 10), table(evolution, [1.05*inch, 3.25*inch, 2.35*inch], font=8), P("Tabla 4. Evolución de los prompts principales.", "Captionx")]

    s += [P("12 Ajustes pendientes antes de entregar", "H1x")]
    s += [bullet_items([
        "Completar institución, asignatura, docente, grupo y fecha en la portada.",
        "Confirmar los nombres y tildes de todos los integrantes y el tamaño real del equipo.",
        "Decidir si Pedidos pertenece al alcance evaluado o se presenta únicamente como evolución futura.",
        "Ajustar las métricas de los escenarios al ERS aprobado y no afirmar alta disponibilidad ni balanceo como funciones implementadas.",
        "Renderizar los diagramas de cada estilo en la primera parte; conservar su código Mermaid en anexos.",
        "Agregar capítulo o página de libros y norma ISO cuando el equipo tenga acceso a los ejemplares consultados.",
    ])]

    s += [P("Referencias complementarias", "H1x")]
    refs = [
        "Cockburn, A. (2005). Hexagonal architecture. https://alistair.cockburn.us/hexagonal-architecture/",
        "Fowler, M. (2017, 7 de febrero). What do you mean by event-driven? https://martinfowler.com/articles/201701-event-driven.html",
        "Lewis, J., & Fowler, M. (2014, 25 de marzo). Microservices. https://martinfowler.com/articles/microservices.html",
        "Microsoft. (s. f.). Common web application architectures. Microsoft Learn. https://learn.microsoft.com/en-us/dotnet/architecture/modern-web-apps-azure/common-web-application-architectures",
        "Svrtan, D., & Makagon, S. (2020, 10 de marzo). Ready for changes with hexagonal architecture. Netflix Technology Blog.",
        "Westeinde, K. (2019, 21 de febrero). Deconstructing the monolith. Shopify Engineering.",
    ]
    s += [bullet_items(refs)]
    return s


def appendix_story():
    s = [P("Anexos de la segunda parte", "DocTitle"), P("Transcripciones y fragmentos relevantes del experimento", "Subtitle"), PageBreak()]
    s += [P("Anexo A Instrucción operacional usada para generar el MVP", "H1x")]
    dev_prompt = "Implementa el MVP completo siguiendo la propuesta del agente arquitecto. Crea un proyecto ejecutable. Alcance: React Hooks + Vite SPA y Express API en JavaScript; usuarios con registro/login y roles CLIENT/ADMIN; burgers; campañas con candidatas; voto único por usuario/campaña; countdown; panel admin para CRUD esencial, campañas y estadísticas. Usa persistencia SQLite transaccional, conserva la restricción única y añade README, seed y pruebas críticas. No implementes reservas, pedidos, puntos ni WhatsApp."
    s += [Preformatted(dev_prompt, styles["Codex"])]
    s += [P("Anexo B Evidencia del código original", "H1x")]
    s += [Preformatted("client/src/App.jsx          SPA, autenticación y panel\nclient/src/api.js           cliente HTTP\nserver/src/app.js           rutas, JWT, roles, validación y SQL\nserver/src/db.js            esquema SQLite y consultas de campañas\nserver/test/api.test.js     concurrencia, cierre, roles y sesión", styles["Codex"])]
    s += [P("Restricción de integridad implementada", "H2x"), Preformatted("UNIQUE(user_id, campaign_id)\nBEGIN IMMEDIATE;\nINSERT INTO votes(user_id, campaign_id, burger_id) VALUES (?, ?, ?);\nCOMMIT;", styles["Codex"])]
    s += [P("Anexo C Fragmento representativo de la variante A", "H1x")]
    s += [Preformatted("modules/voting/\n  domain/vote.js\n  application/cast-vote.js\n  application/vote-repository.js\n  infrastructure/http/vote-router.js\n  infrastructure/persistence/pg-vote-repository.js", styles["Codex"])]
    s += [Preformatted("class CastVote {\n  constructor({ votes, campaigns, ids, clock }) {\n    Object.assign(this, { votes, campaigns, ids, clock });\n  }\n  async execute(input) {\n    const campaign = await this.campaigns.findOpenWithOption(input.campaignId, input.optionId);\n    if (!campaign) throw new CampaignUnavailableError();\n    const created = await this.votes.create({ ...input, id: this.ids.next(), createdAt: this.clock.now() });\n    if (!created) throw new DuplicateVoteError();\n    return created;\n  }\n}", styles["Codex"])]
    s += [P("Anexo D Fragmento representativo de la variante B", "H1x")]
    s += [Preformatted("modules/voting/\n  index.js\n  http/VoteController.js\n  application/VoteService.js\n  ports/VoteRepository.js\n  infrastructure/PostgresVoteRepository.js\n  infrastructure/SqliteVoteRepository.js\n  domain/errors.js", styles["Codex"])]
    s += [Preformatted("async createUnique(vote) {\n  const { rows } = await this.pool.query(\n    `INSERT INTO votes (user_id, campaign_id, option_id, created_at)\n     VALUES ($1,$2,$3,$4)\n     ON CONFLICT (user_id, campaign_id) DO NOTHING\n     RETURNING *`,\n    [vote.userId, vote.campaignId, vote.optionId, vote.createdAt]\n  );\n  return rows.length ? { created: true, vote: rows[0] } : { created: false };\n}", styles["Codex"])]
    s += [P("Anexo E Código Mermaid de la arquitectura objetivo", "H1x")]
    mermaid = """flowchart TB
  SPA[React SPA] -->|HTTPS JSON| API[Express API]
  subgraph MONO[Monolito modular]
    AUTH[Usuarios]
    CAT[Catalogo]
    CAMP[Campanas]
    VOTE[Votacion]
    VOTE --> VC[Controller]
    VC --> VS[Service]
    VS --> VR[VoteRepository port]
  end
  API --> AUTH
  API --> CAT
  API --> CAMP
  API --> VOTE
  VR --> PG[(PostgreSQL)]
  VR -. desarrollo .-> SQ[(SQLite)]
"""
    s += [Preformatted(mermaid, styles["Codex"])]
    s += [P("Anexo F Resultados verificables del MVP", "H1x")]
    s += [bullet_items([
        "TC-02: diez solicitudes concurrentes del mismo cliente dejan un único voto.",
        "TC-01: un voto emitido después del cierre es rechazado.",
        "TC-03: un usuario CLIENT no puede crear campañas y recibe 403.",
        "Registro, login y consulta del usuario autenticado funcionan en la prueba de integración.",
        "La compilación Vite terminó correctamente y el endpoint /api/health respondió ok.",
    ])]
    return s


def front_story(appendix_page):
    return [
        Spacer(1, 1.25*inch),
        P("Estilos arquitectónicos y selección justificada para Secret Bite Web", "DocTitle"),
        P("Documento integrado de consulta decisión arquitectónica y experimento con inteligencia artificial", "Subtitle"),
        Spacer(1, 0.55*inch),
        P("Sebastian Perlaza Villa", "Subtitle"),
        P("Sara Vanegas Garci", "Subtitle"),
        Spacer(1, 0.55*inch),
        P("Institución: [Completar]", "Subtitle"),
        P("Asignatura: [Completar]", "Subtitle"),
        P("Docente y grupo: [Completar]", "Subtitle"),
        P("Fecha de entrega: [Completar]", "Subtitle"),
        PageBreak(),
        P("Tabla de contenido", "DocTitle"),
        table([
            ["Sección", "Página"],
            ["Parte 1 Marco comparación fichas escenarios y selección", "3"],
            ["Parte 2 Prompt consulta contraste y experimento", "16"],
            ["Conclusiones registro de IA y ajustes pendientes", "18"],
            ["Anexos de la segunda parte", str(appendix_page)],
        ], [5.55*inch, 0.8*inch]),
        Spacer(1, 12),
        P("Nota de alcance", "H2x"),
        P("La primera parte se conserva tal como fue desarrollada por el equipo. La segunda parte contrasta esa decisión con el código real del MVP. Los campos académicos entre corchetes deben completarse antes de la entrega. Pedidos se trata como evolución futura porque no está implementado en el repositorio actual."),
    ]


main_pdf = TMP / "part2_main.pdf"
appendix_pdf = TMP / "appendices.pdf"
build_pdf(main_pdf, main_story())
build_pdf(appendix_pdf, appendix_story())
main_pages = len(PdfReader(str(main_pdf)).pages)
appendix_page = 16 + main_pages
front_pdf = TMP / "front.pdf"
build_pdf(front_pdf, front_story(appendix_page))

combined = PdfWriter()
for src in [front_pdf, SRC, main_pdf, appendix_pdf]:
    reader = PdfReader(str(src))
    for page in reader.pages:
        combined.add_page(page)

raw_path = TMP / "combined_raw.pdf"
with open(raw_path, "wb") as f:
    combined.write(f)

# Add consistent visible page numbers after merging.
reader = PdfReader(str(raw_path))
writer = PdfWriter()
for index, page in enumerate(reader.pages, 1):
    packet = BytesIO()
    c = canvas.Canvas(packet, pagesize=letter)
    c.setFont("Helvetica", 8)
    c.setFillColor(GRAY)
    c.drawRightString(PAGE_W - 0.45*inch, 0.3*inch, str(index))
    c.save()
    packet.seek(0)
    overlay = PdfReader(packet).pages[0]
    page.merge_page(overlay)
    writer.add_page(page)

final_path = OUT / "Secret Bite Estilos arquitectonicos actividad integrada.pdf"
with open(final_path, "wb") as f:
    writer.write(f)

print(final_path)
print(f"pages={len(writer.pages)}; part2_main={main_pages}; appendix_start={appendix_page}")
