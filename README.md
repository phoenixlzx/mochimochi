# Mochimochi

Mochi is delicious. Nom nom nom.

### Why

Ask Epic why they made their launcher so hard to use.

Update: it is even worse with fab. Hey Epic, your launcher is a browser. Why it can't just display the damn page IN THE LAUNCHER?!

And you even provided API for asset details (this line is my TODO):
`https://www.fab.com/i/listings/<ListingIdentifier>`

### Notice

This is for personal or internal team use only.

Please respect EULA/MDA from EpicGames.

### Usage

Copy `config.mjs.example` to `config.mjs` and fill in the information required.

##### CLI

```
    mochi auth
      Login and authorize your Epic Account.

    mochi vault
      Download current vault data and save to disk.

    mochi manifest
      Download manifest for all assets in vault library.

    mochi download <identifier>
      Download asset according to identifier.
      Identifier can be:
      - catalogItemId
      - AppNameString
      - Manifest file (with or without extension)
      - "all" to download all assets available.

    mochi archive <AppNameString>
      Archive downloaded <AppNameString> asset to a ZIP file.
```

##### Web

1. `./mochi vault && ./mochi manifest && ./mochi detail`
2. `./mochi server`
3. Set your web root to `public` directory and visit it from browser.

**Do not** expose it to the open Internet.

### License

MIT
