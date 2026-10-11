#!/usr/bin/env node
// dist mirrors the repository layout because the package compiles the shared admission rule in src/trust/.
import { main } from "../dist/packages/verifier/src/cli.js";

process.exitCode = main(process.argv.slice(2));
