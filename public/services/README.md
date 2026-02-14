# Fotky ke službám

Do této složky můžeš ukládat vlastní fotky pro jednotlivé sekce služeb.

## Doporučená struktura

- `frontend/public/services/motory/`
- `frontend/public/services/prevodovky/`
- `frontend/public/services/autoelektrika-diagnostika/`
- `frontend/public/services/kodovani/`
- `frontend/public/services/podvozky/`
- `frontend/public/services/geometrie/`
- `frontend/public/services/klimatizace/`
- `frontend/public/services/karoserie-lakovani/`

## Jak je zobrazit na webu

Uprav pole `gallery` v `frontend/src/data/services.ts`.

Příklad:

```ts
gallery: [
  "/services/motory/go-1.jpg",
  "/services/motory/go-2.jpg",
  "/services/motory/go-3.jpg",
]
```
