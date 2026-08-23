"""
Genera el plan de pruebas funcionales en .docx.

El documento va dirigido a quien prueba a mano, no a quien programa: casos
numerados, credenciales, pasos y resultado esperado, con espacio para marcar.

    python docs/generar-plan-funcional.py
"""

from docx import Document
from docx.shared import Pt, Cm, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.oxml.ns import qn
from docx.oxml import OxmlElement

# ── Marca ────────────────────────────────────────────────────────
INK = RGBColor(0x1D, 0x1D, 0x1B)
LIME_HEX = 'E7E226'
GREY = RGBColor(0x6A, 0x6A, 0x66)
DANGER = RGBColor(0xB0, 0x3A, 0x2E)

doc = Document()

# Márgenes y tipografía base
for s in doc.sections:
    s.top_margin = s.bottom_margin = Cm(2)
    s.left_margin = s.right_margin = Cm(2)

normal = doc.styles['Normal']
normal.font.name = 'Calibri'
normal.font.size = Pt(10)
normal.paragraph_format.space_after = Pt(6)


def sombrear(celda, hex_color):
    tc = celda._tc.get_or_add_tcPr()
    sombra = OxmlElement('w:shd')
    sombra.set(qn('w:val'), 'clear')
    sombra.set(qn('w:fill'), hex_color)
    tc.append(sombra)


def titulo(texto, nivel=1):
    h = doc.add_heading(texto, level=nivel)
    for r in h.runs:
        r.font.color.rgb = INK
        r.font.name = 'Calibri'
    return h


def parrafo(texto, gris=False, negrita=False, size=10):
    p = doc.add_paragraph()
    r = p.add_run(texto)
    r.font.size = Pt(size)
    r.bold = negrita
    if gris:
        r.font.color.rgb = GREY
    return p


def nota(texto):
    p = doc.add_paragraph()
    p.paragraph_format.left_indent = Cm(0.4)
    r = p.add_run(texto)
    r.font.size = Pt(9)
    r.italic = True
    r.font.color.rgb = GREY
    return p


def tabla(cabeceras, filas, anchos=None):
    t = doc.add_table(rows=1, cols=len(cabeceras))
    t.style = 'Table Grid'
    t.alignment = WD_TABLE_ALIGNMENT.LEFT
    hdr = t.rows[0].cells
    for i, h in enumerate(cabeceras):
        hdr[i].text = ''
        run = hdr[i].paragraphs[0].add_run(h)
        run.bold = True
        run.font.size = Pt(9)
        sombrear(hdr[i], LIME_HEX)
    for fila in filas:
        celdas = t.add_row().cells
        for i, v in enumerate(fila):
            celdas[i].text = ''
            run = celdas[i].paragraphs[0].add_run(str(v))
            run.font.size = Pt(9)
    if anchos:
        for fila in t.rows:
            for i, w in enumerate(anchos):
                fila.cells[i].width = Cm(w)
    doc.add_paragraph()
    return t


# ════════════════════════════════════════════════════════════════
#  Portada
# ════════════════════════════════════════════════════════════════
p = doc.add_paragraph()
p.alignment = WD_ALIGN_PARAGRAPH.LEFT
r = p.add_run('ETERCLACK')
r.bold = True
r.font.size = Pt(26)
r.font.color.rgb = INK

p = doc.add_paragraph()
r = p.add_run('FOTOGRAFÍA Y VIDEO')
r.font.size = Pt(8)
r.font.color.rgb = GREY

doc.add_paragraph()
titulo('Plan de pruebas funcionales', 0)
parrafo(
    'Guion para probar la plataforma a mano. Cada caso indica quién lo ejecuta, qué hace y qué '
    'debe pasar. Los casos marcados como NEGATIVOS deben FALLAR: si pasan, hay un defecto.',
    gris=True,
)

tabla(
    ['Campo', 'Valor'],
    [
        ['Versión', 'Fases 0 a 4 (identidad, descubrimiento, calendario, reserva, contrato, PWA)'],
        ['Entorno', 'Local en Docker · o el despliegue temporal en Render'],
        ['Fuera de alcance', 'Galerías y entrega, pagos con Wompi, dispersión, correo propio'],
        ['Duración estimada', '90 minutos el recorrido completo'],
    ],
    anchos=[4, 13],
)

# ════════════════════════════════════════════════════════════════
titulo('1. Antes de empezar')

parrafo('Direcciones', negrita=True)
tabla(
    ['Qué', 'Local', 'Render'],
    [
        ['Aplicación', 'http://localhost:5173', 'https://<tu-servicio>.onrender.com'],
        ['Correos recibidos', 'http://localhost:8025 (Mailpit)', 'La bandeja real del destinatario'],
        ['Salud de la API', 'http://localhost:3000/health', 'https://<tu-servicio>.onrender.com/health'],
    ],
    anchos=[4.5, 6.5, 6],
)

nota(
    'En Render el servicio gratuito se duerme tras 15 minutos sin uso. La primera petición '
    'puede tardar entre 30 y 60 segundos en responder: no es un fallo.'
)

parrafo('Credenciales', negrita=True)
parrafo('Todas usan la misma contraseña: ', gris=True)
p = doc.add_paragraph()
r = p.add_run('Eterclack123*')
r.bold = True
r.font.size = Pt(12)
r.font.name = 'Consolas'

tabla(
    ['Correo', 'Rol', 'Estado', 'Para qué sirve'],
    [
        ['admin@eterclack.test', 'Administración', 'Activo', 'Aprobar, rechazar y suspender fotógrafos'],
        ['maria@eterclack.test', 'Fotógrafa', 'Aprobada · con agenda', 'Recibir reservas, publicar calendario'],
        ['andres@eterclack.test', 'Fotógrafo', 'Aprobado · con agenda', 'Segundo fotógrafo para comparar'],
        ['laura@eterclack.test', 'Fotógrafa', 'Aprobada · con agenda', 'Tercer fotógrafo'],
        ['carlos@eterclack.test', 'Fotógrafo', 'PENDIENTE de revisión', 'Probar el flujo de aprobación'],
        ['sofia@eterclack.test', 'Fotógrafa', 'RECHAZADA', 'Probar el motivo de rechazo y la repostulación'],
        ['juliana@eterclack.test', 'Cliente', 'Verificada', 'Reservar citas'],
        ['daniel@eterclack.test', 'Cliente', 'Verificada', 'Probar que no ve datos de Juliana'],
        ['valentina@eterclack.test', 'Cliente', 'Verificada', 'Tercer cliente'],
    ],
    anchos=[5, 3.2, 4, 5],
)

nota(
    'Los tres estados de fotógrafo (aprobado, pendiente, rechazado) están sembrados a propósito: '
    'permiten probar el ciclo de aprobación sin tener que crear cuentas nuevas.'
)

doc.add_page_break()

# ════════════════════════════════════════════════════════════════
titulo('2. Cómo registrar los resultados')
parrafo(
    'Marca cada caso con OK o FALLA. Si falla, anota qué viste exactamente y en qué paso. '
    'Un caso a medias cuenta como falla.'
)
tabla(
    ['Caso', 'Resultado', 'Observación'],
    [['CP-01', '', ''], ['CP-02', '', ''], ['…', '', '']],
    anchos=[3, 3, 11],
)
nota('Copia esta tabla al final del documento y llénala mientras pruebas.')

# ════════════════════════════════════════════════════════════════
CASOS = [
    (
        '3. Cuenta y acceso',
        'Cliente nuevo',
        [
            ('CP-01', 'Registro de cliente',
             '1. Abre la aplicación y pulsa «Crear cuenta».\n'
             '2. Elige «Contratar».\n'
             '3. Llena nombre, un correo nuevo y una contraseña de 8+ caracteres.\n'
             '4. Marca la casilla de términos y envía.',
             'Entra a la aplicación. Aparece un aviso amarillo arriba pidiendo confirmar el correo.'),

            ('CP-02', 'Contraseña muy corta',
             'Repite CP-01 pero con una contraseña de 5 caracteres.',
             'NEGATIVO. No deja crear la cuenta. Bajo el campo aparece «La contraseña debe tener '
             'al menos 8 caracteres».'),

            ('CP-03', 'Correo repetido',
             'Intenta registrarte con juliana@eterclack.test.',
             'NEGATIVO. Mensaje indicando que ese correo ya tiene cuenta. No se crea un segundo usuario.'),

            ('CP-04', 'Verificación por correo',
             '1. Abre Mailpit (local) o tu bandeja.\n'
             '2. Busca «Confirma tu correo en EterClack».\n'
             '3. Pulsa «Confirmar mi correo».',
             'El aviso amarillo desaparece. El correo llega con los colores de la marca: fondo '
             'oscuro, botón amarillo, esquinas de visor.'),

            ('CP-05', 'Reusar el enlace de verificación',
             'Vuelve a abrir el mismo enlace del correo.',
             'NEGATIVO. «El enlace no es válido o ya venció». Un enlace se usa una sola vez.'),

            ('CP-06', 'Ingreso correcto',
             'Cierra sesión e ingresa con juliana@eterclack.test.',
             'Entra y aparece su nombre arriba a la derecha.'),

            ('CP-07', 'Contraseña incorrecta',
             'Ingresa con juliana@eterclack.test y la contraseña «loquesea».',
             'NEGATIVO. «Correo o contraseña incorrectos». Debe ser el MISMO mensaje que con un '
             'correo inexistente: la plataforma no revela qué correos están registrados.'),

            ('CP-08', 'Recuperar contraseña',
             '1. En el ingreso, pulsa «¿Olvidaste tu contraseña?».\n'
             '2. Escribe juliana@eterclack.test.\n'
             '3. Abre el correo y crea una contraseña nueva.\n'
             '4. Ingresa con la nueva.',
             'Funciona con la nueva contraseña. La anterior deja de servir.'),

            ('CP-09', 'Recuperar con correo inexistente',
             'Repite CP-08 con noexiste@ejemplo.com.',
             'Muestra el MISMO mensaje de confirmación que con un correo real. No llega ningún '
             'correo. Así no se puede averiguar quién tiene cuenta.'),
        ],
    ),
    (
        '4. Descubrimiento',
        'Cualquiera, sin necesidad de cuenta',
        [
            ('CP-10', 'Ver la portada',
             'Abre la aplicación sin iniciar sesión.',
             'Se ve la portada con «Tu momento, para siempre», las especialidades y los cuatro pasos.'),

            ('CP-11', 'Buscar fotógrafos',
             'Pulsa «Fotógrafos» en el menú.',
             'Aparecen 3 fotógrafos aprobados, cada uno con tres fotos de su portafolio, sus '
             'etiquetas y su precio desde.'),

            ('CP-12', 'Filtrar por especialidad',
             'En el filtro de especialidad elige «Bodas».',
             'Queda solo María Gómez. El contador dice «1 fotógrafo».'),

            ('CP-13', 'Filtrar por zona',
             'Limpia los filtros y elige la zona «Medellín».',
             'Queda solo Andrés Rueda.'),

            ('CP-14', 'Filtrar por presupuesto',
             'Limpia y pulsa «Hasta $500.000».',
             'Queda solo Andrés Rueda ($450.000). Los de mayor precio desaparecen.'),

            ('CP-15', 'Combinar filtros sin resultados',
             'Elige especialidad «Bodas» y zona «Medellín» a la vez.',
             'Aparece «Nada por aquí» con un botón para limpiar los filtros. No una pantalla en blanco.'),

            ('CP-16', 'Ver la ficha',
             'Limpia los filtros y abre María Gómez.',
             'Se ven su biografía, los TRES productos con precio y contenido, y el portafolio completo.'),

            ('CP-17', 'Fotógrafo pendiente no aparece',
             'Busca «Carlos» en el buscador.',
             'NEGATIVO. Cero resultados. Carlos está pendiente de aprobación y no debe ser visible.'),

            ('CP-18', 'URL directa a un pendiente',
             'Escribe en el navegador la dirección .../fotografos/carlos-duarte',
             'NEGATIVO. «Ese fotógrafo no está disponible». No se puede saltar la aprobación '
             'conociendo la dirección.'),
        ],
    ),
    (
        '5. Reserva de cita',
        'Cliente: juliana@eterclack.test',
        [
            ('CP-19', 'Reservar requiere cuenta',
             'Sin iniciar sesión, abre una ficha y pulsa «Solicitar fecha».',
             'Aparece una pantalla pidiendo ingresar o crear cuenta. No deja continuar.'),

            ('CP-20', 'Reservar requiere correo verificado',
             'Con la cuenta creada en CP-01 SIN verificar, intenta reservar.',
             'NEGATIVO. Pide confirmar el correo antes de apartar una fecha.'),

            ('CP-21', 'Los tres productos',
             'Ingresa como Juliana, abre María Gómez y pulsa «Solicitar fecha».',
             'Paso 01 muestra exactamente tres productos: Económico, Medio y Premium. El del '
             'medio lleva la etiqueta «Más elegido». Cada uno muestra qué incluye, horas, fotos '
             'y días de entrega.'),

            ('CP-22', 'Calendario con disponibilidad',
             'Mira el paso 02.',
             'Solo los días con cupo se pueden pulsar. Los demás están apagados. Los días con '
             'cupo llevan puntos amarillos abajo (uno por franja).'),

            ('CP-23', 'Elegir franja',
             'Pulsa un día con cupo.',
             'A la derecha aparecen las franjas de ese día: Mañana, Tarde o Jornada completa.'),

            ('CP-24', 'No se puede reservar sin elegir todo',
             'Elige solo el producto, sin fecha.',
             'El botón «Apartar esta fecha» queda deshabilitado. El resumen dice «Sin elegir».'),

            ('CP-25', 'Reserva completa',
             '1. Elige el producto Medio.\n'
             '2. Elige un día y una franja.\n'
             '3. Escribe una nota (opcional).\n'
             '4. Pulsa «Apartar esta fecha».',
             'Va a la pantalla de la orden. El código empieza por ETC-. El estado dice «Falta '
             'aceptar contrato». El precio es exactamente el del producto elegido.'),

            ('CP-26', 'La fecha desaparece del calendario',
             'Vuelve a la ficha de María y entra otra vez a reservar.',
             'La franja que acabas de tomar ya NO aparece disponible.'),

            ('CP-27', 'Dos personas, la misma fecha',
             '1. Abre otra ventana en modo incógnito.\n'
             '2. Ingresa como daniel@eterclack.test.\n'
             '3. Intenta reservar exactamente la misma franja.',
             'NEGATIVO. «Alguien acaba de tomar esa fecha. Elige otra del calendario.» '
             'Solo una reserva puede ganar.'),

            ('CP-28', 'Correos de la reserva',
             'Revisa la bandeja.',
             'Dos correos: a la fotógrafa «Nueva cita: …» con fecha, franja, producto y valor; '
             'al cliente «Reservamos tu fecha» avisando que tiene 24 horas para confirmar.'),
        ],
    ),
    (
        '6. Contrato',
        'Cliente: juliana@eterclack.test',
        [
            ('CP-29', 'Leer el contrato',
             'En la pantalla de la orden, baja hasta «Contrato».',
             'El texto tiene los datos reales resueltos: nombres de las dos partes, fecha, lugar, '
             'paquete y valor. NO deben quedar cosas como {{cliente}} o {{valor}}.'),

            ('CP-30', 'No se acepta sin marcar',
             'Escribe tu nombre pero no marques la casilla.',
             'El botón «Aceptar contrato» sigue deshabilitado.'),

            ('CP-31', 'Aceptar el contrato',
             '1. Escribe tu nombre completo.\n'
             '2. Marca la casilla.\n'
             '3. Pulsa «Aceptar contrato».',
             'Aparece «Evidencia de aceptación» con el nombre que escribiste, la fecha y hora, y '
             'la versión de la plantilla. El estado de la orden pasa a «Pago pendiente».'),

            ('CP-32', 'No se acepta dos veces',
             'Recarga la página e intenta aceptar de nuevo.',
             'NEGATIVO. Ya no aparece el formulario, solo la evidencia. El contrato aceptado no se toca.'),

            ('CP-33', 'Correo de contrato',
             'Revisa la bandeja de ambas partes.',
             'Las dos reciben «Contrato aceptado · Orden ETC-…».'),
        ],
    ),
    (
        '7. Panel del fotógrafo',
        'Fotógrafa: maria@eterclack.test',
        [
            ('CP-34', 'Ver la cita recibida',
             'Ingresa como María y entra a «Mis citas».',
             'Aparece la reserva de Juliana. Muestra «Recibes» con el valor NETO, ya descontada '
             'la comisión del 15 %.'),

            ('CP-35', 'La cuenta cuadra',
             'Abre el detalle de la orden y suma.',
             'Comisión + lo que recibe = valor total, exacto. Sin céntimos perdidos.'),

            ('CP-36', 'Ver el calendario',
             'Entra a «Calendario».',
             'Se ven los días publicados, los que tienen cita (en verde) y el conteo de cada uno. '
             'A la derecha aparece la próxima cita con el nombre del cliente.'),

            ('CP-37', 'Publicar disponibilidad',
             '1. Elige «Jornada completa» a la derecha.\n'
             '2. Pulsa 3 días futuros en el calendario.\n'
             '3. Pulsa «Publicar disponibilidad».',
             'Los tres días quedan publicados. Si abres la ficha pública de María, esos días ya '
             'aparecen disponibles para reservar.'),

            ('CP-38', 'Retirar disponibilidad',
             'Selecciona un día publicado SIN cita y pulsa «Retirar».',
             'Desaparece del calendario público.'),

            ('CP-39', 'No se retira un día con cita',
             'Intenta seleccionar y retirar el día que reservó Juliana.',
             'NEGATIVO. Ese día no se puede seleccionar, o avisa que tiene una cita. Cancelar una '
             'reserva es otra operación, no se hace desde aquí.'),

            ('CP-40', 'Editar el perfil',
             'Entra a «Mi perfil», cambia el titular y guarda.',
             'Aparece «Cambios guardados». El cambio se ve en la ficha pública.'),
        ],
    ),
    (
        '8. Administración',
        'admin@eterclack.test',
        [
            ('CP-41', 'Ver los indicadores',
             'Ingresa como admin.',
             'Cuatro indicadores: clientes activos, fotógrafos publicados, pendientes de revisión '
             '(en amarillo si hay) y correos fallidos.'),

            ('CP-42', 'Revisar un pendiente',
             'En la pestaña «Pendientes», mira la ficha de Carlos Duarte.',
             'Se ve su correo, titular, biografía, especialidades, zonas, cuántas imágenes tiene '
             'y cuándo se postuló.'),

            ('CP-43', 'Aprobar un fotógrafo',
             'Pulsa «Aprobar» en Carlos Duarte.',
             'Sale de pendientes. Si buscas «Carlos» en la búsqueda pública, AHORA sí aparece. '
             'Le llega el correo «¡Tu perfil fue aprobado!».'),

            ('CP-44', 'Rechazo sin motivo suficiente',
             'En otro fotógrafo, pulsa «Rechazar» y escribe solo «no».',
             'NEGATIVO. Exige al menos 10 caracteres. El fotógrafo tiene derecho a saber qué corregir.'),

            ('CP-45', 'Rechazar con motivo',
             'Escribe un motivo real y confirma.',
             'Pasa a «Rechazados». Le llega un correo con el motivo textual.'),

            ('CP-46', 'El rechazado ve el motivo',
             'Cierra sesión, ingresa como sofia@eterclack.test.',
             'En su panel ve el estado «Requiere ajustes» con el motivo, y un botón «Volver a '
             'postularme».'),

            ('CP-47', 'Repostularse',
             'Pulsa «Volver a postularme».',
             'Su estado vuelve a «En revisión» y reaparece en la lista de pendientes del admin.'),

            ('CP-48', 'Suspender',
             'Como admin, en «Aprobados», suspende a uno.',
             'Deja de aparecer en la búsqueda pública inmediatamente.'),
        ],
    ),
    (
        '9. Seguridad',
        'Estos casos DEBEN fallar. Si alguno pasa, hay una fuga de datos.',
        [
            ('CP-49', 'Ver la orden de otro cliente',
             '1. Como Juliana, copia la dirección de tu orden (…/ordenes/xxxx).\n'
             '2. Cierra sesión, ingresa como daniel@eterclack.test.\n'
             '3. Pega esa dirección.',
             'NEGATIVO CRÍTICO. No debe mostrar los datos. Debe dar error de permiso.'),

            ('CP-50', 'Cliente entra al panel de admin',
             'Como Juliana, escribe la dirección .../admin',
             'NEGATIVO. Te devuelve al inicio. No debe verse ni un instante el contenido.'),

            ('CP-51', 'Cliente entra al panel de fotógrafo',
             'Como Juliana, escribe .../panel/agenda',
             'NEGATIVO. Te devuelve al inicio.'),

            ('CP-52', 'Fotógrafo entra al panel de admin',
             'Como María, escribe .../admin',
             'NEGATIVO. Te devuelve al inicio.'),

            ('CP-53', 'Fotógrafo acepta el contrato del cliente',
             'Como María, abre la orden de Juliana.',
             'Puede VER la orden (es suya también) pero NO aparece el formulario para aceptar el '
             'contrato. Eso solo lo hace el cliente.'),

            ('CP-54', 'Cambiar contraseña cierra las sesiones',
             '1. Ingresa como Juliana en dos navegadores.\n'
             '2. En uno, cambia la contraseña por recuperación.\n'
             '3. Recarga en el otro.',
             'El segundo navegador queda desconectado. Cambiar la contraseña revoca todas las sesiones.'),
        ],
    ),
    (
        '10. Móvil y app instalable',
        'Con un teléfono real, no el emulador del navegador',
        [
            ('CP-55', 'Navegación en móvil',
             'Abre la aplicación en el teléfono.',
             'El menú aparece plegado (icono de tres líneas). Al abrirlo se ven las opciones de tu rol.'),

            ('CP-56', 'Nada se sale de la pantalla',
             'Recorre todas las pantallas deslizando.',
             'La página NUNCA se desliza hacia los lados. Solo hacia abajo.'),

            ('CP-57', 'Todo se puede tocar',
             'Intenta pulsar los enlaces del pie, los filtros y los días del calendario con el dedo.',
             'Todo se pulsa a la primera. Nada exige precisión de uña.'),

            ('CP-58', 'Reservar desde el móvil',
             'Haz una reserva completa desde el teléfono.',
             'Los tres productos se apilan uno debajo de otro. El calendario se ve completo. '
             'Se puede completar la reserva.'),

            ('CP-59', 'Los campos no hacen zoom',
             'Toca un campo de texto en iPhone.',
             'La pantalla NO hace zoom automático al enfocar.'),

            ('CP-60', 'Instalar la app',
             'En Chrome, menú → «Instalar aplicación». En iPhone, Compartir → «Añadir a inicio».',
             'Queda un icono con la marca. Al abrirlo, la app arranca a pantalla completa, sin '
             'barra de direcciones.'),

            ('CP-61', 'Sin conexión',
             '1. Abre la app instalada.\n'
             '2. Activa el modo avión.\n'
             '3. Recarga.',
             'Carga la estructura de la app, no la pantalla de error del navegador.'),

            ('CP-62', 'Sin conexión NO finge que funciona',
             'En modo avión, intenta hacer una reserva.',
             'NEGATIVO ESPERADO. Debe FALLAR con un error visible. Nunca debe decir que reservó: '
             'una reserva falsa es peor que un error.'),
        ],
    ),
]

for seccion, quien, casos in CASOS:
    doc.add_page_break()
    titulo(seccion)
    parrafo(quien, gris=True)
    for cid, nombre, pasos, esperado in casos:
        p = doc.add_paragraph()
        r = p.add_run(f'{cid} · {nombre}')
        r.bold = True
        r.font.size = Pt(11)
        r.font.color.rgb = DANGER if 'NEGATIVO' in esperado else INK

        tabla(
            ['Pasos', 'Resultado esperado'],
            [[pasos, esperado]],
            anchos=[8.2, 8.8],
        )

# ════════════════════════════════════════════════════════════════
doc.add_page_break()
titulo('11. Hoja de resultados')
parrafo('Marca cada caso. Un caso a medias cuenta como falla.', gris=True)

todos = [(cid, nombre) for _, _, casos in CASOS for cid, nombre, _, _ in casos]
tabla(
    ['Caso', 'Qué prueba', 'OK / Falla', 'Observación'],
    [[cid, nombre, '', ''] for cid, nombre in todos],
    anchos=[2, 6.5, 2.5, 6],
)

doc.add_page_break()
titulo('12. Qué NO se prueba todavía')
parrafo(
    'Estas funciones no están construidas. Si alguien las busca durante la prueba, no las va a '
    'encontrar, y eso es lo esperado:'
)
tabla(
    ['Función', 'Fase', 'Estado'],
    [
        ['Galerías de fotos y entrega al cliente', '5', 'Sin construir'],
        ['Pago real con Wompi', '6', 'Sin construir — el botón está deshabilitado'],
        ['Dispersión del dinero al fotógrafo', '7', 'Sin construir'],
        ['Servidor de correo propio', '8', 'Sin construir — hoy se usa Mailpit o un relay'],
        ['Despliegue en Hostinger', '9', 'Sin hacer — Render es temporal'],
    ],
    anchos=[8, 2, 7],
)

nota(
    'El estado de la orden llega hasta «Pago pendiente» y ahí se detiene. Es correcto: el cobro '
    'entra en la fase 6.'
)

doc.save('docs/EterClack - Plan de pruebas funcionales.docx')
print('✓ docs/EterClack - Plan de pruebas funcionales.docx')
print(f'  {len(todos)} casos de prueba en {len(CASOS)} secciones')
