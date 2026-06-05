# Planchas

Sitio para revisar las planchas finales, la presentacion y los renders del
proyecto Arquitectura de Paramo.

## Regla de fuente para planchas

Las cuatro planchas se tratan como PDFs originales. El sitio no contiene ni usa
imagenes, recortes, compresiones o PDFs derivados como reemplazo visual de las
planchas.

Los PDFs originales verificados localmente son:

| Plancha | Ruta local | Bytes | SHA-256 |
| --- | --- | ---: | --- |
| 1 | `E:\0 - Proyecto de Grado\DOCUMENTO\PLANCHAS\7\1.pdf` | 415824491 | `0459E951D6109819075A33393ED05FAF3DBEC3825B9870C1FEED0C367E51B3FF` |
| 2 | `E:\0 - Proyecto de Grado\DOCUMENTO\PLANCHAS\7\2.pdf` | 306117625 | `4C96CB64B6AD66EB58459DCD3F73562D4BA05F1BCA7B94BB5584CF09FDDB98D7` |
| 3 | `E:\0 - Proyecto de Grado\DOCUMENTO\PLANCHAS\7\3.pdf` | 242736165 | `7A8889BECA5AD60DD4B9B11173123084F47C53F37E9CC9F26DA10407A7B3BAF7` |
| 4 | `E:\0 - Proyecto de Grado\DOCUMENTO\PLANCHAS\7\4.pdf` | 145130720 | `57F399CAC69FE8F32E718C4074ACA5BAEB28001155CB1F3DA4768FFB9B92AF8A` |

Cloudflare Pages no debe alojar estos PDFs como assets del repo porque cada
asset de Pages tiene limite de 25 MiB. Los PDFs se publican como assets de la
release `original-pdfs` de GitHub y la Function `functions/pdf/[id].js` los
transmite como `application/pdf` con soporte de rangos.

## Desarrollo local

```powershell
& "C:\Users\OrangeErmine\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" .\server.local.cjs
```

Luego abre `http://localhost:4173`.

## Despliegue

Este sitio no requiere build. En Cloudflare Pages:

- Framework preset: `None`
- Build command: vacio
- Output directory: `/`
- Production branch: `main`

La Function `/pdf/:id` espera que los assets existan en:

```text
https://github.com/ArquiParamo/Planchas/releases/download/original-pdfs/1.pdf
https://github.com/ArquiParamo/Planchas/releases/download/original-pdfs/2.pdf
https://github.com/ArquiParamo/Planchas/releases/download/original-pdfs/3.pdf
https://github.com/ArquiParamo/Planchas/releases/download/original-pdfs/4.pdf
```
