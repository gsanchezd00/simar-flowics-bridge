# SIMAR → Flowics

Este puente abre el visor real de SIMAR con Playwright, cierra sus ventanas iniciales,
genera una captura 1920×1080 y la publica mediante GitHub Pages. Flowics carga la página
publicada en lugar de intentar embeber directamente el visor de SIMAR.

## Instalación

1. Crea un repositorio público nuevo en GitHub.
2. Sube todo el contenido de esta carpeta a la rama `main`.
3. En GitHub abre **Settings → Pages**.
4. En **Build and deployment → Source**, selecciona **GitHub Actions**.
5. Abre **Actions → Actualizar mapa SIMAR → Run workflow**.
6. Al terminar, abre la URL mostrada en el deployment de GitHub Pages.

La URL normalmente queda así:

`https://TU-USUARIO.github.io/NOMBRE-DEL-REPOSITORIO/`

## Flowics

En **Graphics Editor → External Content → Embedded Content**, pega la URL de GitHub Pages,
no la URL directa de SIMAR.

Configura el elemento a 1920×1080 o a 100% del canvas.

## Actualización

La captura se intenta actualizar dos veces por hora. La página recarga automáticamente
la imagen cada cinco minutos para evitar caché.

## Fuente

Primero se intenta abrir la liga solicitada:

`https://simar.conabio.gob.mx/explorer/?satsum=mcs-7days-modis`

Si el identificador antiguo no carga el producto, se utiliza el identificador vigente
del mismo producto Mean-AFAI de siete días:

`https://simar.conabio.gob.mx/explorer/?satsum=mean-7day-afai`
