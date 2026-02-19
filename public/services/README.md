# Fotky ke sluzbam

Nahravej zdrojove fotky do `../img_dilna` nebo `../img_dílna` (mimo `frontend`).

Pri `npm run dev` a `npm run build` se automaticky spusti konverze do WebP:
- skript: `frontend/scripts/sync-service-images.mjs`
- vystup: `frontend/public/services/...`

## Zdrojove slozky (aktualni mapovani)

- `img_dilna/go_motoru_landrover_2017` -> `public/services/motory/go-motoru-XX.webp`
- `img_dilna/repas_turbo` -> `public/services/motory/repas-motoru-XX.webp`
- `img_dilna/repas_automat_b6` -> `public/services/prevodovky/repas-automat-XX.webp`
- `img_dilna/renovace_mercedes_coupe` -> `public/services/karoserie-lakovani/renovace-mercedes-XX.webp`

## Rucni spusteni konverze

```bash
npm run media:sync
```
