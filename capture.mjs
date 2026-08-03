import { chromium } from "playwright";
import fs from "node:fs/promises";

const OLD_URL =
  "https://simar.conabio.gob.mx/explorer/?satsum=mcs-7days-modis";
const CURRENT_URL =
  "https://simar.conabio.gob.mx/explorer/?satsum=mean-7day-afai";

await fs.mkdir("public", { recursive: true });

const browser = await chromium.launch({
  headless: true,
  args: [
    "--disable-dev-shm-usage",
    "--disable-gpu",
    "--no-sandbox",
    "--use-gl=swiftshader"
  ]
});

const context = await browser.newContext({
  viewport: { width: 1920, height: 1080 },
  deviceScaleFactor: 1,
  locale: "es-MX",
  timezoneId: "America/Mexico_City",
  serviceWorkers: "block"
});

const page = await context.newPage();
page.setDefaultTimeout(10000);

/*
 * Guarda las solicitudes que podrían contener la capa real del mapa:
 * WMS, WMTS, tiles, imágenes, XHR y fetch.
 */
const networkRequests = new Map();

const PRODUCT_WORDS =
  /mean-7day-afai|mcs-7days-modis|afai|sargazo|getmap|wms|wmts|geoserver|mapserver|raster|coverage|tile|tiles|arcgis|\.tif(?:f)?(?:\?|$)|\.nc(?:\?|$)|\.pbf(?:\?|$)/i;

function shouldKeep(url, resourceType, contentType = "") {
  if (!/^https?:\/\//i.test(url)) return false;

  return (
    PRODUCT_WORDS.test(url) ||
    ["xhr", "fetch", "image"].includes(resourceType) ||
    /^image\//i.test(contentType)
  );
}

function saveNetworkItem(item) {
  const previous = networkRequests.get(item.url) || {};
  networkRequests.set(item.url, {
    ...previous,
    ...item,
    likely_product: PRODUCT_WORDS.test(item.url),
    captured_at: new Date().toISOString()
  });
}

page.on("request", request => {
  const url = request.url();
  const resourceType = request.resourceType();

  if (!shouldKeep(url, resourceType)) return;

  saveNetworkItem({
    url,
    method: request.method(),
    resource_type: resourceType,
    status: null,
    content_type: null
  });
});

page.on("response", async response => {
  const request = response.request();
  const url = response.url();
  const resourceType = request.resourceType();

  const headers = await response.allHeaders().catch(() => ({}));
  const contentType = headers["content-type"] || "";

  if (!shouldKeep(url, resourceType, contentType)) return;

  saveNetworkItem({
    url,
    method: request.method(),
    resource_type: resourceType,
    status: response.status(),
    content_type: contentType
  });
});

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

  await clickVisibleText("Continuar");
  await clickVisibleText("Cerrar");
  await clickVisibleText("En otro momento");
  await clickVisibleText("Continuar explorando");

  await page.waitForTimeout(2500);
  await clickVisibleText("En otro momento");
  await clickVisibleText("Cerrar");

  await page
    .addStyleTag({
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
    })
    .catch(() => {});

  await page.waitForTimeout(12000);

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

if (!loaded) {
  console.log("Usando el identificador vigente del mismo producto.");
  await loadProduct(CURRENT_URL);
}

/* Da tiempo a que terminen las últimas respuestas del mapa. */
await page.waitForTimeout(2000);

await page.screenshot({
  path: "public/latest.jpg",
  type: "jpeg",
  quality: 92,
  fullPage: false
});

const requests = [...networkRequests.values()].sort((a, b) => {
  if (a.likely_product !== b.likely_product) {
    return Number(b.likely_product) - Number(a.likely_product);
  }

  return a.url.localeCompare(b.url);
});

await fs.writeFile(
  "public/requests.json",
  JSON.stringify(
    {
      generated_at: new Date().toISOString(),
      total: requests.length,
      requests
    },
    null,
    2
  ),
  "utf8"
);

const metadata = {
  generated_at: new Date().toISOString(),
  source_requested: OLD_URL,
  source_current: CURRENT_URL,
  captured_requests: requests.length
};

await fs.writeFile(
  "public/status.json",
  JSON.stringify(metadata, null, 2),
  "utf8"
);

console.log(`Solicitudes guardadas: ${requests.length}`);
console.log("Candidatas más probables:");

for (const item of requests.filter(x => x.likely_product).slice(0, 80)) {
  console.log(
    `[${item.status ?? "sin estado"}] [${item.resource_type}] ${item.url}`
  );
}

await browser.close();

console.log("Captura generada: public/latest.jpg");
console.log("Diagnóstico generado: public/requests.json");

