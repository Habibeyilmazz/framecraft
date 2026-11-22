# Security

framecraft is a static page with no server, no accounts and no uploads: images stay in your browser tab. Its
security problems are therefore about what it lets out of that tab, or what a crafted input can make it do.

## In scope

- A redaction (Blur, Pixelate, Cover) that leaves covered pixels recoverable from an exported PNG or a copied image.
- A share link or saved template that runs script, breaks the Content-Security-Policy, or freezes the tab.
- Anything that sends an image, a snippet or a design to a third party.

## Reporting

Please do not put details of an unfixed problem in a public issue. Private vulnerability reporting is not switched
on for this repository yet, so open an issue titled "Security contact request" with no details, and the maintainer
will reply with a private way to send them.

Only the latest `main` is supported; there are no release branches.
