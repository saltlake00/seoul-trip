// www/ 를 채운다: 데이터 복사, Leaflet CSS·이미지 복사, src/main.js 묶기.
// 웹 페이지와 같은 data/trip.js를 쓰므로 일정을 고친 뒤 이 스크립트 → cap sync → 빌드 순서로 앱에 반영한다.
import { build } from "esbuild";
import { cpSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
mkdirSync(here("../www/data"), { recursive: true });
mkdirSync(here("../www/vendor/images"), { recursive: true });
cpSync(here("../../data/trip.js"), here("../www/data/trip.js"));
cpSync(here("../node_modules/leaflet/dist/leaflet.css"), here("../www/vendor/leaflet.css"));
cpSync(here("../node_modules/leaflet/dist/images"), here("../www/vendor/images"), { recursive: true });

await build({
  entryPoints: [here("../src/main.js")],
  bundle: true,
  format: "iife",
  target: ["chrome90"],
  outfile: here("../www/bundle.js"),
  minify: false,
  logLevel: "info",
});
