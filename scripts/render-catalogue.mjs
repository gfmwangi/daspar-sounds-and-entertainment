import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { PRODUCTS } from "../client/src/data/products.js";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const htmlPath = path.resolve(scriptDir, "../client/products.html");
const htmlEscape = (value = "") => String(value).replace(/[&<>"']/g, (char) => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
})[char]);
const photoUrl = (file) => `%BASE_URL%assets/products/${encodeURIComponent(file)}`;
const stockLabel = (availability) => ({
  in_stock: "Available",
  out_of_stock: "Unavailable",
  pending: "Status not listed",
}[availability] || "Status not listed");
const whatsappFor = (product) => {
  const message = `Hello Daspar Sounds and Entertainment, I would like to inquire about ${product.name}. Please share the current price and delivery information.`;
  return `https://wa.me/254745494350?text=${encodeURIComponent(message)}`;
};

const cards = PRODUCTS.map((product) => {
  const image = product.images[0];
  const summary = product.description || "Contact DASPAR for product details and current pricing.";
  return `
      <article class="product-card">
        <button class="product-card__media" type="button" data-open-product="${htmlEscape(product.id)}" aria-label="View details for ${htmlEscape(product.name)}">
          <img class="product-card__image" src="${htmlEscape(photoUrl(image))}" alt="${htmlEscape(product.name)}" loading="lazy" decoding="async">
        </button>
        <div class="product-card__body">
          <div class="product-card__meta"><span class="category-label">${htmlEscape(product.categoryLabel)}</span><span class="stock-label"><i></i> ${htmlEscape(stockLabel(product.availability))}</span></div>
          <h3>${htmlEscape(product.name)}</h3>
          <p>${htmlEscape(summary)}</p>
          <p class="product-card__price-note">Contact us for the current price.</p>
          <div class="product-card__actions"><a class="button button--small button--whatsapp" href="${htmlEscape(whatsappFor(product))}" target="_blank" rel="noopener noreferrer">WhatsApp inquiry <span aria-hidden="true">↗</span></a><button class="button button--small button--primary" type="button" data-open-product="${htmlEscape(product.id)}">View details <span aria-hidden="true">↗</span></button></div>
        </div>
      </article>`;
}).join("\n");

let html = await readFile(htmlPath, "utf8");
const startMarker = "<!-- CATALOGUE_LISTINGS_START -->";
const endMarker = "<!-- CATALOGUE_LISTINGS_END -->";
const start = html.indexOf(startMarker);
const end = html.indexOf(endMarker);
if (start < 0 || end < 0 || end < start || html.indexOf(startMarker, start + 1) >= 0 || html.indexOf(endMarker, end + 1) >= 0) {
  throw new Error("Expected one valid catalogue-listings marker pair in client/products.html");
}
html = `${html.slice(0, start + startMarker.length)}\n${cards}\n${html.slice(end)}`;
const countStartMarker = "<!-- CATALOGUE_PRODUCT_COUNT_START -->";
const countEndMarker = "<!-- CATALOGUE_PRODUCT_COUNT_END -->";
const countStart = html.indexOf(countStartMarker);
const countEnd = html.indexOf(countEndMarker, countStart + countStartMarker.length);
if (countStart < 0 || countEnd < 0 || html.indexOf(countStartMarker, countStart + 1) >= 0 || html.indexOf(countEndMarker, countEnd + 1) >= 0) {
  throw new Error("Expected one valid product-count marker pair in client/products.html");
}
const countText = `${PRODUCTS.length} ${PRODUCTS.length === 1 ? "product" : "products"}`;
html = `${html.slice(0, countStart + countStartMarker.length)}${countText}${html.slice(countEnd)}`;
await writeFile(htmlPath, html, "utf8");
console.log(`Rendered ${PRODUCTS.length} catalogue products into ${path.relative(process.cwd(), htmlPath)}.`);
