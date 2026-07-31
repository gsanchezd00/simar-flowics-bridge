import { chromium } from "playwright";
import fs from "node:fs/promises";

const OLD_URL =
  "https://simar.conabio.gob.mx/explorer/?satsum=mcs-7days-modis";
const CURRENT_URL =
  "https://simar.conabio.gob.mx/explorer/?satsum=mean-7day-afai";

const browser = await chromium.launch({
  headless: true,
  args: [
    "--disable-dev-shm-usage",
    "--disable-gpu",
    "--no-sandbox",
    "--use-gl=swiftshader"
  ]
});

const page = await browser.newPage({
  viewport: { width: 1920, height: 1080 },
  deviceScaleFactor: 1,
  locale: "es-MX",
  timezoneId: "America/Mexico_City"
});

page.setDefaultTimeout(10000);

async function clickVisibleText(text) {
  const candidates = [
    page.getByRole("button", { name: text, exact: false }),
    page.getByText(text, { exact: false })
  ];

  for (const locator of candidates) {
    try {
      const first = locator.first();
      if (await first.isVisible({ timeout: 2500 })) {
        await first.click({ force: true });
        await page.waitForTimeout(800);
        return true;
      }
    } catch {}
  }
  return false;
}

async function loadProduct(url) {
  console.log(`Abriendo: ${url}`);
  await page.goto(url, {
    waitUntil: "domcontentloaded",
    timeout: 90000
  });

  await page.waitForTimeout(7000);

  // Cierra la bienvenida y el recorrido inicial de SIMAR.
  await clickVisibleText("Continuar");
  await clickVisibleText("Cerrar");
  await clickVisibleText("En otro momento");
  await clickVisibleText("Continuar explorando");

  // Reintenta porque algunos diálogos aparecen en cadena.
  await page.waitForTimeout(2500);
  await clickVisibleText("En otro momento");
  await clickVisibleText("Cerrar");

  // Oculta overlays residuales sin tocar el mapa/canvas.
  await page.addStyleTag({
    content: `
      [class*="modal-backdrop"],
      [class*="tour"],
      [class*="welcome"],
      [id*="welcome"],
      [id*="tour"] {
        display: none !important;
      }
      html, body {
        margin: 0 !important;
        overflow: hidden !important;
        background: #06131f !important;
      }
    `
  }).catch(() => {});

  await page.waitForTimeout(12000);

  // Detecta si el producto actual apareció en el DOM.
  const bodyText = await page.locator("body").innerText().catch(() => "");
  const looksLoaded =
    /AFAI|Algas Flotantes|Mean-AFAI|sargazo/i.test(bodyText) ||
    (await page.locator("canvas").count()) > 0;

  return looksLoaded;
}

let loaded = false;
try {
  loaded = await loadProduct(OLD_URL);
} catch (error) {
  console.warn("La liga antigua falló:", error.message);
}

// SIMAR renombró la capa. Se conserva la liga solicitada como primer intento,
// pero se usa el identificador vigente si el alias antiguo no carga el producto.
if (!loaded) {
  console.log("Usando el identificador vigente del mismo producto.");
  await loadProduct(CURRENT_URL);
}

await fs.mkdir("public", { recursive: true });
await page.screenshot({
  path: "public/latest.jpg",
  type: "jpeg",
  quality: 92,
  fullPage: false
});

const metadata = {
  generated_at: new Date().toISOString(),
  source_requested: OLD_URL,
  source_current: CURRENT_URL
};
await fs.writeFile(
  "public/status.json",
  JSON.stringify(metadata, null, 2),
  "utf8"
);

await browser.close();
console.log("Captura generada: public/latest.jpg");
