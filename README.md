# Kitchen Tales

Aplicație personală (telefon, tabletă, web) cu două părți:

- **Rețete**: listă cu căutare și categorii, adăugare și editare cu poză, ingrediente și pași, import din text lipit.
- **Povești**: bibliotecă pentru copii cu player mare, încărcare fișiere audio sau înregistrare cu vocea ta.

Datele se păstrează local pe dispozitiv (IndexedDB) și aplicația merge și fără internet (PWA, se poate instala pe ecranul principal). Sincronizarea între dispozitive prin AWS Amplify urmează.

## Rulare

```bash
npm install
npm run dev     # dezvoltare
npm run build   # versiunea de producție în dist/
```
