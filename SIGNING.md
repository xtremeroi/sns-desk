# Code signing & notarization

Unsigned builds trip macOS Gatekeeper ("Apple could not verify…"), forcing
every user through a Privacy & Security override. Signing with an Apple
Developer ID + notarizing removes that entirely: the app opens like any normal
Mac app.

The build is already wired for it. All that's missing is the certificate and
notarization credentials, which come from an Apple Developer account.

## One-time setup (account owner)

### 1. Enroll in the Apple Developer Program
- https://developer.apple.com/programs/enroll — $99/year.
- **Individual** enrollment is fastest (often same day). The signature then
  reads "Developer ID Application: <Your Name>". Organization enrollment needs
  a D-U-N-S number and takes days; not necessary for an internal tool.

### 2. Create a "Developer ID Application" certificate (no Xcode needed)
1. Open **Keychain Access** → menu **Certificate Assistant → Request a
   Certificate from a Certificate Authority**. Enter your email, leave CA email
   blank, choose **Saved to disk**. This makes a `CertificateSigningRequest.certSigningRequest`.
2. Go to https://developer.apple.com/account/resources/certificates → **+** →
   **Developer ID Application** → upload the CSR → download the `.cer`.
3. Double-click the downloaded `.cer` to install it into your **login** keychain.
   (Verify: `security find-identity -v -p codesigning` lists a
   "Developer ID Application: …" identity.)

### 3. Get your Team ID
- https://developer.apple.com/account → **Membership** → **Team ID** (10 chars,
  e.g. `A1B2C3D4E5`). Individual accounts have one too.

### 4. Create an app-specific password (for notarization)
- https://account.apple.com → **Sign-In & Security → App-Specific Passwords** →
  generate one, label it "notarization". Looks like `abcd-efgh-ijkl-mnop`.

## Building a signed + notarized release

With the certificate in your keychain, set three env vars and run `dist:release`:

```bash
export APPLE_ID="you@example.com"                 # your Apple ID email
export APPLE_APP_SPECIFIC_PASSWORD="abcd-efgh-ijkl-mnop"
export APPLE_TEAM_ID="A1B2C3D4E5"
npm run dist:release
```

electron-builder signs with the Developer ID cert (auto-discovered from the
keychain), then submits to Apple's notary service and staples the ticket. The
resulting `dist/S&S Desk-<version>-universal.dmg` opens with no Gatekeeper
warning on any Mac.

**Secrets:** the app-specific password is a credential — keep it out of git and
out of the repo. Pass it via the environment as above (or a local, gitignored
`.env` you source), never commit it.

## Dev builds (unsigned)

`npm run dist` stays unsigned for fast local iteration — no cert or credentials
required. Only `dist:release` signs and notarizes.
