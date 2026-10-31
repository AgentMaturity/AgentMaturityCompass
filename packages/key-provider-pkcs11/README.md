# Optional AMC PKCS#11 loader

This package resolves `pkcs11js@2.1.7` only when AMC opens a configured PKCS#11 token. It has no production dependency, native code, build step, or private-key export API. Native token access remains optional; normal AMC installation does not install `pkcs11js` or this package.

For an explicitly selected PKCS#11 installation from this repository, install this directory and the pinned native binding together:

```sh
npm install --install-links /absolute/path/to/AgentMaturityCompass/packages/key-provider-pkcs11 pkcs11js@2.1.7
```

The native binding requires its normal build tools. Configure the token module and PIN through AMC's documented runtime environment variables. `src/keys/providers/pkcs11.ts` retains the five-provider contract, exact nonexportability checks, error redaction, signing, and wrapping behavior. Injected token fakes do not load this package.

The package is private and can be installed locally or packed as a local tarball. This change does not publish it.
