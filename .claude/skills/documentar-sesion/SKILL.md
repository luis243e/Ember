---
name: documentar-sesion
description: Documenta en la carpeta docs/ del repositorio lo que se hizo en la sesión de trabajo (decisiones, archivos explicados línea por línea, migraciones, errores y lecciones, pruebas y pendientes) y mantiene al día docs/README.md. Úsalo siempre que Luis diga "documenta la sesión", "cierra la sesión", "guarda lo que hicimos", "actualiza los docs" o algo parecido, y también al terminar un paso o una fase o justo antes de un commit de cierre, aunque no nombre el skill.
---

# Documentar la sesión

## Para qué existe

Luis aprende entendiendo sus proyectos: quiere poder releer qué se hizo, por qué
y cómo funciona cada pieza. Se considera principiante en backend, bases de
datos y despliegue. Además trabaja desde dos equipos y su vault de Obsidian no
se sincroniza entre ellos, así que la documentación tiene que vivir dentro del
repositorio para viajar con Git.

El resultado debe servirle a dos lectores: a Luis dentro de un mes, que ya no
recuerda los detalles, y a quien retome el trabajo en el otro equipo sin haber
visto esta conversación.

## Estructura

```
docs/
├── README.md                          índice vivo: estado, reglas, pendientes
└── sesiones/
    └── AAAA-MM-DD-tema-corto.md       un archivo por sesión
```

- El nombre del archivo lleva la fecha y un tema en minúsculas con guiones,
  por ejemplo `2026-10-05-auth-better-auth.md`.
- Si ya existe un archivo de hoy con el mismo tema, amplíalo en vez de crear
  otro. Si el tema es distinto, crea uno nuevo.
- Los archivos de sesiones anteriores son un registro histórico: no los
  reescribas. Si algo de una sesión vieja resultó estar mal, corrígelo en la
  sesión nueva y menciona cuál corrige. El único archivo que se mantiene
  siempre al día es `docs/README.md`.

## Pasos

### 1. Reúne lo que pasó

Combina dos fuentes, porque ninguna basta sola:

- **La conversación**: decisiones, motivos, errores, lo que Luis aprobó o
  rechazó. Esto no aparece en ningún diff.
- **El repositorio**: `git status`, `git diff` (incluye lo que esté en stage),
  y `git log` desde la última sesión documentada. Esto evita olvidar archivos
  y evita afirmar cosas que no ocurrieron.

Lee también `docs/README.md` para saber de qué estado se partía y qué
pendientes había.

### 2. Escribe el archivo de la sesión

Usa esta plantilla. Omite las secciones que no apliquen en lugar de dejarlas
vacías o con "no aplica".

```markdown
---
fecha: AAAA-MM-DD
fase: <fase o etapa del proyecto>
tags: [<proyecto>, <temas>]
---

# Sesión AAAA-MM-DD: <título>

## Resumen
Dos a cuatro frases: qué funciona ahora que antes no funcionaba.

## Decisiones y por qué
Cada decisión con su motivo y la alternativa que se descartó.

## Qué se hizo, paso a paso
En orden. Incluye los comandos ejecutados y qué hace cada uno.

## Archivos nuevos y modificados
Código explicado (ver "Cómo explicar el código").

## Base de datos
Migraciones por nombre, qué hace su SQL, y RLS de las tablas nuevas.

## Variables de entorno
Nombre y para qué sirve cada una. Nunca el valor.

## Errores y lecciones
Mensaje de error, causa, cómo se resolvió y qué regla deja para el futuro.

## Pruebas
Qué se probó y con qué resultado. Distingue lo que probaste tú de lo que
probó Luis en el navegador, y marca lo que quedó sin probar.

## Pendientes
Lo que quedó abierto, con el contexto mínimo para retomarlo.

## Para retomar en otro equipo
Pasos concretos: traer el código, instalar dependencias, variables que hay
que añadir al .env local, y el comando para comprobar que todo quedó bien.
```

### 3. Actualiza docs/README.md

Mantén estas secciones:

```markdown
# Documentación de <proyecto>

## Estado actual
Qué funciona hoy, en pocas líneas.

## Cómo arrancar en un equipo nuevo
Pasos y nombres de las variables de entorno necesarias.

## Reglas del proyecto
Convenciones acordadas que hay que respetar (versiones fijadas, cómo se
hacen las migraciones, etc.), cada una con su motivo en una línea.

## Pendientes
Lista única y actualizada: marca lo resuelto y añade lo nuevo.

## Sesiones
| Fecha | Tema | Archivo |
```

Añade una fila a la tabla de sesiones, actualiza el estado, mueve los
pendientes resueltos y, si en la sesión se acordó una regla nueva, anótala.

### 4. Copia opcional a Obsidian

Si el vault de Obsidian de Luis es accesible en este equipo y ya tiene una
carpeta del proyecto, copia ahí la nota de la sesión siguiendo el formato de
sus otras notas. Si no es accesible, no lo intentes más: díselo en una línea.
La versión de `docs/` es la que manda.

### 5. Informa a Luis

Dile qué archivos creaste o cambiaste y recuérdale hacer el commit. No hagas
commit ni push tú: Luis los hace a mano.

## Cómo explicar el código

- **Archivos nuevos:** línea por línea. Muestra un bloque corto de código y
  debajo explica qué hace y por qué está ahí. Agrupa las líneas triviales
  (varios imports parecidos, etiquetas HTML repetidas) en una sola explicación.
- **Archivos modificados:** explica solo lo que cambió, con el antes y el
  después cuando ayude a entenderlo.
- **Conceptos:** la primera vez que aparezca un término (migración, hash,
  cookie de sesión, Server Action), explícalo en una frase sencilla antes de
  usarlo. Si ya está explicado en una sesión anterior, enlaza a ese archivo en
  vez de repetirlo.
- **El porqué importa más que el qué.** "Va fuera del try porque redirect
  funciona lanzando un error" enseña; "llama a redirect" no.
- Escribe en español y en lenguaje llano. Los nombres de código se dejan como
  están en el código.

## Cuidados

- **Nada de secretos.** `docs/` se sube a Git y el repositorio puede ser
  público. No copies valores de `.env`, cadenas de conexión, contraseñas,
  tokens ni claves: solo los nombres de las variables. Si un error o una
  salida de terminal contiene alguno, recórtalo antes de pegarlo.
- **Solo lo que pasó.** Documenta lo que puedes respaldar con la conversación
  o con el repositorio. Si algo no se probó, dilo. No atribuyas a Luis pruebas
  o decisiones que no hizo.
- **Solo escribes en docs/** (y en el vault, si aplica). Este skill no cambia
  código, no ejecuta migraciones y no instala nada.
- **Largo proporcional.** Una sesión de solo planificación puede ocupar veinte
  líneas. No rellenes.

## Si docs/ todavía no existe

Crea la estructura y escribe el `README.md` inicial reconstruyendo el estado
actual a partir del repositorio: `package.json`, el esquema de la base, las
migraciones y el historial de Git. No inventes sesiones pasadas que no puedas
verificar. Si Luis tiene notas anteriores del proyecto (por ejemplo, en su
vault), pregúntale dónde están e impórtalas una sola vez como primera entrada,
indicando de dónde salieron.
